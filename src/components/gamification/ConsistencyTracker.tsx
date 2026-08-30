import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Flame, TrendingUp, Upload, Gift, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface CohortMemberStatus {
  creator_id: string;
  full_name: string;
  avatar_url: string | null;
  is_consistent: boolean;
}

interface ConsistencyData {
  todayUploads: number;
  currentStreak: number;
  todayXpEarned: number;
  todayCashValue: number;
  tomorrowCashValue: number;
  totalConsistencyEarnings: number;
  isConsistentToday: boolean;
  cohortTotal: number;
  cohortConsistent: number;
  cohortMultiplierApplied: boolean;
  cohortName: string;
  multipliedCashValue: number;
  cohortMembers: CohortMemberStatus[];
}

interface Milestone {
  day_number: number;
  xp_reward: number;
  display_cash_value: number;
}

export function ConsistencyTracker() {
  const { profileId } = useAuth();
  const [data, setData] = useState<ConsistencyData>({
    todayUploads: 0,
    currentStreak: 0,
    todayXpEarned: 0,
    todayCashValue: 0,
    tomorrowCashValue: 0,
    totalConsistencyEarnings: 0,
    isConsistentToday: false,
    cohortTotal: 0,
    cohortConsistent: 0,
    cohortMultiplierApplied: false,
    cohortName: "",
    multipliedCashValue: 0,
    cohortMembers: [],
  });
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileId) fetchData();
  }, [profileId]);

  async function fetchData() {
    try {
      const today = new Date().toISOString().split("T")[0];

      const [trackingRes, milestonesRes, totalRes] = await Promise.all([
        supabase
          .from("creator_consistency_tracking")
          .select("*")
          .eq("creator_id", profileId!)
          .eq("tracking_date", today)
          .maybeSingle(),
        supabase
          .from("consistency_milestones")
          .select("day_number, xp_reward, display_cash_value")
          .eq("is_active", true)
          .order("day_number", { ascending: true }),
        supabase
          .from("creator_consistency_tracking")
          .select("xp_earned")
          .eq("creator_id", profileId!)
          .eq("is_consistent", true),
      ]);

      const ms = (milestonesRes.data || []) as Milestone[];
      setMilestones(ms);

      const todayRecord = trackingRes.data;
      const todayUploads = todayRecord?.upload_count || 0;
      const isConsistentToday = todayRecord?.is_consistent || false;
      const streakDay = todayRecord?.streak_day || 0;

      // Calculate current streak by looking at consecutive consistent days
      let currentStreak = streakDay;
      if (!isConsistentToday) {
        // Check yesterday and backwards for streak
        const { data: recentDays } = await supabase
          .from("creator_consistency_tracking")
          .select("tracking_date, is_consistent")
          .eq("creator_id", profileId!)
          .eq("is_consistent", true)
          .order("tracking_date", { ascending: false })
          .limit(60);

        if (recentDays && recentDays.length > 0) {
          let streak = 0;
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          let checkDate = yesterday;

          for (const day of recentDays) {
            const dayDate = new Date(day.tracking_date + "T00:00:00");
            const checkStr = checkDate.toISOString().split("T")[0];
            if (day.tracking_date === checkStr) {
              streak++;
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              break;
            }
          }
          currentStreak = streak;
        }
      }

      // Next potential streak day (if they hit 3 today)
      const nextStreakDay = isConsistentToday ? currentStreak + 1 : currentStreak + 1;

      // Get cash value for today's potential/earned
      const todayMilestone = getMilestoneForDay(ms, nextStreakDay);
      const tomorrowMilestone = getMilestoneForDay(ms, nextStreakDay + 1);

      // Total consistency earnings
      const totalEarnings = totalRes.data?.reduce((sum, r) => sum + (r.xp_earned || 0), 0) || 0;
      const totalCashEarnings = totalEarnings / 100;

      // Cohort progress
      let cohortTotal = 0;
      let cohortConsistent = 0;
      let cohortMultiplierApplied = todayRecord?.cohort_multiplier_applied || false;
      let cohortName = "";
      let multipliedCashValue = 0;

      // Get creator's cohort
      const { data: cohortMembership } = await supabase
        .from("creator_cohort_members")
        .select("cohort_id, creator_cohorts(name)")
        .eq("creator_id", profileId!)
        .limit(1)
        .maybeSingle();

      let cohortMembersList: CohortMemberStatus[] = [];

      if (cohortMembership) {
        cohortName = (cohortMembership as any).creator_cohorts?.name || "";
        const cohortId = cohortMembership.cohort_id;

        // Get all cohort members with their profiles
        const { data: members } = await supabase
          .from("creator_cohort_members")
          .select("creator_id, profiles(full_name, avatar_url)")
          .eq("cohort_id", cohortId);

        cohortTotal = members?.length || 0;

        const memberIds = members?.map((m) => m.creator_id) || [];
        if (memberIds.length > 0) {
          const { data: consistentToday } = await supabase
            .from("creator_consistency_tracking")
            .select("creator_id")
            .in("creator_id", memberIds)
            .eq("tracking_date", today)
            .eq("is_consistent", true);

          const consistentIds = new Set(consistentToday?.map((c) => c.creator_id) || []);
          cohortConsistent = consistentIds.size;

          cohortMembersList = (members || []).map((m) => ({
            creator_id: m.creator_id,
            full_name: (m as any).profiles?.full_name || "Creator",
            avatar_url: (m as any).profiles?.avatar_url || null,
            is_consistent: consistentIds.has(m.creator_id),
          }));
        }

        if (cohortMultiplierApplied && todayRecord) {
          multipliedCashValue = ((todayRecord.xp_earned || 0) + (todayRecord.multiplied_xp_earned || 0)) / 100;
        }
      }

      setData({
        todayUploads,
        currentStreak,
        todayXpEarned: todayRecord?.xp_earned || 0,
        todayCashValue: isConsistentToday
          ? (todayRecord?.xp_earned || 0) / 100
          : todayMilestone.display_cash_value,
        tomorrowCashValue: tomorrowMilestone.display_cash_value,
        totalConsistencyEarnings: totalCashEarnings,
        isConsistentToday,
        cohortTotal,
        cohortConsistent,
        cohortMultiplierApplied,
        cohortName,
        multipliedCashValue,
        cohortMembers: cohortMembersList,
      });
    } catch (error) {
      console.error("Error fetching consistency data:", error);
    } finally {
      setLoading(false);
    }
  }

  function getMilestoneForDay(ms: Milestone[], day: number): Milestone {
    // Find exact match or nearest lower
    let best = ms[0] || { day_number: 1, xp_reward: 100, display_cash_value: 1.0 };
    for (const m of ms) {
      if (m.day_number <= day) best = m;
      else break;
    }
    return best;
  }

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="h-32 bg-muted/50 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const uploadProgress = Math.min((data.todayUploads / 3) * 100, 100);

  return (
    <Card className="overflow-hidden relative border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <CardContent className="p-5 md:p-6 relative z-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Left: Main info */}
          <div className="flex-1 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Flame className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Daily Consistency Rewards</h3>
                <p className="text-xs text-muted-foreground">Post 3 videos daily to earn</p>
              </div>
            </div>

            {/* Big dollar value */}
            {data.isConsistentToday ? (
              <div>
                <p className="text-xs text-muted-foreground mb-1">You earned today</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl md:text-5xl font-bold text-primary">
                    ${data.todayCashValue.toFixed(2)}
                  </span>
                  <span className="text-sm text-success font-medium">✓ Done!</span>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Post 3 videos today to earn</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl md:text-5xl font-bold text-primary">
                    ${data.todayCashValue.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Upload className="w-3 h-3" />
                  {data.todayUploads}/3 uploads today
                </span>
                {data.isConsistentToday && (
                  <span className="text-success font-medium">Complete!</span>
                )}
              </div>
              <Progress value={uploadProgress} className="h-2.5" />
            </div>

            {/* Streak + tomorrow teaser */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {data.currentStreak > 0 && (
                <div className="flex items-center gap-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2.5 py-1 rounded-full text-xs font-medium">
                  <Flame className="w-3.5 h-3.5" />
                  Day {data.currentStreak} streak
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5" />
                Tomorrow: <span className="font-semibold text-foreground">${data.tomorrowCashValue.toFixed(2)}</span>
              </div>
            </div>

            {/* Cohort 5x */}
            {data.cohortTotal > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center -space-x-1.5">
                  {data.cohortMembers.map((member) => (
                    <div key={member.creator_id} className="relative">
                      <Avatar className={`h-7 w-7 border-2 ${member.is_consistent ? "border-green-500" : "border-muted"}`}>
                        {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.full_name} />}
                        <AvatarFallback className="text-[8px] bg-muted">
                          {member.full_name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center ${member.is_consistent ? "bg-green-500" : "bg-destructive/70"}`}>
                        {member.is_consistent ? (
                          <Check className="w-2 h-2 text-white" />
                        ) : (
                          <span className="text-white text-[7px] font-bold">✗</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {data.cohortMultiplierApplied ? (
                  <span className="text-xs font-semibold text-primary">🎉 5x UNLOCKED — ${data.multipliedCashValue.toFixed(2)}!</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {data.cohortConsistent}/{data.cohortTotal} done · Everyone hits 3 uploads = <span className="font-semibold text-foreground">${(data.todayCashValue * 5).toFixed(2)}</span> (5x bonus!)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: Stats + CTA */}
          <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-4 md:text-right">
            <div className="flex-1 md:flex-none">
              <p className="text-xs text-muted-foreground">Total earned</p>
              <p className="text-lg md:text-xl font-bold">${data.totalConsistencyEarnings.toFixed(2)}</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <Link to="/creator/rewards">
                <Gift className="w-3.5 h-3.5" />
                Reward Shop
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
