import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { HttpError } from "../_shared/payout-guard.ts";
import { requirePayoutCaller } from "../_shared/payout-auth.ts";
import {
  PAYOUT_SELECT,
  RAIL_PROFILE_SELECT,
  assertPayable,
  assertRailReady,
  disbursePayout,
  disbursementReference,
  markPayoutPaid,
  notifyCreatorPaid,
  railFor,
  type PayoutRow,
  type RailProfile,
} from "../_shared/payout-rails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[PROCESS-PAYOUT] ${step}${detailsStr}`);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Pays ONE payout row on the creator's chosen rail (profiles.payout_method: stripe or paypal).
 * A human presses Pay; nothing calls this on a schedule.
 *
 * Order: move the money, then mark the row paid. If the row update fails after the money moved,
 * this returns 500 WITH the provider id so an admin can reconcile by hand. The video_earnings
 * ledger is flipped to paid by a database trigger, not here.
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

    const body = await req.json().catch(() => null);
    const payoutId = body?.payout_id ?? body?.payoutId;
    if (!payoutId || typeof payoutId !== "string") throw new HttpError(400, "payout_id is required");
    logStep("Processing payout", { payoutId });

    const { data: payout, error: payoutError } = await supabaseClient
      .from("payouts")
      .select(PAYOUT_SELECT)
      .eq("id", payoutId)
      .maybeSingle();
    if (payoutError) throw new Error(`Payout fetch error: ${payoutError.message}`);
    if (!payout) throw new HttpError(404, "Payout not found");
    const row = payout as unknown as PayoutRow;
    logStep("Payout fetched", { payoutId: row.id, status: row.status, type: row.payout_type });

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select(RAIL_PROFILE_SELECT)
      .eq("id", row.creator_id)
      .maybeSingle();
    if (profileError) throw new Error(`Profile fetch error: ${profileError.message}`);
    if (!profile) throw new HttpError(404, "Creator profile not found");
    const creator = profile as unknown as RailProfile;

    assertPayable(row);
    const rail = railFor(creator);
    assertRailReady(creator, rail);
    logStep("Rail selected", { rail, creator: creator.full_name });

    // 1. Move the money. The live-key guard runs inside, before any provider call.
    const disbursement = await disbursePayout(row, creator, rail);
    logStep("Money sent", { reference: disbursementReference(disbursement) });

    // 2. Mark the row paid. A failure here is loud and returns the provider id.
    const { error: updateError } = await markPayoutPaid(supabaseClient, row.id, disbursement);
    if (updateError) {
      const ref = disbursementReference(disbursement);
      console.error(
        `[PROCESS-PAYOUT] RECONCILE NEEDED: ${ref} was sent for payout ${row.id} but the row could not be marked paid: ${updateError.message}`,
      );
      return json(
        {
          error:
            `Money was sent (${ref}) but the payout row could not be updated: ${updateError.message}. ` +
            `Mark payout ${row.id} paid by hand with this id.`,
          payout_id: row.id,
          rail,
          transfer_id: disbursement.stripe_transfer_id,
          paypal_batch_id: disbursement.paypal_batch_id,
          needs_reconciliation: true,
        },
        500,
      );
    }
    logStep("Payout updated to paid");

    await notifyCreatorPaid(supabaseClient, creator, row, disbursement);

    return json({
      success: true,
      rail,
      transfer_id: disbursement.stripe_transfer_id,
      paypal_batch_id: disbursement.paypal_batch_id,
      amount: disbursement.amount,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { status, message });
    return json({ error: message }, status);
  }
});
