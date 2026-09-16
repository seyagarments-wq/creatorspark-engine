import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { HttpError } from "../_shared/payout-guard.ts";
import { requirePayoutCaller } from "../_shared/payout-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[PAYOUT-CYCLE] ${step}${detailsStr}`);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens due payouts by calling the SQL function open_due_payouts. Nothing here pays anyone:
 * rows open as `pending` for an admin to review and press Pay. The same SQL runs daily from
 * pg_cron; this endpoint is the on-demand path (the admin Dry run button, or a server calling
 * with the service role key).
 *
 * Body: { dryRun?: boolean, creatorId?: uuid }. Returns { dryRun, rows } where rows is the
 * table open_due_payouts returns (one row per creator period, with an `action` column).
 *
 * verify_jwt is off for this function, so the caller check below is the only auth.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Auth first: service role key, or a user JWT belonging to an admin. Nothing else.
    const caller = await requirePayoutCaller(req, supabase, { allowServiceRole: true });
    logStep("Caller authenticated", caller);

    if (req.method !== "POST") throw new HttpError(405, "Use POST.");

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const creatorIdRaw = body?.creatorId ?? body?.creator_id ?? null;
    if (creatorIdRaw !== null && (typeof creatorIdRaw !== "string" || !UUID_RE.test(creatorIdRaw))) {
      throw new HttpError(400, "creatorId must be a UUID.");
    }
    const creatorId: string | null = creatorIdRaw;

    logStep("Opening due payouts", { dryRun, creatorId });
    const { data, error } = await supabase.rpc("open_due_payouts", {
      p_dry_run: dryRun,
      p_creator_id: creatorId,
    });
    if (error) throw new Error(`open_due_payouts failed: ${error.message}`);

    const rows = Array.isArray(data) ? data : [];
    logStep("Done", { dryRun, rows: rows.length });
    return json({ dryRun, rows });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { status, message });
    return json({ error: message }, status);
  }
});
