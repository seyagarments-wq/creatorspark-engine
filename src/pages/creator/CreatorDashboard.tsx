import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { playSoundEffect } from "@/hooks/use-sound-effects";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatCard from "@/components/stats/StatCard";
import { EligibilityStatusBanner } from "@/components/creator/EligibilityStatusBanner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { getVideoUrl } from "@/lib/storage";
import {
  Video,
  DollarSign,
  TrendingUp,
  Eye,
  MousePointer,
  ShoppingCart,
  Upload,
  Trophy,
  ArrowRight,
  Zap,
  X,
} from "lucide-react";

interface DashboardStats {
  totalVideos: number;
  pendingVideos: number;
  approvedVideos: number;
  totalEarnings: number;
  totalImpressions: number;
  totalClicks: number;
  totalPurchases: number;
  totalRevenue: number;
}

interface MetaStats {
  liveVideos: number;
  totalImpressions: number;
  totalClicks: number;
  totalPurchases: number;
  totalRevenue: number;
  topPerformingVideos: {
    id: string;
    title: string;
    unique_video_id: string;
    impressions: number;
    purchases: number;
    revenue: number;
    video_url: string | null;
    thumbnail_url: string | null;
  }[];
}

export default function CreatorDashboard() {
  const { profileId } = useAuth();
  const streakCelebrated = useRef(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalVideos: 0,
    pendingVideos: 0,
    approvedVideos: 0,
    totalEarnings: 0,
    totalImpressions: 0,
    totalClicks: 0,
    totalPurchases: 0,
    totalRevenue: 0,
  });
  const [metaStats, setMetaStats] = useState<MetaStats>({
    liveVideos: 0,
    totalImpressions: 0,
    totalClicks: 0,
    totalPurchases: 0,
    totalRevenue: 0,
    topPerformingVideos: [],
  });
  const [recentVideos, setRecentVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commissionRate, setCommissionRate] = useState(10);
  const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    if (profileId) {
      fetchDashboardData();
    }
  }, [profileId]);

  // 🔥 Streak welcome-back — once per session per day
  useEffect(() => {
    if (!profileId || streakCelebrated.current) return;
    const key = `streak_welcome_${new Date().toDateString()}`;
    if (sessionStorage.getItem(key)) return;
    supabase
      .from("creator_gamification")
      .select("current_streak")
      .eq("creator_id", profileId)
      .single()
      .then(({ data }) => {
        if (data && (data as any).current_streak > 0) {
          sessionStorage.setItem(key, "1");
          streakCelebrated.current = true;
          setTimeout(() => { try { playSoundEffect("notification", false); } catch {/* ignore */} }, 800);
        }
      });
  }, [profileId]);

  async function fetchDashboardData() {
    try {
      // Fetch commission rate
      const { data: profile } = await supabase
        .from("profiles")
        .select("commission_percentage")
        .eq("id", profileId)
        .single();

      if (profile?.commission_percentage) {
        setCommissionRate(profile.commission_percentage);
      }

      // Fetch videos
      const { data: videos } = await supabase
        .from("videos")
        .select("*, performance_data(*)")
        .eq("creator_id", profileId)
        .order("created_at", { ascending: false });

      if (videos) {
        const pendingCount = videos.filter((v) => v.status === "pending").length;
        const approvedCount = videos.filter((v) => v.status === "approved").length;

        // Calculate totals from performance data
        let totalImpressions = 0;
        let totalClicks = 0;
        let totalPurchases = 0;
        let totalRevenue = 0;

        // Track Meta live videos separately
        const liveVideos = videos.filter((v) => v.meta_status === "live");
        let metaImpressions = 0;
        let metaClicks = 0;
        let metaPurchases = 0;
        let metaRevenue = 0;

        // Calculate video performance for top performers
        const videoPerformance: {
          id: string;
          title: string;
          unique_video_id: string;
          impressions: number;
          clicks: number;
          purchases: number;
          revenue: number;
          video_url: string | null;
          thumbnail_url: string | null;
        }[] = [];

        videos.forEach((video) => {
          let videoImpressions = 0;
          let videoClicks = 0;
          let videoPurchases = 0;
          let videoRevenue = 0;

          if (video.performance_data) {
            video.performance_data.forEach((pd: any) => {
              const impressions = pd.impressions || 0;
              const clicks = pd.clicks || 0;
              const purchases = pd.purchases || 0;
              const revenue = parseFloat(pd.revenue) || 0;

              totalImpressions += impressions;
              totalClicks += clicks;
              totalPurchases += purchases;
              totalRevenue += revenue;

              videoImpressions += impressions;
              videoClicks += clicks;
              videoPurchases += purchases;
              videoRevenue += revenue;

              // Track Meta stats for live videos
              if (video.meta_status === "live") {
                metaImpressions += impressions;
                metaClicks += clicks;
                metaPurchases += purchases;
                metaRevenue += revenue;
              }
            });
          }

          if (video.meta_status === "live") {
            videoPerformance.push({
              id: video.id,
              title: video.title,
              unique_video_id: video.unique_video_id,
              impressions: videoImpressions,
              clicks: videoClicks,
              purchases: videoPurchases,
              revenue: videoRevenue,
              video_url: video.video_url,
              thumbnail_url: video.thumbnail_url,
            });
          }
        });

        // Sort by revenue for top performers
        videoPerformance.sort((a, b) => b.revenue - a.revenue);

        setStats({
          totalVideos: videos.length,
          pendingVideos: pendingCount,
          approvedVideos: approvedCount,
          totalEarnings: 0, // Will come from payouts
          totalImpressions,
          totalClicks,
          totalPurchases,
          totalRevenue,
        });

        setMetaStats({
          liveVideos: liveVideos.length,
          totalImpressions: metaImpressions,
          totalClicks: metaClicks,
          totalPurchases: metaPurchases,
          totalRevenue: metaRevenue,
          topPerformingVideos: videoPerformance.slice(0, 3),
        });

        setRecentVideos(videos.slice(0, 5));
      }

      // Fetch total earnings from payouts
      const { data: payouts } = await supabase
        .from("payouts")
        .select("amount, status")
        .eq("creator_id", profileId);

      if (payouts) {
        const totalEarnings = payouts
          .filter((p) => p.status === "paid")
          .reduce((sum, p) => sum + parseFloat(p.amount as any), 0);

        setStats((prev) => ({ ...prev, totalEarnings }));
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const calculateEarnings = (revenue: number) => {
    return revenue * (commissionRate / 100);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <EligibilityStatusBanner />
        {/* Welcome section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Welcome back!</h1>
            <p className="text-muted-foreground">
              Here's an overview of your creator performance
            </p>
          </div>
          <Button variant="success" asChild>
            <Link to="/creator/videos/upload">
              <Upload className="w-4 h-4 mr-2" />
              Upload Video
            </Link>
          </Button>
        </div>

        {/* Meta Performance Widget */}
        {metaStats.liveVideos > 0 && (
          <div className="stat-card bg-gradient-to-br from-success/10 via-primary/5 to-blue-500/10 border-success/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-success" />
              </div>
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  Live on Meta Ads
                  <span className="flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  {metaStats.liveVideos} video{metaStats.liveVideos !== 1 ? "s" : ""} actively running
                </p>
              </div>
            </div>

            {/* Meta Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Eye className="w-4 h-4" />
                  <span className="text-xs">Impressions</span>
                </div>
                <p className="text-lg font-bold">{formatNumber(metaStats.totalImpressions)}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <MousePointer className="w-4 h-4" />
                  <span className="text-xs">Clicks</span>
                </div>
                <p className="text-lg font-bold">{formatNumber(metaStats.totalClicks)}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-success mb-1">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="text-xs">Purchases</span>
                </div>
                <p className="text-lg font-bold text-success">{metaStats.totalPurchases}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-success mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs">Your Earnings</span>
                </div>
                <p className="text-lg font-bold text-success">
                  {formatCurrency(calculateEarnings(metaStats.totalRevenue))}
                </p>
              </div>
            </div>

            {/* Top Performing Videos */}
            {metaStats.topPerformingVideos.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Top Performing Videos
                </h3>
                <div className="space-y-2">
                  {metaStats.topPerformingVideos.map((video, index) => (
                    <div
                      key={video.id}
                      className="flex items-center justify-between p-2 bg-background/50 rounded-lg cursor-pointer hover:bg-background/70 transition-colors"
                      onClick={() => {
                        if (video.video_url) {
                          setPlayingVideo({ url: video.video_url, title: video.title });
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                          {index + 1}
                        </span>
                        <VideoThumbnail
                          thumbnailUrl={video.thumbnail_url}
                          videoUrl={video.video_url}
                          title={video.title}
                          showStatus={false}
                          showPlayButton={false}
                          size="sm"
                          className="w-12 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[140px]">
                            {video.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatNumber(video.impressions)} impressions
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-success">
                          {formatCurrency(calculateEarnings(video.revenue))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {video.purchases} sales
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Videos"
            value={stats.totalVideos}
            icon={Video}
            change={`${stats.pendingVideos} pending`}
            changeType="neutral"
          />
          <StatCard
            title="Total Earnings"
            value={formatCurrency(stats.totalEarnings)}
            icon={DollarSign}
            iconColor="text-success"
          />
          <StatCard
            title="Total Impressions"
            value={formatNumber(stats.totalImpressions)}
            icon={Eye}
          />
          <StatCard
            title="Total Purchases"
            value={stats.totalPurchases}
            icon={ShoppingCart}
            iconColor="text-success"
          />
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Total Clicks"
            value={formatNumber(stats.totalClicks)}
            icon={MousePointer}
          />
          <StatCard
            title="Total Revenue"
            value={formatCurrency(stats.totalRevenue)}
            icon={TrendingUp}
            iconColor="text-success"
          />
          <StatCard
            title="Approved Videos"
            value={stats.approvedVideos}
            icon={Video}
            iconColor="text-success"
          />
        </div>

        {/* Recent videos */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Recent Videos</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/creator/videos">
                View all
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </div>

          {recentVideos.length === 0 ? (
            <div className="text-center py-12">
              <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">No videos yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upload your first video to start earning
              </p>
              <Button variant="success" asChild>
                <Link to="/creator/videos/upload">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Video
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentVideos.map((video) => (
                <div
                  key={video.id}
                  className="flex items-center gap-4 p-4 rounded-lg border bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                  onClick={() => {
                    if (video.video_url) {
                      setPlayingVideo({ url: video.video_url, title: video.title });
                    }
                  }}
                >
                  <div className="relative shrink-0">
                    <VideoThumbnail
                      thumbnailUrl={video.thumbnail_url}
                      videoUrl={video.video_url}
                      title={video.title}
                      showStatus={false}
                      showPlayButton={true}
                      size="sm"
                    />
                    {video.meta_status === "live" && (
                      <div className="absolute -top-1 -right-1">
                        <span className="flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{video.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {video.unique_video_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {video.meta_status === "live" && (
                      <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                        <Zap className="w-3 h-3 mr-1" />
                        Live
                      </Badge>
                    )}
                    <Badge
                      variant={
                        video.status === "approved"
                          ? "default"
                          : video.status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                      className={
                        video.status === "approved" ? "bg-success text-success-foreground" : ""
                      }
                    >
                      {video.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active bounties preview */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Active Bounties</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/creator/bounties">
                View all
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </div>
          <div className="text-center py-8">
            <Trophy className="w-12 h-12 text-warning mx-auto mb-4" />
            <h3 className="font-medium mb-2">Check out available bounties</h3>
            <p className="text-sm text-muted-foreground">
              Complete bounties to earn bonus rewards
            </p>
          </div>
        </div>

        {/* Video Playback Dialog */}
        <Dialog open={!!playingVideo} onOpenChange={() => setPlayingVideo(null)}>
          <DialogContent className="max-w-3xl p-0 overflow-hidden">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-background/80 hover:bg-background"
                onClick={() => setPlayingVideo(null)}
              >
                <X className="w-4 h-4" />
              </Button>
              {playingVideo && (
                <video
                  src={getVideoUrl(playingVideo.url)}
                  controls
                  autoPlay
                  className="w-full max-h-[80vh]"
                >
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
