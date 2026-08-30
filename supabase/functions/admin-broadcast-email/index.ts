import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ADMIN-BROADCAST] ${step}${detailsStr}`);
};

interface BroadcastRequest {
  subject: string;
  message: string;
  target: "all" | "cohort";
  cohort_id?: string;
  from_name?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ") && authHeader.split(" ")[1] !== supabaseServiceKey) {
      const token = authHeader.split(" ")[1];
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: role } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();
      if (!role) {
        return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const body: BroadcastRequest = await req.json();
    logStep("Request", { target: body.target, subject: body.subject });

    if (!body.subject || !body.message) {
      return new Response(JSON.stringify({ error: "Subject and message are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target creators
    let userIds: string[] = [];

    if (body.target === "cohort" && body.cohort_id) {
      const { data: members } = await supabaseClient
        .from("creator_cohort_members")
        .select("creator_id, profiles!inner(user_id)")
        .eq("cohort_id", body.cohort_id);
      userIds = (members || []).map((m: any) => m.profiles.user_id);
    } else {
      const { data: creators } = await supabaseClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "creator");
      // Filter to only onboarded creators
      const allUserIds = (creators || []).map(c => c.user_id);
      const { data: onboardedProfiles } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .in("user_id", allUserIds)
        .eq("status", "active")
        .eq("stripe_onboarding_complete", true);
      userIds = (onboardedProfiles || []).map(p => p.user_id);
    }

    logStep("Target creators", { count: userIds.length });

    if (!userIds.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No creators to notify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const userId of userIds) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: userId,
            title: body.subject,
            message: body.message,
            notification_type: "general",
            link: "/creator",
            from_name: body.from_name,
          }),
        });

        if (response.ok) {
          sent++;
        } else {
          errors.push(`${userId}: ${await response.text()}`);
        }
      } catch (err) {
        errors.push(`${userId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logStep("Broadcast complete", { sent, errors: errors.length });

    return new Response(JSON.stringify({
      success: true,
      sent,
      total: userIds.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
