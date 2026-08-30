import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[REQUIRED-DAY-STATUS] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const now = new Date();
    const dow = now.getUTCDay();
    if (![2, 4, 6].includes(dow)) {
      return new Response(JSON.stringify({ success: true, skipped: "not required day" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = now.toISOString().slice(0, 10);

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

        const { data: status } = await supabase
          .from("creator_daily_upload_status")
          .select("approved_count, required_count")
          .eq("creator_id", profile.id)
          .eq("date", today)
          .maybeSingle();

        const approved = status?.approved_count ?? 0;
        const required = status?.required_count ?? 4;

        let title: string;
        let message: string;
        if (approved >= required) {
          title = "✅ Day complete — locked in";
          message = `You hit ${approved}/${required} approved today. That's how you stay eligible. Next required day: ${dow === 2 ? "Thursday" : dow === 4 ? "Saturday" : "Tuesday"}.`;
        } else {
          const short = required - approved;
          title = `⚠️ ${approved}/${required} approved — short ${short}`;
          message = `Today closes at midnight UTC. You're ${short} approved short. If this day flips to MISSED, it counts toward your 3-strike monthly limit. Hit 3 misses = no commission this month, no rollover.`;
        }

        await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            user_id: r.user_id,
            title,
            message,
            notification_type: "video",
            link: "/creator/calendar",
          }),
        });
        sent++;
      } catch (e) {
        log("Error", { user: r.user_id, error: String(e) });
      }
    }

    log("Complete", { sent });
    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
