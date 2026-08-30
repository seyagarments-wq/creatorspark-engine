import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[BROADCAST-PEER] ${step}${detailsStr}`);
};

interface BroadcastRequest {
  event_type: "video_submitted" | "video_approved" | "payout_processed" | "streak_milestone";
  actor_name: string;
  actor_user_id: string;
  details?: {
    video_count?: number;
    amount?: number;
    streak_days?: number;
  };
}

function buildNotificationContent(event: BroadcastRequest): { title: string; message: string; link: string } | null {
  switch (event.event_type) {
    case "video_submitted": {
      const videoCount = event.details?.video_count || 1;
      return {
        title: `Cohort update: ${event.actor_name} submitted ${videoCount > 1 ? videoCount + " videos" : "a video"}`,
        message: `${event.actor_name} submitted ${videoCount} video${videoCount > 1 ? "s" : ""} for review. Check your own upload schedule to make sure you are on track for this month's requirements.`,
        link: "/creator/submit",
      };
    }
    case "video_approved":
      return {
        title: `Cohort update: ${event.actor_name} had a video approved`,
        message: `A video from ${event.actor_name} has been approved and is now in use. Continue submitting your own content to remain eligible for this month's commission.`,
        link: "/creator/submit",
      };
    case "payout_processed": {
      const amount = event.details?.amount || 0;
      return {
        title: `Cohort update: ${event.actor_name} received a payout`,
        message: `${event.actor_name} was paid $${amount.toFixed(2)} this period. Payouts depend on consistent uploads — keep your own submissions on schedule to remain eligible.`,
        link: "/creator/submit",
      };
    }
    case "streak_milestone": {
      const streakDays = event.details?.streak_days || 7;
      return {
        title: `Cohort update: ${event.actor_name} reached a ${streakDays}-day upload streak`,
        message: `${event.actor_name} has uploaded for ${streakDays} consecutive days. Consistency directly impacts your eligibility — review your own calendar and stay on schedule.`,
        link: "/creator/submit",
      };
    }
    default:
      return {
        title: `Cohort update`,
        message: `${event.actor_name} has activity to report. Please review your own progress in the app.`,
        link: "/creator",
      };
  }
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

    const event: BroadcastRequest = await req.json();
    logStep("Received event", { type: event.event_type, actor: event.actor_name });

    // 1. Find actor's profile ID
    const { data: actorProfile } = await supabaseClient
      .from("profiles")
      .select("id")
      .eq("user_id", event.actor_user_id)
      .single();

    // 2. Find actor's cohort(s)
    let cohortCreatorUserIds: string[] = [];
    if (actorProfile) {
      const { data: actorCohorts } = await supabaseClient
        .from("creator_cohort_members")
        .select("cohort_id")
        .eq("creator_id", actorProfile.id);

      if (actorCohorts?.length) {
        const cohortIds = actorCohorts.map(c => c.cohort_id);
        logStep("Actor cohorts", { cohortIds });

        // Get all creators in the same cohort(s) — only those with completed accounts
        // A creator is "account complete" if: stripe_onboarding_complete = true AND status = 'active'
        // OR they have uploaded videos (meaning they're active even if Stripe isn't done)
        const { data: cohortMembers } = await supabaseClient
          .from("creator_cohort_members")
          .select("creator_id, profiles!inner(user_id, stripe_onboarding_complete, status)")
          .in("cohort_id", cohortIds);

        if (cohortMembers?.length) {
          // Get creators who have at least 1 video (active participants even without Stripe)
          const creatorIds = cohortMembers.map(m => m.creator_id);
          const { data: videoCounts } = await supabaseClient
            .from("videos")
            .select("creator_id")
            .in("creator_id", creatorIds);
          const creatorsWithVideos = new Set((videoCounts || []).map(v => v.creator_id));

          cohortCreatorUserIds = cohortMembers
            .filter((m: any) => {
              const profile = m.profiles;
              if (!profile || profile.status !== 'active') return false;
              // Include if: Stripe complete OR has uploaded videos
              return profile.stripe_onboarding_complete === true || creatorsWithVideos.has(m.creator_id);
            })
            .map((m: any) => m.profiles.user_id)
            .filter((uid: string) => uid !== event.actor_user_id);
        }
      }
    }

    // 3. Get all admin user IDs (admins always receive everything)
    const { data: adminRoles } = await supabaseClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminUserIds = (adminRoles || []).map(r => r.user_id);

    // 4. Combine and deduplicate
    const targetUserIds = [...new Set([...cohortCreatorUserIds, ...adminUserIds])];

    logStep("Cohort-scoped targets (account-complete only)", {
      cohortCreators: cohortCreatorUserIds.length,
      admins: adminUserIds.length,
      total: targetUserIds.length,
    });

    if (!targetUserIds.length) {
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const content = buildNotificationContent(event);

    if (!content) {
      logStep("Event type disabled, skipping", { type: event.event_type });
      return new Response(JSON.stringify({ success: true, notified: 0, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { title, message, link } = content;

    let notificationsSent = 0;
    const errors: string[] = [];

    for (const userId of targetUserIds) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: userId,
            title,
            message,
            notification_type: "general",
            link,
            from_name: "Creators Control",
          }),
        });

        if (response.ok) {
          notificationsSent++;
        } else {
          const errText = await response.text();
          errors.push(`User ${userId}: ${errText}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`User ${userId}: ${errMsg}`);
      }
    }

    logStep("Broadcast complete", { sent: notificationsSent, errors: errors.length });

    return new Response(JSON.stringify({
      success: true,
      notified: notificationsSent,
      totalTargets: targetUserIds.length,
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
