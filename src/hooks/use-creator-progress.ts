import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { playSoundEffect } from "@/hooks/use-sound-effects";

interface CreatorProgress {
  totalXp: number;
  currentLevel: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpProgress: number; // Percentage to next level
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  loading: boolean;
}

interface WeeklyChallenge {
  id: string;
  title: string;
  description: string | null;
  challengeType: string;
  targetValue: number;
  xpReward: number;
  bonusReward: number;
  currentProgress: number;
  isCompleted: boolean;
  weekEnd: string;
  isExclusive: boolean;
}

// XP rewards for different actions
export const XP_REWARDS = {
  VIDEO_SUBMITTED: 10,
  VIDEO_APPROVED: 50,
  FIRST_SALE: 100,
  SALE: 5, // Per sale
  STREAK_DAY: 15,
  CHALLENGE_COMPLETE: 100, // Base, actual from challenge
  ACHIEVEMENT_UNLOCK: 75,
};

// Level calculation helpers (matching database functions) - 3x harder curve
function calculateLevel(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 150)) + 1);
}

function xpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 150;
}

export function useCreatorProgress() {
  const { profileId, user } = useAuth();
  const [progress, setProgress] = useState<CreatorProgress>({
    totalXp: 0,
    currentLevel: 1,
    xpForCurrentLevel: 0,
    xpForNextLevel: 50,
    xpProgress: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    loading: true,
  });
  const [challenges, setChallenges] = useState<WeeklyChallenge[]>([]);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!profileId) return;

    try {
      // Fetch or create gamification record
      let { data: gamification, error } = await supabase
        .from("creator_gamification")
        .select("*")
        .eq("creator_id", profileId)
        .single();

      // If no record exists, create one
      if (error && error.code === "PGRST116") {
        const { data: newRecord, error: insertError } = await supabase
          .from("creator_gamification")
          .insert({ creator_id: profileId })
          .select()
          .single();

        if (!insertError) {
          gamification = newRecord;
        }
      }

      if (gamification) {
        const totalXp = gamification.total_xp || 0;
        const currentLevel = calculateLevel(totalXp);
        const xpForCurrentLevel = xpForLevel(currentLevel);
        const xpForNextLevel = xpForLevel(currentLevel + 1);
        const xpInCurrentLevel = totalXp - xpForCurrentLevel;
        const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
        const xpProgress = xpNeededForNextLevel > 0 
          ? Math.min((xpInCurrentLevel / xpNeededForNextLevel) * 100, 100)
          : 0;

        // NOTE: level-up sound is handled by CreatorProgressCard via localStorage comparison
        // to avoid double-playing here and in the component.
        setPreviousLevel(currentLevel);

        setProgress({
          totalXp,
          currentLevel,
          xpForCurrentLevel,
          xpForNextLevel,
          xpProgress,
          currentStreak: gamification.current_streak || 0,
          longestStreak: gamification.longest_streak || 0,
          lastActivityDate: gamification.last_activity_date,
          loading: false,
        });
      }

      // Fetch weekly challenges
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      // Fetch creator's cohort memberships to filter cohort-exclusive challenges
      const { data: cohortMemberships } = await supabase
        .from("creator_cohort_members")
        .select("cohort_id")
        .eq("creator_id", profileId);

      const myCohortIds = new Set(cohortMemberships?.map(m => m.cohort_id) || []);

      const { data: challengesData } = await supabase
        .from("weekly_challenges")
        .select("*")
        .eq("is_active", true)
        .lte("week_start", weekEnd.toISOString().split("T")[0])
        .gte("week_end", weekStart.toISOString().split("T")[0]);

      // Filter out cohort-exclusive challenges the creator isn't part of
      const visibleChallenges = challengesData?.filter(c => {
        const cohortId = (c as any).cohort_id;
        if (!cohortId) return true; // No cohort restriction = open to all
        return myCohortIds.has(cohortId);
      }) || [];

      if (visibleChallenges.length > 0) {
        // Check which challenges are already completed
        const { data: completions } = await supabase
          .from("creator_challenge_completions")
          .select("challenge_id")
          .eq("creator_id", profileId);

        const completedIds = new Set(completions?.map(c => c.challenge_id) || []);

        // Calculate current progress for each challenge
        const challengesWithProgress = await Promise.all(
          visibleChallenges.map(async (challenge) => {
            let currentProgress = 0;

            if (challenge.challenge_type === "upload_count") {
              // Count approved videos uploaded this week
              const { count } = await supabase
                .from("videos")
                .select("id", { count: "exact" })
                .eq("creator_id", profileId)
                .eq("status", "approved")
                .gte("created_at", challenge.week_start);
              currentProgress = count || 0;
            } else if (challenge.challenge_type === "sale_count") {
              // Sum sales from performance data this week
              const { data: videos } = await supabase
                .from("videos")
                .select("id")
                .eq("creator_id", profileId);

              if (videos && videos.length > 0) {
                const { data: perfData } = await supabase
                  .from("performance_data")
                  .select("purchases")
                  .in("video_id", videos.map(v => v.id))
                  .gte("recorded_at", challenge.week_start);

                currentProgress = perfData?.reduce((sum, pd) => sum + (pd.purchases || 0), 0) || 0;
              }
            } else if (challenge.challenge_type === "impressions") {
              const { data: videos } = await supabase
                .from("videos")
                .select("id")
                .eq("creator_id", profileId);

              if (videos && videos.length > 0) {
                const { data: perfData } = await supabase
                  .from("performance_data")
                  .select("impressions")
                  .in("video_id", videos.map(v => v.id))
                  .gte("recorded_at", challenge.week_start);

                currentProgress = perfData?.reduce((sum, pd) => sum + (Number(pd.impressions) || 0), 0) || 0;
              }
            }

            return {
              id: challenge.id,
              title: challenge.title,
              description: challenge.description,
              challengeType: challenge.challenge_type,
              targetValue: challenge.target_value,
              xpReward: challenge.xp_reward,
              bonusReward: parseFloat(challenge.bonus_reward as any) || 0,
              currentProgress,
              isCompleted: completedIds.has(challenge.id),
              weekEnd: challenge.week_end,
              isExclusive: !!(challenge as any).cohort_id,
            };
          })
        );

        setChallenges(challengesWithProgress);
      }
    } catch (error) {
      console.error("Error fetching creator progress:", error);
      setProgress(prev => ({ ...prev, loading: false }));
    }
  }, [profileId]); // previousLevel intentionally excluded — stored in ref via setPreviousLevel, not a dep

  // Add XP to the creator
  const addXp = useCallback(async (amount: number, reason?: string) => {
    if (!profileId) return;

    try {
      // Get current XP
      const { data: current } = await supabase
        .from("creator_gamification")
        .select("total_xp, current_level")
        .eq("creator_id", profileId)
        .single();

      const newTotalXp = (current?.total_xp || 0) + amount;
      const newLevel = calculateLevel(newTotalXp);
      const leveledUp = newLevel > (current?.current_level || 1);

      await supabase
        .from("creator_gamification")
        .update({ 
          total_xp: newTotalXp,
          current_level: newLevel,
        })
        .eq("creator_id", profileId);

      // Play sound if leveled up
      if (leveledUp) {
        playSoundEffect("milestone");
      } else if (amount >= 50) {
        playSoundEffect("celebration");
      } else {
        playSoundEffect("success");
      }

      // Refresh progress
      fetchProgress();

      return { newTotalXp, newLevel, leveledUp };
    } catch (error) {
      console.error("Error adding XP:", error);
    }
  }, [profileId, fetchProgress]);

  // Update streak
  const updateStreak = useCallback(async () => {
    if (!profileId) return;

    try {
      const today = new Date().toISOString().split("T")[0];
      
      const { data: current } = await supabase
        .from("creator_gamification")
        .select("current_streak, longest_streak, last_activity_date")
        .eq("creator_id", profileId)
        .single();

      if (!current) return;

      const lastActivity = current.last_activity_date;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      let newStreak = current.current_streak || 0;
      
      // Already logged activity today
      if (lastActivity === today) {
        return current.current_streak;
      }
      
      // Continue streak from yesterday
      if (lastActivity === yesterdayStr) {
        newStreak = (current.current_streak || 0) + 1;
        playSoundEffect("success");
      } else if (!lastActivity) {
        // First ever activity
        newStreak = 1;
      } else {
        // Streak broken, start new
        newStreak = 1;
      }

      const longestStreak = Math.max(newStreak, current.longest_streak || 0);

      await supabase
        .from("creator_gamification")
        .update({
          current_streak: newStreak,
          longest_streak: longestStreak,
          last_activity_date: today,
        })
        .eq("creator_id", profileId);

      // Award streak XP
      if (newStreak > 1) {
        await addXp(XP_REWARDS.STREAK_DAY, `${newStreak} day streak!`);
      }

      fetchProgress();
      return newStreak;
    } catch (error) {
      console.error("Error updating streak:", error);
    }
  }, [profileId, addXp, fetchProgress]);

  // Complete a challenge
  const completeChallenge = useCallback(async (challengeId: string, xpReward: number, bonusReward: number) => {
    if (!profileId) return;

    try {
      // Check if already completed
      const { data: existing } = await supabase
        .from("creator_challenge_completions")
        .select("id")
        .eq("creator_id", profileId)
        .eq("challenge_id", challengeId)
        .single();

      if (existing) return; // Already completed

      // Record completion
      await supabase
        .from("creator_challenge_completions")
        .insert({
          creator_id: profileId,
          challenge_id: challengeId,
          xp_earned: xpReward,
          bonus_earned: bonusReward,
        });

      // Award XP
      await addXp(xpReward, "Challenge completed!");
      
      playSoundEffect("milestone");
      fetchProgress();
    } catch (error) {
      console.error("Error completing challenge:", error);
    }
  }, [profileId, addXp, fetchProgress]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return {
    progress,
    challenges,
    addXp,
    updateStreak,
    completeChallenge,
    refetch: fetchProgress,
  };
}

// Level titles for display
export const LEVEL_TITLES: Record<number, string> = {
  1: "Newcomer",
  2: "Content Creator",
  3: "Rising Talent",
  4: "Pro Creator",
  5: "Star Performer",
  6: "Elite Creator",
  7: "Master Creator",
  8: "Legend",
  9: "Icon",
  10: "Hall of Fame",
};

export function getLevelTitle(level: number): string {
  if (level >= 10) return LEVEL_TITLES[10];
  return LEVEL_TITLES[level] || LEVEL_TITLES[1];
}
