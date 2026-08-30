import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, TrendingUp, DollarSign } from "lucide-react";

interface EarningsBreakdown {
  commission: number;
  bounties: number;
  challenges: number;
  total: number;
}

interface CreatorStats {
  fullName: string;
  tier: "Bronze" | "Silver" | "Gold" | "Platinum";
  approvalRate: number;
  earnings: EarningsBreakdown;
  approvedThisMonth: number;
  nextTierThreshold: number;
  nextTier: string;
}

export default function CreatorStatsCard() {
  const { profileId, avatarUrl, fullName: authFullName } = useAuth();
  const [stats, setStats] = useState<CreatorStats>({
    fullName: authFullName || "Creator",
    tier: "Bronze",
    approvalRate: 0,
    earnings: { commission: 0, bounties: 0, challenges: 0, total: 0 },
    approvedThisMonth: 0,
    nextTierThreshold: 50,
    nextTier: "Silver",
  });

  useEffect(() => {
    if (profileId) {
      fetchStats();
    }
  }, [profileId]);

  async function fetchStats() {
    try {
      // Fetch profile with commission rate
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, commission_percentage")
        .eq("id", profileId)
        .single();

      const commissionRate = profile?.commission_percentage || 10;

      // 30-day window start
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const windowStart = thirtyDaysAgo.toISOString().split("T")[0];

      // Fetch videos for approval rate
      const { data: videos } = await supabase
        .from("videos")
        .select("id, status, created_at")
        .eq("creator_id", profileId);

      const recentVideos =
        videos?.filter((v) => new Date(v.created_at) >= thirtyDaysAgo) || [];

      const approvedVideos = recentVideos.filter((v) => v.status === "approved");
      const approvalRate =
        recentVideos.length > 0
          ? Math.round((approvedVideos.length / recentVideos.length) * 100)
          : 0;

      // --- Commission earnings: sum of (revenue * commissionRate/100) from performance_data ---
      const approvedVideoIds =
        videos?.filter((v) => v.status === "approved").map((v) => v.id) || [];

      let commissionEarnings = 0;
      if (approvedVideoIds.length > 0) {
        // Fetch day-rows for last 30 days using metric_date
        // Use commission_rate_at_time if available, otherwise fall back to current rate
        const { data: performanceRows } = await supabase
          .from("performance_data")
          .select("revenue, commission_rate_at_time")
          .in("video_id", approvedVideoIds)
          .gte("metric_date", windowStart);

        // Calculate commission per row using the rate that was in effect at the time
        commissionEarnings = performanceRows?.reduce((sum, p) => {
          const revenue = parseFloat((p.revenue as any) || 0);
          // Use stored rate if available, otherwise fall back to current profile rate
          const rate = p.commission_rate_at_time ?? commissionRate;
          return sum + (revenue * (rate / 100));
        }, 0) || 0;
      }

      // --- Bounty and challenge payouts ---
      const { data: payouts } = await supabase
        .from("payouts")
        .select("amount, created_at, payout_type, status")
        .eq("creator_id", profileId)
        .in("status", ["paid", "pending", "approved"]);

      const recentPayouts =
        payouts?.filter((p) => new Date(p.created_at) >= thirtyDaysAgo) || [];

      let bountyEarnings = 0;
      let challengeEarnings = 0;

      recentPayouts.forEach((p) => {
        const amount = parseFloat(p.amount as any);

        if (p.payout_type === "bounty") {
          bountyEarnings += amount;
        } else if (
          p.payout_type === "challenge" ||
          p.payout_type === "weekly_challenge"
        ) {
          challengeEarnings += amount;
        }
        // NOTE: commission payouts NOT added; calculated from performance_data
      });

      const totalEarnings = commissionEarnings + bountyEarnings + challengeEarnings;

      // Calculate tier based on total approved submissions
      const totalApproved = videos?.filter((v) => v.status === "approved").length || 0;
      let tier: "Bronze" | "Silver" | "Gold" | "Platinum" = "Bronze";
      let nextTier = "Silver";
      let nextTierThreshold = 75;

      if (totalApproved >= 250) {
        tier = "Platinum";
        nextTier = "Platinum";
        nextTierThreshold = 250;
      } else if (totalApproved >= 150) {
        tier = "Gold";
        nextTier = "Platinum";
        nextTierThreshold = 250;
      } else if (totalApproved >= 75) {
        tier = "Silver";
        nextTier = "Gold";
        nextTierThreshold = 150;
      }

      // Count approved this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const approvedThisMonth = videos?.filter(
        (v) => v.status === "approved" && new Date(v.created_at) >= startOfMonth
      ).length || 0;

      setStats({
        fullName: profile?.full_name || "Creator",
        tier,
        approvalRate,
        earnings: {
          commission: commissionEarnings,
          bounties: bountyEarnings,
          challenges: challengeEarnings,
          total: totalEarnings,
        },
        approvedThisMonth,
        nextTierThreshold,
        nextTier,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const tierColors = {
    Bronze: "tier-bronze",
    Silver: "tier-silver",
    Gold: "tier-gold",
    Platinum: "tier-platinum",
  };

  const progress = Math.min(
    (stats.approvedThisMonth / stats.nextTierThreshold) * 100,
    100
  );

  return (
    <div className="space-y-6">
      {/* Welcome card */}
      <div className="bg-card rounded-xl p-6 border">
        <div className="flex items-center gap-4 mb-4">
          <Avatar className="h-14 w-14">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={stats.fullName} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-lg">
              {stats.fullName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold">
              Welcome back, {stats.fullName.split(" ")[0]}! 👋
            </p>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-1 ${tierColors[stats.tier]}`}>
              {stats.tier} Creator
            </span>
          </div>
        </div>

        {/* Earnings breakdown */}
        <div className="bg-secondary rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs">30 Day Earnings</span>
            </div>
            <p className="text-xl font-bold text-primary">
              {formatCurrency(stats.earnings.total)}
            </p>
          </div>
          <div className="space-y-2">
            {stats.earnings.commission > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Commission</span>
                <span className="font-medium">{formatCurrency(stats.earnings.commission)}</span>
              </div>
            )}
            {stats.earnings.bounties > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Bounties</span>
                <span className="font-medium">{formatCurrency(stats.earnings.bounties)}</span>
              </div>
            )}
            {stats.earnings.challenges > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Challenges</span>
                <span className="font-medium">{formatCurrency(stats.earnings.challenges)}</span>
              </div>
            )}
            {stats.earnings.total === 0 && (
              <p className="text-xs text-muted-foreground text-center py-1">No earnings yet</p>
            )}
          </div>
        </div>

        {/* Approval rate */}
        <div className="bg-secondary rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs">30 Days</span>
          </div>
          <p className="text-2xl font-bold">{stats.approvalRate}%</p>
          <p className="text-xs text-muted-foreground">Approval Rate</p>
        </div>

        {/* Progress to next tier */}
        {stats.tier !== "Platinum" && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                Unlock {stats.nextTier}!
              </span>
              <span className="font-medium">
                {stats.approvedThisMonth}/{stats.nextTierThreshold}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              approved submissions this month
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
