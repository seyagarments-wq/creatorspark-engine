import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[CREATOR-REMOVAL] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

interface RemovalRequest {
  action: "removed" | "at_risk";
  creator_name: string;
  creator_user_id?: string;
  creator_profile_id?: string;
  reason?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ") && authHeader.split(" ")[1] !== supabaseServiceKey) {
      const token = authHeader.split(" ")[1];
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();
      if (!role) {
        return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const body: RemovalRequest = await req.json();
    logStep("Request", body as unknown as Record<string, unknown>);

    const { action, creator_name, creator_user_id, reason } = body;

    if (!creator_name || !action) {
      return new Response(JSON.stringify({ error: "creator_name and action are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const defaultReason = "lack of uploads";
    const actualReason = reason || defaultReason;

    // 1. Send personal email to the affected creator
    if (creator_user_id) {
      if (action === "removed") {
        await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            user_id: creator_user_id,
            title: `[Important] Your account has been removed from the platform`,
            message: `Hello ${creator_name},\n\nYour account has been removed from Creators Control. Reason: ${actualReason}.\n\nConsistent participation is required to remain active on the platform, and that standard was not met.\n\nIf you believe this was made in error or would like to discuss next steps, please reply to this email.`,
            notification_type: "general",
            link: "/creator",
            button_text: "View account",
            from_name: "Creators Control",
          }),
        });
        logStep("Sent personal removal email", { creator_user_id });
      } else if (action === "at_risk") {
        await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            user_id: creator_user_id,
            title: `[Action Required] Your account is at risk of removal`,
            message: `Hello ${creator_name},\n\nThis is a formal warning that your account is at risk of being removed from the platform.\n\nReason: ${actualReason}. Recent upload activity has not met the requirements expected of active creators in your cohort.\n\nTo avoid removal, please return to a regular upload schedule and submit videos for approval. If your activity does not improve in the near term, your account will be deactivated without further notice.\n\nIf there are circumstances we should know about, please reply to this email so we can discuss them directly.`,
            notification_type: "general",
            link: "/creator/submit",
            button_text: "Submit a video",
            from_name: "Creators Control",
          }),
        });
        logStep("Sent personal at-risk email", { creator_user_id });
      }
    }

    // The cohort/admin broadcast that used to follow was cut 2026-10-20: cohorts are empty, so
    // it only ever emailed the admins about a removal they had just done themselves.
    return new Response(JSON.stringify({
      success: true,
      personal_email_sent: !!creator_user_id,
      broadcast_sent: 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
