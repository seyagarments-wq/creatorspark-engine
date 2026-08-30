import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { batchFetchAll } from "@/lib/batch-fetch";
import { useAuth } from "@/lib/auth";
import { getVideoUrl } from "@/lib/storage";
import { FeedbackStickers, parseStickersFromText } from "@/components/video/FeedbackStickers";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Video,
  Upload,
  Search,
  Filter,
  Calendar,
  Eye,
  MousePointer,
  ShoppingCart,
  DollarSign,
  Zap,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { CommentBubble } from "@/components/video/CommentBubble";
import { VideoCommentThread } from "@/components/video/VideoCommentThread";

interface VideoWithPerformance {
  id: string;
  unique_video_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  thumbnail_url: string | null;
  video_url: string | null;
  meta_status: string | null;
  meta_video_id: string | null;
  meta_uploaded_at: string | null;
  performance_data: {
    impressions: number;
    clicks: number;
    purchases: number;
    revenue: number;
  }[];
}

export default function CreatorVideos() {
  const { profileId } = useAuth();
  const [videos, setVideos] = useState<VideoWithPerformance[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<VideoWithPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [commissionRate, setCommissionRate] = useState(10);
  const [previewVideo, setPreviewVideo] = useState<VideoWithPerformance | null>(null);
  const [activeCommentVideoId, setActiveCommentVideoId] = useState<string | null>(null);

  useEffect(() => {
    if (profileId) {
      fetchVideos();
      fetchCommissionRate();
    }
  }, [profileId]);

  useEffect(() => {
    filterVideos();
  }, [videos, searchQuery, statusFilter]);

  async function fetchVideos() {
    try {
      const data = await batchFetchAll((from, to) =>
        supabase
          .from("videos")
          .select("*, performance_data(*)")
          .eq("creator_id", profileId)
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      setVideos(data || []);
    } catch (error) {
      console.error("Error fetching videos:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCommissionRate() {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("commission_percentage")
        .eq("id", profileId)
        .single();

      if (profile?.commission_percentage) {
        setCommissionRate(profile.commission_percentage);
      }
    } catch (error) {
      console.error("Error fetching commission rate:", error);
    }
  }

  function filterVideos() {
    let filtered = videos;

    if (searchQuery) {
      filtered = filtered.filter(
        (v) =>
          v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.unique_video_id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((v) => v.status === statusFilter);
    }

    setFilteredVideos(filtered);
  }

  function getVideoStats(video: VideoWithPerformance) {
    const stats = video.performance_data?.reduce(
      (acc, pd) => ({
        impressions: acc.impressions + (pd.impressions || 0),
        clicks: acc.clicks + (pd.clicks || 0),
        purchases: acc.purchases + (pd.purchases || 0),
        revenue: acc.revenue + (pd.revenue || 0),
      }),
      { impressions: 0, clicks: 0, purchases: 0, revenue: 0 }
    ) || { impressions: 0, clicks: 0, purchases: 0, revenue: 0 };

    return {
      ...stats,
      earnings: stats.revenue * (commissionRate / 100),
    };
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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getMetaStatusBadge = (video: VideoWithPerformance) => {
    if (!video.meta_status || video.meta_status === "not_uploaded") {
      return null;
    }

    const statusConfig: Record<string, { label: string; className: string; icon?: React.ReactNode }> = {
      uploading: {
        label: "Uploading to Meta",
        className: "bg-warning/20 text-warning border-warning/30",
      },
      uploaded: {
        label: "On Meta",
        className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      },
      live: {
        label: "Live on Meta",
        className: "bg-success/20 text-success border-success/30 animate-pulse",
        icon: <Zap className="w-3 h-3 mr-1" />,
      },
      error: {
        label: "Meta Error",
        className: "bg-destructive/20 text-destructive border-destructive/30",
      },
    };

    const config = statusConfig[video.meta_status];
    if (!config) return null;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className={`${config.className} flex items-center`}>
              {config.icon}
              {config.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {video.meta_uploaded_at && (
              <p>Uploaded: {formatDate(video.meta_uploaded_at)}</p>
            )}
            {video.meta_status === "live" && (
              <p>Your video is actively running in Meta Ads</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const liveVideoCount = videos.filter(v => v.meta_status === "live").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Videos</h1>
            <p className="text-muted-foreground">
              Manage and track your video submissions
            </p>
          </div>
          <Button variant="success" asChild>
            <Link to="/creator/videos/upload">
              <Upload className="w-4 h-4 mr-2" />
              Upload Video
            </Link>
          </Button>
        </div>

        {/* Live on Meta summary */}
        {liveVideoCount > 0 && (
          <div className="stat-card bg-gradient-to-r from-success/10 to-blue-500/10 border-success/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="font-medium">
                  {liveVideoCount} video{liveVideoCount !== 1 ? "s" : ""} running on Meta Ads
                </p>
                <p className="text-sm text-muted-foreground">
                  Your content is actively generating revenue
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="revision_requested">Revision Requested</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Videos list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="stat-card animate-pulse">
                <div className="flex gap-4">
                  <div className="w-32 h-20 bg-muted rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="stat-card text-center py-12">
            <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">
              {videos.length === 0
                ? "No videos yet"
                : "No videos match your filters"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {videos.length === 0
                ? "Upload your first video to get started"
                : "Try adjusting your search or filters"}
            </p>
            {videos.length === 0 && (
              <Button variant="success" asChild>
                <Link to="/creator/videos/upload">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Video
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredVideos.map((video) => {
              const stats = getVideoStats(video);
              const isLive = video.meta_status === "live";
              return (
                <div
                  key={video.id}
                  className={`stat-card hover:border-accent/20 transition-colors ${
                    isLive ? "border-success/30 bg-success/5" : ""
                  }`}
                >
                  <div className="flex flex-col lg:flex-row gap-4">
                    {/* 9:16 Thumbnail - Click to preview */}
                    <VideoThumbnail
                      thumbnailUrl={video.thumbnail_url}
                      videoUrl={video.video_url}
                      title={video.title}
                      status={video.status}
                      adminEdited={!!(video as any).admin_edited}
                      size="md"
                      className="w-32 shrink-0"
                      onClick={() => setPreviewVideo(video)}
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <h3 className="font-semibold truncate">{video.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {video.unique_video_id}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {getMetaStatusBadge(video)}
                          <Badge
                            variant={
                              video.status === "approved"
                                ? "default"
                                : video.status === "rejected"
                                ? "destructive"
                                : video.status === "revision_requested"
                                ? "outline"
                                : "secondary"
                            }
                            className={
                              video.status === "approved"
                                ? "bg-success text-success-foreground"
                                : video.status === "revision_requested"
                                ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                : ""
                            }
                          >
                            {video.status === "revision_requested" ? "Revision" : video.status}
                          </Badge>
                        </div>
                      </div>

                      {video.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {video.description}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {formatDate(video.created_at)}
                        </div>
                        <CommentBubble
                          videoId={video.id}
                          onClick={() => setActiveCommentVideoId(video.id)}
                        />
                        {video.status === "approved" && (
                          <>
                            <div className="flex items-center gap-1">
                              <Eye className="w-4 h-4 text-muted-foreground" />
                              <span>{formatNumber(stats.impressions)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MousePointer className="w-4 h-4 text-muted-foreground" />
                              <span>{formatNumber(stats.clicks)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <ShoppingCart className="w-4 h-4 text-success" />
                              <span className="text-success">{stats.purchases}</span>
                            </div>
                            {stats.earnings > 0 && (
                              <div className="flex items-center gap-1 font-medium">
                                <DollarSign className="w-4 h-4 text-success" />
                                <span className="text-success">
                                  {formatCurrency(stats.earnings)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  earned
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {((video as any).admin_feedback || ((video as any).admin_feedback_stickers && (video as any).admin_feedback_stickers.length > 0)) && video.status === "approved" && (
                        <div className="mt-3 p-2.5 rounded-lg bg-success/10 border border-success/20">
                          <div className="flex items-start gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                            <div>
                              {(video as any).admin_feedback && <p className="text-xs text-success">{(video as any).admin_feedback}</p>}
                              <FeedbackStickers stickerUrls={(video as any).admin_feedback_stickers} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Video Preview Modal */}
        <Dialog open={!!previewVideo} onOpenChange={() => setPreviewVideo(null)}>
          <DialogContent className="max-w-lg p-0 overflow-hidden">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle className="truncate">{previewVideo?.title}</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              {previewVideo?.video_url ? (
                <div className="aspect-[9/16] max-h-[70vh] bg-black rounded-lg overflow-hidden">
                  <video
                    src={getVideoUrl(previewVideo.video_url) || undefined}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="aspect-[9/16] bg-muted rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Video className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No video file available</p>
                  </div>
                </div>
              )}
              {previewVideo?.description && (
                <p className="mt-4 text-sm text-muted-foreground">{previewVideo.description}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Video Comment Thread */}
        <VideoCommentThread
          videoId={activeCommentVideoId}
          videoTitle={videos.find(v => v.id === activeCommentVideoId)?.title}
          isAdmin={false}
          open={!!activeCommentVideoId}
          onOpenChange={(open) => !open && setActiveCommentVideoId(null)}
        />
      </div>
    </DashboardLayout>
  );
}
