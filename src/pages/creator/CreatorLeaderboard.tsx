import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { Trophy, DollarSign, Video, Medal, Crown, Award, ChevronRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAvatarUrl } from "@/lib/storage";
import { playSoundEffect } from "@/hooks/use-sound-effects";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { VideoPreviewDialog } from "@/components/video/VideoPreviewDialog";
import confetti from "canvas-confetti";

interface LeaderboardEntry {
  id: string;
  full_name: string;
  avatar_url: string | null;
  rank: number;
  metric_value: number;
  approvedVideos: number;
  totalSales: number;
  totalEarnings: number;
}

type MetricType = "revenue" | "videos";

interface CreatorBestVideo {
  id: string;
  title: string;
  thumbnail_url: string | null;
  video_url: string | null;
  totalImpressions: number;
  totalPurchases: number;
  totalRevenue: number;
}

interface SelectedCreator {
  entry: LeaderboardEntry;
  topVideos: CreatorBestVideo[];
  loadingVideo: boolean;
}

export default function CreatorLeaderboard() {
  const { profileId } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<MetricType>("videos");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<{ rank: number; approvedVideos: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCreator, setSelectedCreator] = useState<SelectedCreator | null>(null);
  const [previewVideo, setPreviewVideo] = useState<CreatorBestVideo | null>(null);
  const top3Celebrated = useRef(false);
  useEffect(() => {
    fetchLeaderboard(activeTab, { silent: false });
    const interval = window.setInterval(() => {
      fetchLeaderboard(activeTab, { silent: true });
    }, 20000);
    return () => window.clearInterval(interval);
  }, [activeTab, profileId]);

  async function fetchLeaderboard(metric: MetricType, opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("creator-leaderboard", {
        body: { metric, limit: 50 },
      });

      if (error) throw error;

      const entries = (data as any)?.entries ?? [];
      const normalized: LeaderboardEntry[] = entries.map((e: any) => ({
        id: e.id,
        full_name: e.full_name,
        avatar_url: e.avatar_url ? getAvatarUrl(e.avatar_url) : null,
        rank: e.rank ?? 0,
        metric_value: e.metric_value ?? 0,
        approvedVideos: e.approvedVideos ?? 0,
        totalSales: e.totalSales ?? 0,
        totalEarnings: e.totalEarnings ?? 0,
      }));

      setLeaderboard(normalized);

      if (!profileId) {
        setMyStats(null);
        return;
      }

      const me = normalized.find((c) => c.id === profileId);
      if (!me) {
        setMyStats(null);
        return;
      }

      // 🏆 Top-3 celebration — once per session per tab
      if (me.rank > 0 && me.rank <= 3 && !top3Celebrated.current) {
        const key = `top3_celebrated_${metric}`;
        try {
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            top3Celebrated.current = true;
            setTimeout(() => {
              try {
                playSoundEffect(me.rank === 1 ? "celebration" : "success");
                confetti({ particleCount: 60, spread: 70, origin: { y: 0.5 }, zIndex: 9999 });
              } catch {/* ignore */}
            }, 600);
          }
        } catch {/* ignore */}
      }

      setMyStats({ rank: me.rank, approvedVideos: me.approvedVideos });
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatorClick(entry: LeaderboardEntry) {
    if (entry.rank === 0 && entry.approvedVideos === 0) return;

    setSelectedCreator({ entry, topVideos: [], loadingVideo: true });

    try {
      const { data: videos } = await supabase
        .from("videos")
        .select("id, title, thumbnail_url, video_url, performance_data(impressions, purchases, revenue)")
        .eq("creator_id", entry.id)
        .eq("status", "approved");

      if (!videos || videos.length === 0) {
        setSelectedCreator((prev) => prev ? { ...prev, loadingVideo: false } : null);
        return;
      }

      const scored = videos.map((v: any) => {
        const pd = v.performance_data || [];
        const totalImpressions = pd.reduce((s: number, p: any) => s + (p.impressions || 0), 0);
        const totalPurchases = pd.reduce((s: number, p: any) => s + (p.purchases || 0), 0);
        const totalRevenue = pd.reduce((s: number, p: any) => s + (parseFloat(p.revenue) || 0), 0);
        return { id: v.id, title: v.title, thumbnail_url: v.thumbnail_url, video_url: v.video_url, totalImpressions, totalPurchases, totalRevenue };
      });

      scored.sort((a, b) => b.totalRevenue - a.totalRevenue || b.totalImpressions - a.totalImpressions);
      const top3 = scored.slice(0, 3);

      setSelectedCreator((prev) => prev ? { ...prev, topVideos: top3, loadingVideo: false } : null);
    } catch {
      setSelectedCreator((prev) => prev ? { ...prev, loadingVideo: false } : null);
    }
  }

  function formatMetricValue(value: number, metric: MetricType) {
    switch (metric) {
      case "revenue":
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
        }).format(value);
      case "videos":
        return value.toString();
    }
  }

  function getRankIcon(rank: number) {
    const iconSize = isMobile ? "w-4 h-4" : "w-5 h-5";
    
    // Rank 0 means "Not Ranked" - no activity yet
    if (rank === 0) {
      return (
        <span className={`${iconSize} flex items-center justify-center text-[10px] md:text-xs font-medium text-muted-foreground/60`}>
          —
        </span>
      );
    }
    
    switch (rank) {
      case 1:
        return <Crown className={`${iconSize} text-warning`} />;
      case 2:
        return <Medal className={`${iconSize} text-muted-foreground`} />;
      case 3:
        return <Award className={`${iconSize} text-warning`} />;
      default:
        return (
          <span className={`${iconSize} flex items-center justify-center text-xs md:text-sm font-bold text-muted-foreground`}>
            {rank}
          </span>
        );
    }
  }

  return (
    <CreatorLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        {/* Header - compact on mobile */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-2 md:p-3 rounded-xl bg-primary/10">
            <Trophy className="w-5 h-5 md:w-6 md:h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Leaderboard</h1>
            <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
              See how you stack up against other creators
            </p>
          </div>
        </div>

        {/* My standing - compact on mobile */}
        {myStats && (
          <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-3 md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm md:text-base">Your standing</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {activeTab === "revenue" ? "Ranked by revenue" : "Ranked by approved videos"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 md:gap-4 shrink-0">
                  <div className="text-center p-2 md:p-3 bg-background/50 rounded-lg min-w-[72px]">
                    <p className="text-lg md:text-2xl font-bold">
                      {myStats.rank > 0 ? `#${myStats.rank}` : "-"}
                    </p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">Your Rank</p>
                  </div>
                  <div className="text-center p-2 md:p-3 bg-background/50 rounded-lg min-w-[72px]">
                    <p className="text-lg md:text-2xl font-bold">{myStats.approvedVideos}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">Videos</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs - smaller on mobile */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MetricType)}>
          <TabsList className="grid w-full grid-cols-2 max-w-xs h-9 md:h-10">
            <TabsTrigger value="videos" className="gap-1 md:gap-2 text-xs md:text-sm px-2">
              <Video className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Videos
            </TabsTrigger>
            <TabsTrigger value="revenue" className="gap-1 md:gap-2 text-xs md:text-sm px-2">
              <DollarSign className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span>Revenue</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 md:mt-6">
            <Card>
              <CardHeader className="p-3 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-sm md:text-lg">
                {activeTab === "revenue" ? "Top Creators by Revenue" : "Top Creators by Videos"}
              </CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-6 pt-0 md:pt-0">
                {loading ? (
                  <div className="space-y-2 md:space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-12 md:h-16 bg-muted/50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="text-center py-8 md:py-12 text-muted-foreground">
                    <Trophy className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 md:mb-4" />
                    <p className="text-sm md:text-base">No data available yet</p>
                    <p className="text-xs md:text-sm mt-1">
                      Rankings will appear once creators have performance data
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 md:space-y-3">
                    {leaderboard.map((entry) => (
                      <div
                        key={entry.id}
                        onClick={() => handleCreatorClick(entry)}
                        className={`flex items-center gap-2 md:gap-4 p-2 md:p-4 rounded-lg md:rounded-xl transition-colors ${
                          entry.rank > 0 || entry.approvedVideos > 0 ? "cursor-pointer" : "cursor-default"
                        } group ${
                          entry.rank > 0 && entry.rank <= 3
                            ? "bg-gradient-to-r from-primary/5 to-transparent border border-primary/10 hover:border-primary/30"
                            : "bg-muted/30 hover:bg-muted/50"
                        }`}
                      >
                        <div className="w-6 md:w-8 flex justify-center shrink-0">
                          {getRankIcon(entry.rank)}
                        </div>
                        <Avatar className={`h-8 w-8 md:h-10 md:w-10 shrink-0 ${entry.rank === 0 ? "opacity-50" : ""}`}>
                          {entry.avatar_url && <AvatarImage src={entry.avatar_url} alt={entry.full_name} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs md:text-sm">
                            {entry.full_name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 md:gap-2">
                            <p className={`font-medium truncate text-sm md:text-base ${entry.rank === 0 ? "text-muted-foreground" : ""}`}>
                              {entry.full_name}
                            </p>
                            {entry.id === profileId && (
                              <Badge variant="outline" className="text-[10px] md:text-xs px-1 md:px-2">
                                You
                              </Badge>
                            )}
                            {entry.rank === 0 && (
                              <Badge variant="secondary" className="text-[10px] md:text-xs px-1 md:px-2 opacity-60">
                                Not Ranked
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 md:gap-2 mt-0.5 md:mt-1">
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className={`font-bold text-sm md:text-lg ${entry.rank === 0 ? "text-muted-foreground" : ""}`}>
                              {entry.rank === 0 ? "—" : formatMetricValue(entry.metric_value, activeTab)}
                            </p>
                          </div>
                          {entry.approvedVideos > 0 && (
                            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Creator Best Video Sheet */}
      <Sheet open={!!selectedCreator} onOpenChange={(open) => { if (!open) setSelectedCreator(null); }}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl pb-safe">
          {selectedCreator && (
            <>
              <SheetHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {selectedCreator.entry.avatar_url && (
                      <AvatarImage src={selectedCreator.entry.avatar_url} alt={selectedCreator.entry.full_name} />
                    )}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {selectedCreator.entry.full_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-base">{selectedCreator.entry.full_name}</SheetTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {selectedCreator.entry.approvedVideos} approved video{selectedCreator.entry.approvedVideos !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <p className="text-lg font-bold">{selectedCreator.entry.rank > 0 ? `#${selectedCreator.entry.rank}` : "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Rank</p>
                  </div>
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <p className="text-lg font-bold">{selectedCreator.entry.approvedVideos}</p>
                    <p className="text-[10px] text-muted-foreground">Videos</p>
                  </div>
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <p className="text-lg font-bold">${selectedCreator.entry.totalEarnings.toFixed(0)}</p>
                    <p className="text-[10px] text-muted-foreground">Earned</p>
                  </div>
                </div>

                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  🏆 Top Performing Videos
                </p>

                {selectedCreator.loadingVideo ? (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="w-32 shrink-0 aspect-[9/16] bg-muted/50 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : selectedCreator.topVideos.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
                    {selectedCreator.topVideos.map((video, idx) => (
                      <div
                        key={video.id}
                        className="w-32 shrink-0 snap-start cursor-pointer group/vid"
                        onClick={() => setPreviewVideo(video)}
                      >
                        <div className="relative aspect-[9/16] rounded-xl overflow-hidden">
                          <VideoThumbnail
                            thumbnailUrl={video.thumbnail_url}
                            videoUrl={video.video_url}
                            title={video.title}
                            showPlayButton={true}
                            showStatus={false}
                            className="w-full h-full"
                          />
                          <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            #{idx + 1}
                          </div>
                        </div>
                        <p className="text-xs font-medium truncate mt-1.5">{video.title}</p>
                        {video.totalRevenue > 0 && (
                          <p className="text-[10px] text-success font-medium">${video.totalRevenue.toFixed(0)} rev</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Video className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No approved videos yet</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Video preview */}
      <VideoPreviewDialog
        open={!!previewVideo}
        onOpenChange={(open) => { if (!open) setPreviewVideo(null); }}
        videoUrl={previewVideo?.video_url || null}
        title={previewVideo?.title}
      />
    </CreatorLayout>
  );
}
