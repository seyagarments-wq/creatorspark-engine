import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, Trophy } from "lucide-react";

interface LeaderboardEntry {
  creator_id: string;
  full_name: string;
  avatar_url: string | null;
  streak_days: number;
  daily_earning: number;
}

export function ConsistencyLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  async function fetchLeaderboard() {
    try {
      // Get recent consistent creators - find who has the longest active streaks
      const today = new Date();
      const recentDates: string[] = [];
      for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        recentDates.push(d.toISOString().split("T")[0]);
      }

      const { data: trackingData } = await supabase
        .from("creator_consistency_tracking")
        .select("creator_id, tracking_date, streak_day, xp_earned")
        .eq("is_consistent", true)
        .order("tracking_date", { ascending: false })
        .limit(500);

      if (!trackingData || trackingData.length === 0) {
        setLoading(false);
        return;
      }

      // Calculate active streaks per creator
      const creatorStreaks = new Map<string, number>();
      const grouped = new Map<string, { tracking_date: string; streak_day: number }[]>();

      for (const row of trackingData) {
        if (!grouped.has(row.creator_id)) grouped.set(row.creator_id, []);
        grouped.get(row.creator_id)!.push({ tracking_date: row.tracking_date, streak_day: row.streak_day });
      }

      for (const [creatorId, days] of grouped) {
        // Find current streak length
        let streak = 0;
        const sorted = days.sort((a, b) => b.tracking_date.localeCompare(a.tracking_date));
        let checkDate = new Date();
        // Allow today or yesterday as start
        for (const day of sorted) {
          const checkStr = checkDate.toISOString().split("T")[0];
          const yesterdayCheck = new Date(checkDate);
          yesterdayCheck.setDate(yesterdayCheck.getDate() - 1);
          const yesterdayStr = yesterdayCheck.toISOString().split("T")[0];

          if (day.tracking_date === checkStr || (streak === 0 && day.tracking_date === yesterdayStr)) {
            streak++;
            if (day.tracking_date === yesterdayStr && streak === 1) {
              checkDate = yesterdayCheck;
            }
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
        if (streak > 0) creatorStreaks.set(creatorId, streak);
      }

      // Get top 5
      const topCreators = Array.from(creatorStreaks.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topCreators.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch profiles + milestone cash values
      const creatorIds = topCreators.map(([id]) => id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", creatorIds);

      const { data: milestones } = await supabase
        .from("consistency_milestones")
        .select("day_number, display_cash_value")
        .eq("is_active", true)
        .order("day_number", { ascending: true });

      const ms = milestones || [];

      const result: LeaderboardEntry[] = topCreators.map(([creatorId, streak]) => {
        const profile = profiles?.find((p) => p.id === creatorId);
        // Find cash value for their streak day
        let cashValue = 1;
        for (const m of ms) {
          if (m.day_number <= streak) cashValue = Number(m.display_cash_value);
          else break;
        }
        return {
          creator_id: creatorId,
          full_name: profile?.full_name || "Creator",
          avatar_url: profile?.avatar_url || null,
          streak_days: streak,
          daily_earning: cashValue,
        };
      });

      setEntries(result);
    } catch (error) {
      console.error("Error fetching consistency leaderboard:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || entries.length === 0) return null;

  const medals = ["🥇", "🥈", "🥉", "4.", "5."];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          Consistency Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {entries.map((entry, i) => (
          <div
            key={entry.creator_id}
            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm w-6 text-center">{medals[i]}</span>
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {entry.avatar_url ? (
                  <img src={entry.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-medium">{entry.full_name.charAt(0)}</span>
                )}
              </div>
              <span className="text-sm font-medium truncate max-w-[100px]">{entry.full_name.split(" ")[0]}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5 text-xs text-orange-500 font-medium">
                <Flame className="w-3 h-3" />
                {entry.streak_days}d
              </span>
              <span className="text-xs font-bold text-primary">${entry.daily_earning}/day</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
