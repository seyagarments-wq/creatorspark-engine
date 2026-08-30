import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[MONTHLY-RULES-RECAP] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

function countRequiredDays(year: number, month: number): number {
  // month is 0-indexed (JS Date convention). Counts Tue/Thu/Sat days.
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= last; d++) {
    const dow = new Date(Date.UTC(year, month, d)).getUTCDay();
    if (dow === 2 || dow === 4 || dow === 6) count++;
  }
  return count;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const now = new Date();
    const monthName = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    const requiredDays = countRequiredDays(now.getUTCFullYear(), now.getUTCMonth());

    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "creator");
    if (!roles?.length) return new Response(JSON.stringify({ success: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let sent = 0;
    for (const r of roles) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", r.user_id)
          .eq("status", "active")
          .eq("stripe_onboarding_complete", true)
          .single();
        if (!profile) continue;

        await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            user_id: r.user_id,
            title: `🎯 Fresh slate — welcome to ${monthName}`,
            message: `Board's been wiped. ${requiredDays} required upload days this month (Tue/Thu/Sat). Rules: 4 approved videos minimum per required day. 3 missed days max — hit a 4th and you forfeit this month's commission. No rollover. Make this your best month yet.`,
            notification_type: "general",
            link: "/creator/calendar",
          }),
        });
        sent++;
      } catch (e) {
        log("Error", { user: r.user_id, error: String(e) });
      }
    }

    log("Complete", { sent, requiredDays });
    return new Response(JSON.stringify({ success: true, sent, requiredDays }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
