import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-BOUNTY-QUALIFICATIONS] ${step}${detailsStr}`);
};

interface CreatorProgress {
  creatorId: string;
  userId: string;
  fullName: string;
  approvedUploads: number;
  bountyUploadCounts: Record<string, number>;
  purchases: number;
  revenue: number;
  impressions: number;
  avatarUrl: string | null;
  profileUpdatedAt: string;
  referralCount: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started - Daily bounty qualification check");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get all active bounties
    const { data: activeBounties, error: bountiesError } = await supabase
      .from("bounties")
      .select("*")
      .eq("status", "active");

    if (bountiesError) {
      throw new Error(`Failed to fetch bounties: ${bountiesError.message}`);
    }

    if (!activeBounties || activeBounties.length === 0) {
      logStep("No active bounties found");
      return new Response(
        JSON.stringify({ success: true, message: "No active bounties to check", qualifications: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Found active bounties", { count: activeBounties.length });

    // 2. Get all active creators with their videos
    const { data: creators, error: creatorsError } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, avatar_url, updated_at")
      .eq("status", "active");

    if (creatorsError) {
      throw new Error(`Failed to fetch creators: ${creatorsError.message}`);
    }

    if (!creators || creators.length === 0) {
      logStep("No active creators found");
      return new Response(
        JSON.stringify({ success: true, message: "No active creators", qualifications: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Found active creators", { count: creators.length });

    // 3. Calculate performance totals for each creator
    const creatorProgress: CreatorProgress[] = [];

    for (const creator of creators) {
      // Get all approved videos for this creator
      const { data: videos } = await supabase
        .from("videos")
        .select("id, bounty_id")
        .eq("creator_id", creator.id)
        .eq("status", "approved");

      // Count referrals for this creator
      const { count: referralCount } = await supabase
        .from("referrals")
        .select("id", { count: "exact" })
        .eq("referrer_id", creator.id);

      if (!videos || videos.length === 0) {
        creatorProgress.push({
          creatorId: creator.id,
          userId: creator.user_id,
          fullName: creator.full_name,
          approvedUploads: 0,
          bountyUploadCounts: {},
          purchases: 0,
          revenue: 0,
          impressions: 0,
          avatarUrl: creator.avatar_url,
          profileUpdatedAt: creator.updated_at,
          referralCount: referralCount || 0,
        });
        continue;
      }

      const approvedUploadCount = videos.length;

      // Count videos per bounty_id
      const bountyUploadCounts: Record<string, number> = {};
      for (const v of videos) {
        if (v.bounty_id) {
          bountyUploadCounts[v.bounty_id] = (bountyUploadCounts[v.bounty_id] || 0) + 1;
        }
      }

      const videoIds = videos.map(v => v.id);

      // Get performance data for all their videos
      const { data: perfData } = await supabase
        .from("performance_data")
        .select("purchases, revenue, impressions")
        .in("video_id", videoIds);

      const totals = perfData?.reduce(
        (acc, p) => ({
          purchases: acc.purchases + (p.purchases || 0),
          revenue: acc.revenue + Number(p.revenue || 0),
          impressions: acc.impressions + Number(p.impressions || 0),
        }),
        { purchases: 0, revenue: 0, impressions: 0 }
      ) || { purchases: 0, revenue: 0, impressions: 0 };

      creatorProgress.push({
        creatorId: creator.id,
        userId: creator.user_id,
        fullName: creator.full_name,
        approvedUploads: approvedUploadCount,
        bountyUploadCounts,
        ...totals,
        avatarUrl: creator.avatar_url,
        profileUpdatedAt: creator.updated_at,
        referralCount: referralCount || 0,
      });
    }

    logStep("Calculated creator progress", { creatorsWithProgress: creatorProgress.length });

    // 4. Get existing qualifications to avoid duplicates
    const { data: existingQualifications } = await supabase
      .from("creator_bounties")
      .select("creator_id, bounty_id, qualified");

    const qualifiedSet = new Set(
      existingQualifications
        ?.filter(q => q.qualified)
        .map(q => `${q.creator_id}:${q.bounty_id}`) || []
    );

    // 5. Check each bounty against each creator
    let newQualifications = 0;
    const notifications: { userId: string; bountyTitle: string; rewardAmount: number }[] = [];

    for (const bounty of activeBounties) {
      // Check time limit
      if (bounty.time_limit_days) {
        const bountyStart = new Date(bounty.created_at);
        const deadline = new Date(bountyStart.getTime() + bounty.time_limit_days * 24 * 60 * 60 * 1000);
        if (new Date() > deadline) {
          logStep("Bounty expired", { bountyId: bounty.id, title: bounty.title });
          continue;
        }
      }

      for (const creator of creatorProgress) {
        const key = `${creator.creatorId}:${bounty.id}`;
        
        // Skip if already qualified
        if (qualifiedSet.has(key)) {
          continue;
        }

        // Calculate current value based on milestone type
        let currentValue = 0;
        switch (bounty.milestone_type) {
          case "approved_uploads":
            // Count only videos tagged with this specific bounty
            currentValue = creator.bountyUploadCounts?.[bounty.id] || 0;
            break;
          case "profile_complete":
            // Only count if avatar was uploaded AFTER the bounty was created
            if (creator.avatarUrl && new Date(creator.profileUpdatedAt) > new Date(bounty.created_at)) {
              currentValue = 1;
            }
            break;
          case "referrals":
            currentValue = creator.referralCount;
            break;
          case "sales":
            currentValue = creator.purchases;
            break;
          case "revenue":
            currentValue = creator.revenue;
            break;
          case "impressions":
            currentValue = creator.impressions;
            break;
          case "photo_submission": {
            // Check if creator has an approved photo submission for this bounty
            const { count: approvedPhotoCount } = await supabase
              .from("photo_submissions")
              .select("id", { count: "exact" })
              .eq("bounty_id", bounty.id)
              .eq("creator_id", creator.creatorId)
              .eq("status", "approved");
            currentValue = (approvedPhotoCount || 0) >= 1 ? 1 : 0;
            break;
          }
        }

        // Check if milestone is met
        if (currentValue >= bounty.milestone_value) {
          logStep("Creator qualified for bounty", {
            creator: creator.fullName,
            bounty: bounty.title,
            currentValue,
            milestoneValue: bounty.milestone_value,
          });

          // Check if there's already a record (video_id is part of unique constraint)
          const { data: existingRecord } = await supabase
            .from("creator_bounties")
            .select("id, qualified")
            .eq("bounty_id", bounty.id)
            .eq("creator_id", creator.creatorId)
            .is("video_id", null)
            .single();

          if (existingRecord?.qualified) {
            continue; // Already qualified
          }

          if (existingRecord) {
            // Update existing record
            const { error: updateError } = await supabase
              .from("creator_bounties")
              .update({
                qualified: true,
                qualified_at: new Date().toISOString(),
              })
              .eq("id", existingRecord.id);

            if (updateError) {
              logStep("Failed to update qualification", { error: updateError.message });
              continue;
            }
          } else {
            // Insert new record (with video_id as null for milestone-based bounties)
            const { error: insertError } = await supabase
              .from("creator_bounties")
              .insert({
                bounty_id: bounty.id,
                creator_id: creator.creatorId,
                video_id: null,
                qualified: true,
                qualified_at: new Date().toISOString(),
              });

            if (insertError) {
              logStep("Failed to insert qualification", { error: insertError.message });
              continue;
            }
          }

          newQualifications++;

          notifications.push({
            userId: creator.userId,
            bountyTitle: bounty.title,
            rewardAmount: bounty.reward_amount,
          });
        }
      }
    }

    logStep("Qualifications processed", { newQualifications });

    // 6. Send notification emails for new qualifications
    for (const notification of notifications) {
      try {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            user_id: notification.userId,
            title: "You just unlocked a bounty. 🎯",
            message: `You qualified for "<strong>${notification.bountyTitle}</strong>" and earned a <strong>$${notification.rewardAmount.toFixed(2)}</strong> reward!\n\nThis is what consistent posting gets you. Keep going.`,
            notification_type: "bounty",
            link: "/creator/bounties",
            button_text: "View Your Bounty",
          },
        });
        logStep("Sent qualification notification", { userId: notification.userId, bounty: notification.bountyTitle });
      } catch (emailError) {
        logStep("Failed to send notification email", { error: String(emailError) });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Daily check complete`,
        activeBounties: activeBounties.length,
        creatorsChecked: creators.length,
        newQualifications,
        notificationsSent: notifications.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
