import { useEffect, useState, useRef, useCallback } from "react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StripeConnectionBanner } from "@/components/creator/StripeConnectionBanner";
import { CreatorOnboarding } from "@/components/creator/CreatorOnboarding";
import { EligibilityStatusBanner } from "@/components/creator/EligibilityStatusBanner";
import { PayoutRulesCard } from "@/components/creator/PayoutRulesCard";
import { MilestoneCelebration } from "@/components/MilestoneCelebration";
import { CreatorProgressCard } from "@/components/gamification/CreatorProgressCard";
import { WeeklyChallengesCard } from "@/components/gamification/WeeklyChallengesCard";
import { StreakIndicator } from "@/components/gamification/StreakIndicator";
import { ConsistencyTracker } from "@/components/gamification/ConsistencyTracker";
import { ConsistencyLeaderboard } from "@/components/gamification/ConsistencyLeaderboard";
import { playSoundEffect } from "@/hooks/use-sound-effects";
import { useCreatorProgress } from "@/hooks/use-creator-progress";
import {
  Video,
  DollarSign,
  CheckCircle,
  TrendingUp,
  Plus,
  Clock,
  Eye,
  ShoppingCart,
  Trophy,
  ArrowRight,
  Sparkles,
  Flame,
  BarChart3,
  AlertCircle,
  RotateCw,
  Upload,
} from "lucide-react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { VideoPreviewDialog } from "@/components/video/VideoPreviewDialog";

interface DashboardStats {
  totalVideos: number;
  approvedVideos: number;
  pendingVideos: number;
  totalEarnings: number;
  thirtyDayEarnings: number;
  approvalRate: number;
  commissionRate: number;
  approvedThisMonth: number;
}

interface RecentVideo {
  id: string;
  title: string;
  status: string;
  created_at: string;
  impressions: number;
  purchases: number;
}

interface ActiveBounty {
  id: string;
  title: string;
  reward_amount: number;
  milestone_type: string;
  milestone_value: number;
  currentValue: number;
  end_date: string | null;
}

interface TopVideo {
  id: string;
  title: string;
  creator_name: string;
  metric_value: number;
  metric_type: "roas" | "views" | "sales";
  thumbnail_url?: string | null;
  video_url?: string | null;
}

