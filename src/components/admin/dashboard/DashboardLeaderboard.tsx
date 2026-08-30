import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Trophy, Crown, Medal, Users } from "lucide-react";
import { Link } from "react-router-dom";

type SortTab = "revenue" | "videos" | "streak" | "referrals";

interface LeaderboardEntry {
  id: string;
  full_name: string;
  avatar_url: string | null;
  tier: string;
  approvedVideos: number;
  totalSales: number;
  currentStreak: number;
  totalEarnings: number;
  commissionEarnings: number;
  totalRevenue: number;
  level: number;
  referralCount: number;
  referralBonus: number;
  metric_value: number;
  rank: number;
}

export function DashboardLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SortTab>("videos");

  const fetchLeaderboard = useCallback(async (metric: SortTab) => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await supabase.functions.invoke("creator-leaderboard", {
        body: { metric, limit: 50 },
      });

      if (res.error) throw res.error;
      setEntries(res.data?.entries || []);
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(tab);
  }, [tab, fetchLeaderboard]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const ranked = entries.filter(e => e.rank > 0).slice(0, 5);
  const unranked = entries.filter(e => e.rank === 0).slice(0, 3);

  const getRankIcon = (i: number) => {
    if (i === 0) return <Crown className="w-4 h-4 text-amber-500" />;
    if (i === 1) return <Medal className="w-4 h-4 text-slate-400" />;
    if (i === 2) return <Medal className="w-4 h-4 text-amber-700" />;
    return <span className="text-xs font-bold text-muted-foreground w-4 text-center">#{i + 1}</span>;
  };

  const getMetricValue = (e: LeaderboardEntry) => {
    if (tab === "revenue") return fmt(e.totalRevenue);
    if (tab === "videos") return `${e.approvedVideos}`;
    if (tab === "referrals") return `${e.referralCount}`;
    return `${e.currentStreak}🔥`;
  };

  const getSubtext = (e: LeaderboardEntry) => {
    if (tab === "revenue") return `${e.approvedVideos} approved`;
    if (tab === "videos") return `${e.approvedVideos} approved`;
    if (tab === "referrals") return e.referralBonus > 0 ? fmt(e.referralBonus) + " bonus" : "referrals";
    return `${e.approvedVideos} videos`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Top Creators
          </CardTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(v as SortTab)}>
            <TabsList className="h-7">
              <TabsTrigger value="revenue" className="text-[10px] px-2.5 h-5">Revenue</TabsTrigger>
              <TabsTrigger value="videos" className="text-[10px] px-2.5 h-5">Videos</TabsTrigger>
              <TabsTrigger value="streak" className="text-[10px] px-2.5 h-5">Streak</TabsTrigger>
              <TabsTrigger value="referrals" className="text-[10px] px-2.5 h-5">Referrals</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 p-3 md:p-6">
        {ranked.length === 0 && unranked.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 md:py-8 text-center">
            <div className="p-3 rounded-full bg-muted mb-2">
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No creator data yet</p>
          </div>
        ) : (
          <>
            {ranked.map((e, i) => (
              <Link
                key={e.id}
                to={`/admin/creators/${e.id}`}
                className="flex items-center gap-2 md:gap-3 p-2 md:p-2.5 rounded-lg hover:bg-secondary/50 transition-colors group"
              >
                <div className="shrink-0">{getRankIcon(i)}</div>
                <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {e.avatar_url ? (
                    <img src={e.avatar_url} alt={e.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] md:text-xs font-semibold text-primary">
                      {e.full_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-medium truncate group-hover:text-primary transition-colors">{e.full_name}</p>
                  <p className="text-[10px] text-muted-foreground hidden md:block">{getSubtext(e)}</p>
                </div>
                <span className="text-xs md:text-sm font-bold tabular-nums">{getMetricValue(e)}</span>
              </Link>
            ))}
            {unranked.length > 0 && (
              <>
                {ranked.length > 0 && <div className="border-t border-border my-1.5 md:my-2" />}
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 md:px-2.5 py-1">Not Ranked</p>
                {unranked.map((e) => (
                  <Link
                    key={e.id}
                    to={`/admin/creators/${e.id}`}
                    className="flex items-center gap-2 md:gap-3 p-2 md:p-2.5 rounded-lg hover:bg-secondary/50 transition-colors group opacity-60"
                  >
                    <span className="text-[10px] text-muted-foreground w-4 text-center">—</span>
                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {e.avatar_url ? (
                        <img src={e.avatar_url} alt={e.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] md:text-xs font-semibold text-muted-foreground">
                          {e.full_name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs md:text-sm font-medium truncate">{e.full_name}</p>
                    </div>
                    <span className="text-[10px] md:text-xs text-muted-foreground">—</span>
                  </Link>
                ))}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
