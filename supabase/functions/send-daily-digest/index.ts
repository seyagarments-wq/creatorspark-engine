import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[DAILY-DIGEST] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

// Retired. This digest only ever reported required-day standing (met/missed days, forfeit
// warnings, "next required day"). That program no longer exists: pay is $65 per approved
// video and nothing a creator has earned can be forfeited. The function stays deployed as a
// no-op so any stale invocation returns cleanly instead of sending outdated copy.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  log("Skipped: retired");
  return new Response(
    JSON.stringify({ skipped: true, reason: "retired: required-day program removed" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