export default function CreatorHome() {
  const { profileId, user } = useAuth();
  // NOTE: useCreatorProgress is also called inside CreatorProgressCard — we only need
  // the streak fields here for the hero section display. We pull them from the same
  // hook so React can deduplicate; the hook already guards with useCallback/useEffect.
  const { progress } = useCreatorProgress();
  const [stats, setStats] = useState<DashboardStats>({
    totalVideos: 0,
    approvedVideos: 0,
    pendingVideos: 0,
    totalEarnings: 0,
    thirtyDayEarnings: 0,
    approvalRate: 0,
    commissionRate: 10,
    approvedThisMonth: 0,
  });
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [activeBounties, setActiveBounties] = useState<ActiveBounty[]>([]);
  const [topVideosThisWeek, setTopVideosThisWeek] = useState<TopVideo[]>([]);
  const [creatorName, setCreatorName] = useState("Creator");
  const [loading, setLoading] = useState(true);
  const [showMilestoneCelebration, setShowMilestoneCelebration] = useState(false);
  const [selectedTopVideo, setSelectedTopVideo] = useState<TopVideo | null>(null);
  
  const previousApprovedThisMonth = useRef<number | null>(null);



  const handleRealtimeNotification = useCallback((payload: any) => {
    const { notification_type } = payload.new || {};
    
    switch (notification_type) {
      case "video_approved":
        playSoundEffect("celebration");
        break;
      case "payout_approved":
      case "earnings":
        playSoundEffect("cha-ching");
        break;
      case "bounty_qualified":
        playSoundEffect("milestone");
        break;
      default:
        playSoundEffect("notification");
    }
  }, []);

  useEffect(() => {
    if (profileId) {
      fetchDashboardData();
    }
  }, [profileId]);

  const debouncedFetchTopVideos = useDebouncedCallback(() => fetchTopVideos(), 500);

  // Realtime: re-fetch top videos when performance_data changes (debounced)
  useEffect(() => {
    const channel = supabase
      .channel("top-videos-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "performance_data",
        },
        () => {
          debouncedFetchTopVideos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("creator-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        handleRealtimeNotification
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, handleRealtimeNotification]);

  async function fetchTopVideos() {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      const { data: todayVideos } = await supabase
        .from("videos")
        .select(`
          id, title, thumbnail_url, video_url, creator_id,
          profiles!videos_creator_id_fkey(full_name),
          performance_data!inner(impressions, clicks, spend, revenue, purchases, metric_date)
        `)
        .eq("status", "approved")
        .eq("performance_data.metric_date", todayStr);

      const hasTodayData = todayVideos && todayVideos.length > 0;
      let topVideosData = todayVideos;
      if (!hasTodayData) {
        const { data: yesterdayVideos } = await supabase
          .from("videos")
          .select(`
            id, title, thumbnail_url, video_url, creator_id,
            profiles!videos_creator_id_fkey(full_name),
            performance_data!inner(impressions, clicks, spend, revenue, purchases, metric_date)
          `)
          .eq("status", "approved")
          .eq("performance_data.metric_date", yesterdayStr);
        topVideosData = yesterdayVideos;
      }

      if (topVideosData && topVideosData.length > 0) {
        const videosWithMetrics = topVideosData.map((video: any) => {
          const perfData = video.performance_data || [];
          const totalImpressions = perfData.reduce((sum: number, pd: any) => sum + (pd.impressions || 0), 0);
          const totalSpend = perfData.reduce((sum: number, pd: any) => sum + (parseFloat(pd.spend) || 0), 0);
          const totalRevenue = perfData.reduce((sum: number, pd: any) => sum + (parseFloat(pd.revenue) || 0), 0);
          const totalPurchases = perfData.reduce((sum: number, pd: any) => sum + (pd.purchases || 0), 0);
          const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
          return {
            id: video.id, title: video.title, thumbnail_url: video.thumbnail_url,
            video_url: video.video_url, creator_name: video.profiles?.full_name || "Unknown Creator",
            impressions: totalImpressions, purchases: totalPurchases, revenue: totalRevenue, roas,
          };
        });

        const topByRoas = [...videosWithMetrics].filter((v) => v.roas > 0).sort((a, b) => b.roas - a.roas)[0];
        const topByViews = [...videosWithMetrics].sort((a, b) => b.impressions - a.impressions)[0];
        const topBySales = [...videosWithMetrics].sort((a, b) => b.purchases - a.purchases)[0];

        const topVideos: TopVideo[] = [];
        if (topByRoas && topByRoas.roas > 0) {
          topVideos.push({ id: topByRoas.id, title: topByRoas.title, creator_name: topByRoas.creator_name, thumbnail_url: topByRoas.thumbnail_url, video_url: topByRoas.video_url, metric_value: topByRoas.roas, metric_type: "roas" });
        }
        if (topByViews && topByViews.impressions > 0) {
          topVideos.push({ id: topByViews.id, title: topByViews.title, creator_name: topByViews.creator_name, thumbnail_url: topByViews.thumbnail_url, video_url: topByViews.video_url, metric_value: topByViews.impressions, metric_type: "views" });
        }
        if (topBySales && topBySales.purchases > 0) {
          topVideos.push({ id: topBySales.id, title: topBySales.title, creator_name: topBySales.creator_name, thumbnail_url: topBySales.thumbnail_url, video_url: topBySales.video_url, metric_value: topBySales.purchases, metric_type: "sales" });
        }
        setTopVideosThisWeek(topVideos);
      } else {
        setTopVideosThisWeek([]);
      }
    } catch (error) {
      console.error("Error fetching top videos:", error);
    }
  }

  async function fetchDashboardData() {
    try {
      setLoading(true);

      // Fetch profile, videos, payouts, and bounties ALL in parallel
      const [profileRes, videosRes, payoutsRes, bountiesRes] = await Promise.all([
        supabase.from("profiles").select("full_name, commission_percentage").eq("id", profileId).single(),
        supabase.from("videos").select(`
          id, title, status, created_at, bounty_id,
          performance_data(impressions, purchases, revenue, metric_date)
        `).eq("creator_id", profileId).order("created_at", { ascending: false }),
        supabase.from("payouts").select("amount, created_at, payout_type, status").eq("creator_id", profileId).in("status", ["paid", "pending", "approved"]).in("payout_type", ["bounty", "challenge", "weekly_challenge"]),
        supabase.from("bounties").select("*").eq("status", "active"),
      ]);

      const profile = profileRes.data;
      const videos = videosRes.data;
      const payouts = payoutsRes.data;
      const bounties = bountiesRes.data;

      if (profile) {
        setCreatorName(profile.full_name?.split(" ")[0] || "Creator");
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDayWindowStart = thirtyDaysAgo.toISOString().split("T")[0];

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const totalVideos = videos?.length || 0;
      const approvedVideos = videos?.filter((v) => v.status === "approved").length || 0;
      const pendingVideos = videos?.filter((v) => v.status === "pending" || v.status === "saved_for_later").length || 0;
      const approvalRate = totalVideos > 0 ? Math.round((approvedVideos / totalVideos) * 100) : 0;

      const approvedThisMonth = videos?.filter(
        (v: any) => v.status === "approved" && new Date(v.created_at) >= monthStart && !v.bounty_id
      ).length || 0;

      const commissionRate = profile?.commission_percentage || 10;

      let totalRevenueAllTime = 0;
      let totalRevenueThirtyDays = 0;

      videos?.forEach((video: any) => {
        (video.performance_data || []).forEach((pd: any) => {
          const revenue = parseFloat(pd.revenue) || 0;
          totalRevenueAllTime += revenue;
          const metricDate = pd.metric_date as string | undefined;
          if (metricDate && metricDate >= thirtyDayWindowStart) {
            totalRevenueThirtyDays += revenue;
          }
        });
      });

      const commissionEarnings = totalRevenueAllTime * (commissionRate / 100);
      const thirtyDayCommission = totalRevenueThirtyDays * (commissionRate / 100);

      let totalRewards = 0;
      let thirtyDayRewards = 0;

      payouts?.forEach((p) => {
        const amount = parseFloat(p.amount as any) || 0;
        totalRewards += amount;
        if (new Date(p.created_at) >= thirtyDaysAgo) {
          thirtyDayRewards += amount;
        }
      });

      const totalEarnings = commissionEarnings + totalRewards;
      const thirtyDayEarnings = thirtyDayCommission + thirtyDayRewards;

      const milestoneKey = `milestone_35_${new Date().getFullYear()}_${new Date().getMonth()}`;
      const alreadyCelebrated = localStorage.getItem(milestoneKey);
      
      if (approvedThisMonth >= 35 && !alreadyCelebrated) {
        setTimeout(() => {
          setShowMilestoneCelebration(true);
          localStorage.setItem(milestoneKey, "true");
        }, 500);
      }
      
      previousApprovedThisMonth.current = approvedThisMonth;

      setStats({
        totalVideos,
        approvedVideos,
        pendingVideos,
        totalEarnings,
        thirtyDayEarnings,
        approvalRate,
        commissionRate,
        approvedThisMonth,
      });

      const recent = videos?.slice(0, 5).map((v) => ({
        id: v.id,
        title: v.title,
        status: v.status,
        created_at: v.created_at,
        impressions: v.performance_data?.reduce((sum: number, pd: any) => sum + (pd.impressions || 0), 0) || 0,
        purchases: v.performance_data?.reduce((sum: number, pd: any) => sum + (pd.purchases || 0), 0) || 0,
      })) || [];
      setRecentVideos(recent);

      if (bounties && bounties.length > 0) {
        const activeBountiesWithProgress = bounties.slice(0, 3).map((bounty) => {
          let currentValue = 0;
          videos?.forEach((video) => {
            if (video.status === "approved") {
              video.performance_data?.forEach((pd: any) => {
                if (bounty.milestone_type === "sales") currentValue += pd.purchases || 0;
                else if (bounty.milestone_type === "revenue") currentValue += parseFloat(pd.revenue) || 0;
                else if (bounty.milestone_type === "impressions") currentValue += pd.impressions || 0;
              });
            }
          });
          let endDate: string | null = null;
          if (bounty.time_limit_days) {
            const startDate = new Date(bounty.created_at);
            startDate.setDate(startDate.getDate() + bounty.time_limit_days);
            endDate = startDate.toISOString();
          }
          return { id: bounty.id, title: bounty.title, reward_amount: bounty.reward_amount, milestone_type: bounty.milestone_type, milestone_value: bounty.milestone_value, currentValue, end_date: endDate };
        });
        setActiveBounties(activeBountiesWithProgress);
      }

      // Fetch top videos in parallel (don't await — let it fill in)
      fetchTopVideos();
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-success/10 text-success border-0">Approved</Badge>;
      case "pending":
      case "saved_for_later":
        return <Badge className="bg-warning/10 text-warning border-0">Under Review</Badge>;
      case "rejected":
        return <Badge className="bg-destructive/10 text-destructive border-0">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  if (loading) {
    return (
      <CreatorLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-32 bg-muted rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      
      <MilestoneCelebration
        show={showMilestoneCelebration}
        onComplete={() => setShowMilestoneCelebration(false)}
        title="$500 Guarantee Unlocked!"
        subtitle="You've hit 35 approved videos this month!"
      />

      <div className="space-y-6 animate-fade-in">
        <CreatorOnboarding />
        <StripeConnectionBanner />
        <EligibilityStatusBanner />
        <PayoutRulesCard />

        {/* Consistency Tracker - Hero Card */}
        <ConsistencyTracker />

        {/* Hero Section with Welcome & Quick Actions - Compact on mobile */}
        <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-border/50 dark:border-white/[0.06] p-4 md:p-6 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 md:gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                <h1 className="text-xl md:text-3xl font-semibold">
                  Hey, {creatorName}! 👋
                </h1>
                {progress.currentStreak > 0 && (
                  <StreakIndicator 
                    currentStreak={progress.currentStreak} 
                    longestStreak={progress.longestStreak}
                    size="sm"
                    showLabel={false}
                  />
                )}
              </div>
              <p className="text-sm md:text-base text-muted-foreground">
                You earn <span className="text-primary font-semibold">{stats.commissionRate}%</span> commission on sales
              </p>
            </div>
            
            {/* Hide analytics button on mobile - bottom nav has it */}
            <div className="hidden md:flex flex-wrap gap-3">
              <Button size="lg" asChild className="gap-2">
                <Link to="/creator/submit">
                  <Plus className="w-5 h-5" />
                  Submit Video
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="gap-2">
                <Link to="/creator/analytics">
                  <BarChart3 className="w-5 h-5" />
                  View Analytics
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Grid - Compact on mobile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
          <Card className="border-border/50 dark:border-white/[0.06] shadow-soft">
            <CardContent className="p-3 md:p-5">
              <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
                <div className="p-1.5 md:p-2.5 rounded-xl bg-primary/10 backdrop-blur-sm">
                  <Video className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-semibold">{stats.totalVideos}</p>
              <p className="text-xs md:text-sm text-muted-foreground">Total Videos</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 dark:border-white/[0.06] shadow-soft">
            <CardContent className="p-3 md:p-5">
              <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
                <div className="p-1.5 md:p-2.5 rounded-xl bg-success/10 backdrop-blur-sm">
                  <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-success" />
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-semibold">{stats.approvedVideos}</p>
              <p className="text-xs md:text-sm text-muted-foreground">Approved</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 dark:border-white/[0.06] shadow-soft">
            <CardContent className="p-3 md:p-5">
              <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
                <div className="p-1.5 md:p-2.5 rounded-xl bg-primary/10 backdrop-blur-sm">
                  <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-semibold text-primary">{formatCurrency(stats.totalEarnings)}</p>
              <p className="text-xs md:text-sm text-muted-foreground">Earnings</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 dark:border-white/[0.06] shadow-soft">
            <CardContent className="p-3 md:p-5">
              <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
                <div className="p-1.5 md:p-2.5 rounded-xl bg-warning/10 backdrop-blur-sm">
                  <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-warning" />
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-semibold">{stats.approvalRate}%</p>
              <p className="text-xs md:text-sm text-muted-foreground">Approval</p>
            </CardContent>
          </Card>
        </div>

        {/* Progress & Challenges Row */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* XP & Level Progress */}
          <CreatorProgressCard />
          
          {/* Consistency Leaderboard */}
          <ConsistencyLeaderboard />

          {/* Monthly Guarantee Progress */}
          <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Trophy className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                Monthly $500 Guarantee
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 md:space-y-4 p-3 md:p-6 pt-0">
              <div>
                <div className="flex items-center justify-between mb-1.5 md:mb-2">
                  <span className="text-xs md:text-sm text-muted-foreground">Progress</span>
                  <span className="text-xs md:text-sm font-medium">
                    <span className={stats.approvedThisMonth >= 35 ? "text-primary" : ""}>
                      {stats.approvedThisMonth}
                    </span>
                    <span className="text-muted-foreground">/35</span>
                  </span>
                </div>
                <Progress 
                  value={Math.min((stats.approvedThisMonth / 35) * 100, 100)} 
                  className="h-2 md:h-3"
                />
              </div>
              
              <p className="text-xs md:text-sm text-muted-foreground">
                {stats.approvedThisMonth >= 35 ? (
                  <span className="text-primary font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3 md:w-4 md:h-4" />
                    Unlocked! 🎉
                  </span>
                ) : (
                  <>
                    <strong>{35 - stats.approvedThisMonth}</strong> more to unlock
                  </>
                )}
              </p>

              {/* Hide button on mobile */}
              {stats.approvedThisMonth < 35 && (
                <Button asChild size="sm" className="hidden md:flex w-full">
                  <Link to="/creator/submit">
                    <Plus className="w-4 h-4 mr-2" />
                    Submit Video
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Weekly Challenges */}
        <WeeklyChallengesCard />

        {/* Pending Videos Alert */}
        {stats.pendingVideos > 0 && (
          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Clock className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="font-medium">You have {stats.pendingVideos} video{stats.pendingVideos > 1 ? "s" : ""} pending review</p>
                  <p className="text-sm text-muted-foreground">We'll notify you once they're reviewed</p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/creator/videos">View Videos</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
          {/* Recent Videos — Action Hub */}
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between p-3 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                Recent Videos
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs md:text-sm" asChild>
                <Link to="/creator/videos" className="gap-1">
                  View all
                  <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 md:space-y-2.5 p-3 md:p-6 pt-0">
              {recentVideos.length === 0 ? (
                <div className="text-center py-8 md:py-12 flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium mb-1">No videos yet</p>
                    <p className="text-sm text-muted-foreground">Submit your first video to start earning</p>
                  </div>
                  <Button size="sm" asChild>
                    <Link to="/creator/submit">
                      <Plus className="w-4 h-4 mr-2" />
                      Submit your first video
                    </Link>
                  </Button>
                </div>
              ) : (
                recentVideos.map((video) => {
                  const needsAction = video.status === "rejected" || video.status === "revision_requested";
                  const isApproved = video.status === "approved";

                  return (
                    <div
                      key={video.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${
                        needsAction
                          ? "bg-destructive/5 border border-destructive/20 hover:bg-destructive/10"
                          : isApproved
                          ? "bg-success/5 border border-success/10 hover:bg-success/10"
                          : "bg-secondary/30 hover:bg-secondary/50"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-md flex items-center justify-center flex-shrink-0 ${
                          needsAction ? "bg-destructive/10" : isApproved ? "bg-success/10" : "bg-primary/10"
                        }`}>
                          {needsAction
                            ? <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-destructive" />
                            : isApproved
                            ? <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-success" />
                            : <Clock className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs md:text-sm font-medium truncate max-w-[140px] md:max-w-none">{video.title}</p>
                          <p className="text-[10px] md:text-xs text-muted-foreground">{getTimeAgo(video.created_at)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isApproved && video.impressions > 0 && (
                          <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="w-3.5 h-3.5" />
                              {formatNumber(video.impressions)}
                            </span>
                            <span className="flex items-center gap-1">
                              <ShoppingCart className="w-3.5 h-3.5" />
                              {video.purchases}
                            </span>
                          </div>
                        )}
                        {needsAction ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="text-[10px] md:text-xs h-7 px-2 md:px-3"
                            asChild
                          >
                            <Link to={`/creator/videos?highlight=${video.id}`}>
                              {video.status === "rejected" ? "View Feedback" : "Fix & Resubmit"}
                            </Link>
                          </Button>
                        ) : (
                          getStatusBadge(video.status)
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Nudge to submit if all approved */}
              {recentVideos.length > 0 && recentVideos.every(v => v.status === "approved") && (
                <div className="pt-2">
                  <Button size="sm" variant="outline" className="w-full gap-2" asChild>
                    <Link to="/creator/submit">
                      <Plus className="w-4 h-4" />
                      Keep the streak — submit another video
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Videos — Daily Rotation */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between p-3 md:p-6 pb-2 md:pb-4">
              <div>
                <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
                  <Flame className="w-4 h-4 md:w-5 md:h-5 text-warning" />
                  Top Videos
                </CardTitle>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <RotateCw className="w-3 h-3" />
                  Refreshes daily · {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs md:text-sm" asChild>
                <Link to="/creator/leaderboard" className="gap-1">
                  View all
                  <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              {topVideosThisWeek.length === 0 ? (
                <div className="text-center py-4 md:py-6">
                  <Trophy className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground mx-auto mb-2 md:mb-3" />
                  <p className="text-xs md:text-sm text-muted-foreground">No top videos yet today</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-1">Check back once videos are running ads</p>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 md:gap-3 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-none">
                    {topVideosThisWeek.slice(0, 3).map((video, index) => {
                      const metricLabels: Record<string, string> = {
                        roas: "Best ROAS",
                        views: "Most Views",
                        sales: "Most Sales",
                      };
                      return (
                        <div
                          key={`${video.id}-${video.metric_type}`}
                          className="relative flex-shrink-0 w-24 md:flex-1 md:w-auto snap-start cursor-pointer"
                          onClick={() => setSelectedTopVideo(video)}
                        >
                          <VideoThumbnail
                            thumbnailUrl={video.thumbnail_url}
                            videoUrl={video.video_url}
                            title={video.title}
                            showPlayButton={true}
                            showStatus={false}
                            size="lg"
                            className="w-full"
                          />

                          {/* Category label top-left */}
                          <div className="absolute top-1.5 md:top-2 left-1.5 md:left-2 z-10">
                            <span className="text-[7px] md:text-[9px] font-semibold uppercase tracking-wide text-white/80 drop-shadow">
                              {metricLabels[video.metric_type]}
                            </span>
                          </div>

                          {/* Metric badge top-right */}
                          <div className="absolute top-1.5 md:top-2 right-1.5 md:right-2 z-10">
                            <Badge
                              className={`text-[8px] md:text-[10px] px-1 md:px-1.5 py-0.5 ${
                                video.metric_type === "roas"
                                  ? "bg-success text-success-foreground border-0"
                                  : video.metric_type === "views"
                                  ? "bg-primary text-primary-foreground border-0"
                                  : "bg-accent text-accent-foreground border-0"
                              }`}
                            >
                              {video.metric_type === "roas" && `${video.metric_value.toFixed(1)}x`}
                              {video.metric_type === "views" && formatNumber(video.metric_value)}
                              {video.metric_type === "sales" && `${formatNumber(video.metric_value)} sales`}
                            </Badge>
                          </div>

                          {/* Ranking number bottom-left */}
                          <div className="absolute bottom-1.5 md:bottom-2 left-1.5 md:left-2 z-10">
                            <span className="text-lg md:text-2xl font-bold text-white drop-shadow-lg">
                              #{index + 1}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] md:text-xs text-muted-foreground text-center mt-3">
                    Tap to preview · Rankings reset daily
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Video Preview Dialog */}
        <VideoPreviewDialog
          open={!!selectedTopVideo}
          onOpenChange={(open) => !open && setSelectedTopVideo(null)}
          videoUrl={selectedTopVideo?.video_url || null}
          title={selectedTopVideo?.title}
        />
      </div>
    </CreatorLayout>
  );
}
