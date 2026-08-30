import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[REQUIRED-DAY-REMINDER] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const dow = new Date().getUTCDay(); // 0=Sun..6=Sat
    // Required: Tue(2), Thu(4), Sat(6)
    if (![2, 4, 6].includes(dow)) {
      log("Not a required day, skipping", { dow });
      return new Response(JSON.stringify({ success: true, skipped: "not required day" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dayName = ["Sun", "Mon", "Tuesday", "Wed", "Thursday", "Fri", "Saturday"][dow];

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
            title: `🎯 ${dayName} = required upload day`,
            message: `You need 4 APPROVED videos today (5 for full credit). Rejected videos don't count. Miss this day and it counts toward your 3-strike monthly limit. Get them in early — review takes time.`,
            notification_type: "video",
            link: "/creator/submit",
          }),
        });
        sent++;
      } catch (e) {
        log("Error", { user: r.user_id, error: String(e) });
      }
    }

    log("Complete", { sent, dayName });
    return new Response(JSON.stringify({ success: true, sent, dayName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
