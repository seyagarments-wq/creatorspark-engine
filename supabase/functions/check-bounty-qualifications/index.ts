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
    const notifications: { userId: string; bountyTitle: string; rewardAmount: number; xpReward: number }[] = [];

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

          // Award XP if bounty has xp_reward
          const xpReward = bounty.xp_reward || 0;
          if (xpReward > 0) {
            const { data: gamification } = await supabase
              .from("creator_gamification")
              .select("total_xp, current_level")
              .eq("creator_id", creator.creatorId)
              .single();

            if (gamification) {
              const newXp = (gamification.total_xp || 0) + xpReward;
              const newLevel = Math.max(1, Math.floor(Math.sqrt(newXp / 50)) + 1);

              await supabase
                .from("creator_gamification")
                .update({ total_xp: newXp, current_level: newLevel })
                .eq("creator_id", creator.creatorId);

              logStep("Awarded bounty XP", { creator: creator.fullName, xp: xpReward, newXp, newLevel });
            }
          }

          notifications.push({
            userId: creator.userId,
            bountyTitle: bounty.title,
            rewardAmount: bounty.reward_amount,
            xpReward,
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
            message: `You qualified for "<strong>${notification.bountyTitle}</strong>" and earned a <strong>$${notification.rewardAmount.toFixed(2)}</strong> reward${notification.xpReward > 0 ? ` plus ${notification.xpReward} XP` : ""}!\n\nThis is what consistent posting gets you. Keep going.`,
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

    // 7. Check and complete weekly challenges for all creators
    await checkWeeklyChallenges(supabase, creatorProgress);

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

async function checkWeeklyChallenges(supabase: any, creatorProgress: CreatorProgress[]) {
  logStep("Checking weekly challenges");

  // Get current week bounds
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  // Get active weekly challenges
  const { data: challenges } = await supabase
    .from("weekly_challenges")
    .select("*")
    .eq("is_active", true)
    .lte("week_start", weekEndStr)
    .gte("week_end", weekStartStr);

  if (!challenges || challenges.length === 0) {
    logStep("No active weekly challenges");
    return;
  }

  logStep("Found active weekly challenges", { count: challenges.length });

  // Get existing completions
  const { data: completions } = await supabase
    .from("creator_challenge_completions")
    .select("creator_id, challenge_id");

  const completedSet = new Set(
    completions?.map((c: any) => `${c.creator_id}:${c.challenge_id}`) || []
  );

  for (const challenge of challenges) {
    for (const creator of creatorProgress) {
      const key = `${creator.creatorId}:${challenge.id}`;
      
      if (completedSet.has(key)) continue;

      // Calculate progress for this challenge type
      let currentProgress = 0;
      
      switch (challenge.challenge_type) {
        case "upload_count": {
          const { count } = await supabase
            .from("videos")
            .select("id", { count: "exact" })
            .eq("creator_id", creator.creatorId)
            .eq("status", "approved")
            .gte("created_at", challenge.week_start);
          currentProgress = count || 0;
          break;
        }
        case "sale_count": {
          const { data: videos } = await supabase
            .from("videos")
            .select("id")
            .eq("creator_id", creator.creatorId);
          
          if (videos && videos.length > 0) {
            const { data: perfData } = await supabase
              .from("performance_data")
              .select("purchases")
              .in("video_id", videos.map((v: any) => v.id))
              .gte("recorded_at", challenge.week_start);
            
            currentProgress = perfData?.reduce((sum: number, pd: any) => sum + (pd.purchases || 0), 0) || 0;
          }
          break;
        }
        case "impressions": {
          currentProgress = creator.impressions;
          break;
        }
      }

      // Check if challenge is complete
      if (currentProgress >= challenge.target_value) {
        logStep("Creator completed weekly challenge", {
          creator: creator.fullName,
          challenge: challenge.title,
          progress: currentProgress,
          target: challenge.target_value,
        });

        // Record completion
        const { error: completionError } = await supabase
          .from("creator_challenge_completions")
          .insert({
            creator_id: creator.creatorId,
            challenge_id: challenge.id,
            xp_earned: challenge.xp_reward,
            bonus_earned: challenge.bonus_reward || 0,
          });

        if (completionError) {
          logStep("Failed to record challenge completion", { error: completionError.message });
          continue;
        }

        // Update gamification XP
        const { data: gamification } = await supabase
          .from("creator_gamification")
          .select("total_xp, current_level")
          .eq("creator_id", creator.creatorId)
          .single();

        if (gamification) {
          const newXp = (gamification.total_xp || 0) + challenge.xp_reward;
          const newLevel = Math.max(1, Math.floor(Math.sqrt(newXp / 50)) + 1);

          await supabase
            .from("creator_gamification")
            .update({ total_xp: newXp, current_level: newLevel })
            .eq("creator_id", creator.creatorId);
        }

        // Send notification
        try {
          await supabase.functions.invoke("send-notification-email", {
            body: {
              user_id: creator.userId,
              title: "🏆 Weekly Challenge Completed!",
              message: `Amazing! You completed "${challenge.title}" and earned ${challenge.xp_reward} XP${challenge.bonus_reward ? ` plus a $${Number(challenge.bonus_reward).toFixed(2)} bonus` : ""}!`,
              notification_type: "bounty",
              link: "/creator/bounties",
            },
          });
        } catch (notifyError) {
          logStep("Failed to send challenge notification", { error: String(notifyError) });
        }
      }
    }
  }
}
