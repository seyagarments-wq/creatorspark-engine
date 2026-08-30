import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trophy,
  Crown,
  Medal,
  Award,
  DollarSign,
  TrendingUp,
  Video,
  Flame,
  Users,
} from "lucide-react";

interface CreatorStats {
  id: string;
  full_name: string;
  avatar_url: string | null;
  totalEarnings: number;
  totalRevenue: number;
  approvedVideos: number;
  totalSales: number;
  roas: number;
  level: number;
  currentStreak: number;
  referralCount: number;
  referralBonus: number;
}

type SortBy = "earnings" | "videos" | "streak" | "referrals";

export function AdminCreatorLeaderboard() {
  const [creators, setCreators] = useState<CreatorStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("earnings");

  useEffect(() => {
    fetchCreatorStats();
  }, []);

  async function fetchCreatorStats() {
    try {
      // Fetch creator profiles only (join with user_roles to filter)
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "creator");

      if (!userRoles || userRoles.length === 0) {
        setLoading(false);
        return;
      }

      const creatorUserIds = userRoles.map((ur) => ur.user_id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, commission_percentage, user_id")
        .in("user_id", creatorUserIds);

      if (!profiles) {
        setLoading(false);
        return;
      }

      const statsPromises = profiles.map(async (profile) => {
        // Get approved videos
        const { data: videos, count: videoCount } = await supabase
          .from("videos")
          .select("id", { count: "exact" })
          .eq("creator_id", profile.id)
          .eq("status", "approved");

        const commissionRate = profile.commission_percentage || 10;

        // Calculate earnings from performance_data (commission) + payouts (bounties/challenges)
        let commissionEarnings = 0;
        const approvedVideoIds = videos?.map((v) => v.id) || [];

        if (approvedVideoIds.length > 0) {
          const { data: perfData } = await supabase
            .from("performance_data")
            .select("revenue")
            .in("video_id", approvedVideoIds);

          const totalRevenue = perfData?.reduce(
            (sum, p) => sum + parseFloat((p.revenue as any) || 0),
            0
          ) || 0;

          commissionEarnings = totalRevenue * (commissionRate / 100);
        }

        // Get bounty and challenge payouts
        const { data: payouts } = await supabase
          .from("payouts")
          .select("amount, payout_type")
          .eq("creator_id", profile.id)
          .in("status", ["paid", "pending", "approved"])
          .in("payout_type", ["bounty", "challenge", "weekly_challenge"]);

        const bonusEarnings = payouts?.reduce(
          (sum, p) => sum + parseFloat(p.amount as any),
          0
        ) || 0;

        const totalEarnings = commissionEarnings + bonusEarnings;

        // Get gamification data
        const { data: gamification } = await supabase
          .from("creator_gamification")
          .select("current_level, current_streak")
          .eq("creator_id", profile.id)
          .single();

        // Get referral data (count all invites, any status)
        const { count: referralCount } = await supabase
          .from("referrals")
          .select("id", { count: "exact" })
          .eq("referrer_id", profile.id);

        const referralBonus = 0; // Not tracking bonus for invite count leaderboard

        return {
          id: profile.id,
          full_name: profile.full_name || "Unknown",
          avatar_url: profile.avatar_url,
          totalEarnings,
          totalRevenue: 0,
          approvedVideos: videoCount || 0,
          totalSales: 0,
          roas: 0,
          level: gamification?.current_level || 1,
          currentStreak: gamification?.current_streak || 0,
          referralCount: referralCount || 0,
          referralBonus,
        };
      });

      const stats = await Promise.all(statsPromises);
      setCreators(stats.filter((c) => c.approvedVideos > 0 || c.totalEarnings > 0 || c.referralCount > 0));
    } catch (error) {
      console.error("Error fetching creator stats:", error);
    } finally {
      setLoading(false);
    }
  }

  const sortedCreators = [...creators].sort((a, b) => {
    switch (sortBy) {
      case "earnings":
        return b.totalEarnings - a.totalEarnings;
      case "videos":
        return b.approvedVideos - a.approvedVideos;
      case "streak":
        return b.currentStreak - a.currentStreak;
      case "referrals":
        return b.referralCount - a.referralCount;
      default:
        return 0;
    }
  }).slice(0, 10);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return (
          <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">
            {rank}
          </span>
        );
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getLevelBadge = (level: number) => {
    if (level >= 8) return <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">Legend</Badge>;
    if (level >= 5) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pro</Badge>;
    if (level >= 3) return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Rising</Badge>;
    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Top Creators
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Top Creators
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="earnings" className="text-xs">
              <DollarSign className="w-3 h-3 mr-1" />
              Earnings
            </TabsTrigger>
            <TabsTrigger value="videos" className="text-xs">
              <Video className="w-3 h-3 mr-1" />
              Videos
            </TabsTrigger>
            <TabsTrigger value="streak" className="text-xs">
              <Flame className="w-3 h-3 mr-1" />
              Streak
            </TabsTrigger>
            <TabsTrigger value="referrals" className="text-xs">
              <Users className="w-3 h-3 mr-1" />
              Referrals
            </TabsTrigger>
          </TabsList>

          <TabsContent value={sortBy} className="mt-0">
            {sortedCreators.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No creator data yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedCreators.map((creator, index) => (
                  <div
                    key={creator.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      index < 3
                        ? "bg-gradient-to-r from-primary/5 to-transparent"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="w-6 flex justify-center">
                      {getRankIcon(index + 1)}
                    </div>
                    
                    <Avatar className="h-9 w-9">
                      {creator.avatar_url && (
                        <AvatarImage src={creator.avatar_url} alt={creator.full_name} />
                      )}
                      <AvatarFallback className="text-xs">
                        {creator.full_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{creator.full_name}</p>
                        {getLevelBadge(creator.level)}
                        {creator.currentStreak >= 7 && (
                          <Flame className="w-4 h-4 text-orange-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Lvl {creator.level}</span>
                        <span>•</span>
                        <span>{creator.approvedVideos} videos</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-sm">
                        {sortBy === "earnings" && formatCurrency(creator.totalEarnings)}
                        {sortBy === "videos" && creator.approvedVideos}
                        {sortBy === "streak" && `${creator.currentStreak} days`}
                        {sortBy === "referrals" && creator.referralCount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sortBy === "earnings" && "earned"}
                        {sortBy === "videos" && "approved"}
                        {sortBy === "streak" && "streak"}
                        {sortBy === "referrals" && (creator.referralBonus > 0 ? formatCurrency(creator.referralBonus) + " bonus" : "referrals")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
