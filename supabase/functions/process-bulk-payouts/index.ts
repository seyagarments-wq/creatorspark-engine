import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { HttpError, assertPayPalEnvAllowed, LivePayoutsDisabledError } from "../_shared/payout-guard.ts";
import { requirePayoutCaller } from "../_shared/payout-auth.ts";
import { getPayPalCredentials } from "../_shared/paypal.ts";
import {
  PAYOUT_SELECT,
  RAIL_PROFILE_SELECT,
  assertPayable,
  assertRailReady,
  disbursePayout,
  disbursementReference,
  getStripeClient,
  markPayoutPaid,
  notifyCreatorPaid,
  railFor,
  type PayoutRail,
  type PayoutRow,
  type RailClients,
  type RailProfile,
} from "../_shared/payout-rails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[PROCESS-BULK-PAYOUTS] ${step}${detailsStr}`);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface PayoutResult {
  payout_id: string;
  creator_name: string;
  amount: number;
  payout_type: string;
  rail: PayoutRail | null;
  success: boolean;
  error?: string;
  transfer_id?: string;
  paypal_batch_id?: string;
  /** Money moved but the row could not be marked paid. Fix by hand with the id above. */
  needs_reconciliation?: boolean;
}

/**
 * Pays every pending/approved payout that has no transfer or batch id yet, each on its
 * creator's chosen rail (Stripe or PayPal). Body may pass { payoutIds: string[] } to restrict
 * the batch. A human presses Bulk pay; nothing calls this on a schedule.
 *
 * Per row: move the money, then mark the row paid. A row whose update fails after the money
 * moved is reported with needs_reconciliation and its provider id, never hidden. The live-key
 * guard runs once per rail BEFORE any money moves; if it trips, the whole batch is refused.
 *
 * verify_jwt is off for this function, so the admin check below is the only auth.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Admin only. No service-role branch here: a payment is always a person pressing Pay.
    const caller = await requirePayoutCaller(req, supabaseClient);
    logStep("Admin authenticated", { userId: caller.kind === "admin" ? caller.userId : caller.kind });

    const body = await req.json().catch(() => ({}));
    const payoutIds: string[] | null = Array.isArray(body?.payoutIds)
      ? body.payoutIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : null;
    if (payoutIds && payoutIds.length === 0) {
      throw new HttpError(400, "payoutIds must not be empty when provided.");
    }

    let query = supabaseClient
      .from("payouts")
      .select(PAYOUT_SELECT)
      .in("status", ["approved", "pending"])
      .is("stripe_transfer_id", null)
      .is("paypal_batch_id", null);
    if (payoutIds) query = query.in("id", payoutIds);

    const { data: payoutsToProcess, error: payoutsError } = await query;
    if (payoutsError) throw new Error(`Failed to fetch payouts: ${payoutsError.message}`);

    const rows = (payoutsToProcess ?? []) as unknown as PayoutRow[];
    if (rows.length === 0) {
      return json({
        message: "No pending payouts to process",
        processed: 0,
        successful: 0,
        failed: 0,
        needs_reconciliation: 0,
        total_amount: 0,
        results: [],
      });
    }
    logStep("Found payouts to process", { count: rows.length, restricted: !!payoutIds });

    const creatorIds = [...new Set(rows.map((p) => p.creator_id))];
    const { data: creators, error: creatorsError } = await supabaseClient
      .from("profiles")
      .select(RAIL_PROFILE_SELECT)
      .in("id", creatorIds);
    if (creatorsError) throw new Error(`Failed to fetch creators: ${creatorsError.message}`);
    const creatorMap = new Map<string, RailProfile>(
      ((creators ?? []) as unknown as RailProfile[]).map((c) => [c.id, c]),
    );

    // Set up each rail this batch needs ONCE, and run its live guard before any money moves.
    // A guard trip refuses the whole batch (403). A missing credential only fails that rail's rows.
    const railsNeeded = new Set<PayoutRail>();
    for (const p of rows) {
      const c = creatorMap.get(p.creator_id);
      if (c) railsNeeded.add(railFor(c));
    }
    const clients: RailClients = {};
    const railSetupError: Partial<Record<PayoutRail, string>> = {};
    if (railsNeeded.has("stripe")) {
      try {
        clients.stripe = await getStripeClient();
      } catch (e) {
        if (e instanceof LivePayoutsDisabledError) throw e;
        railSetupError.stripe = e instanceof Error ? e.message : String(e);
      }
    }
    if (railsNeeded.has("paypal")) {
      assertPayPalEnvAllowed();
      try {
        clients.paypal = await getPayPalCredentials();
      } catch (e) {
        railSetupError.paypal = e instanceof Error ? e.message : String(e);
      }
    }
    logStep("Rails ready", { rails: [...railsNeeded], setupErrors: railSetupError });

    const results: PayoutResult[] = [];
    let successful = 0;
    let failed = 0;
    let needsReconciliation = 0;

    for (const payout of rows) {
      const creator = creatorMap.get(payout.creator_id);
      const result: PayoutResult = {
        payout_id: payout.id,
        creator_name: creator?.full_name || "Unknown",
        amount: parseFloat(String(payout.amount)) || 0,
        payout_type: payout.payout_type,
        rail: creator ? railFor(creator) : null,
        success: false,
      };

      try {
        if (!creator) throw new Error("Creator profile not found");
        const rail = railFor(creator);
        assertPayable(payout);
        assertRailReady(creator, rail);
        const setupError = railSetupError[rail];
        if (setupError) throw new Error(setupError);

        // 1. Move the money.
        const d = await disbursePayout(payout, creator, rail, clients);
        result.amount = d.amount;
        result.transfer_id = d.stripe_transfer_id;
        result.paypal_batch_id = d.paypal_batch_id;
        logStep("Money sent", { payoutId: payout.id, reference: disbursementReference(d) });

        // 2. Mark the row paid. Loud on failure, and the id stays on the result.
        const { error: updateError } = await markPayoutPaid(supabaseClient, payout.id, d);
        if (updateError) {
          const ref = disbursementReference(d);
          console.error(
            `[PROCESS-BULK-PAYOUTS] RECONCILE NEEDED: ${ref} was sent for payout ${payout.id} but the row could not be marked paid: ${updateError.message}`,
          );
          result.error =
            `Money was sent (${ref}) but the payout row could not be updated: ${updateError.message}. ` +
            "Mark this payout paid by hand with this id.";
          result.needs_reconciliation = true;
          needsReconciliation++;
          results.push(result);
          continue;
        }

        result.success = true;
        successful++;
        await notifyCreatorPaid(supabaseClient, creator, payout, d);
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        failed++;
        logStep("Payout failed", { payoutId: payout.id, error: result.error });
      }

      results.push(result);
    }

    const totalAmount = results.filter((r) => r.success).reduce((sum, r) => sum + r.amount, 0);
    logStep("Bulk processing complete", { successful, failed, needsReconciliation, totalAmount });

    return json({
      message: `Processed ${rows.length} payouts`,
      processed: rows.length,
      successful,
      failed,
      needs_reconciliation: needsReconciliation,
      total_amount: totalAmount,
      results,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { status, message });
    return json({ error: message }, status);
  }
});
