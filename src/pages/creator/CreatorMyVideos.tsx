import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { playSoundEffect } from "@/hooks/use-sound-effects";

import { supabase } from "@/integrations/supabase/client";
import { batchFetchAll } from "@/lib/batch-fetch";
import { useAuth } from "@/lib/auth";
import { getVideoUrl } from "@/lib/storage";
import { FeedbackStickers, parseStickersFromText } from "@/components/video/FeedbackStickers";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Video,
  Plus,
  Search,
  Filter,
  Eye,
  MousePointer,
  ShoppingCart,
  Loader2,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { useToast } from "@/hooks/use-toast";
import { CopyableVideoId } from "@/components/video/CopyableVideoId";
import { CommentBubble } from "@/components/video/CommentBubble";
import { VideoCommentThread } from "@/components/video/VideoCommentThread";

interface VideoData {
  id: string;
  unique_video_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  earnings: number;
  thumbnail_url: string | null;
  video_url: string | null;
  admin_feedback: string | null;
  admin_feedback_stickers: string[] | null;
  admin_edited: boolean;
  rejection_reason: string | null;
  mentor_feedback?: { feedback: string; mentor_name: string }[];
  mentor_verdict: string | null;
  mentor_verdict_notes: string | null;
}

// Fire mini-confetti burst at a given screen position
function fireMiniConfetti(x = 0.5, y = 0.5) {
  try {
    confetti({
      particleCount: 40,
      spread: 50,
      origin: { x, y },
      colors: ["#FFD700", "#FFC107", "#4CAF50"],
      scalar: 0.9,
      zIndex: 9999,
    });
  } catch {/* ignore */}
}

export default function CreatorMyVideos() {
  const { profileId, user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [previewVideo, setPreviewVideo] = useState<VideoData | null>(null);
  const [activeCommentVideoId, setActiveCommentVideoId] = useState<string | null>(null);
  const celebratedRef = useRef(false);
  const highlightHandled = useRef(false);

  const [deleteTarget, setDeleteTarget] = useState<VideoData | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profileId) {
      fetchVideos();
    }
  }, [profileId]);

  // Auto-open a specific video when ?highlight=ID is in the URL
  useEffect(() => {
    if (highlightHandled.current || loading || videos.length === 0) return;
    const highlightId = searchParams.get("highlight");
    if (!highlightId) return;
    const found = videos.find((v) => v.id === highlightId);
    if (found) {
      setPreviewVideo(found);
      highlightHandled.current = true;
    }
  }, [videos, loading, searchParams]);

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

      if (data) {
        // Get commission rate
        const { data: profile } = await supabase
          .from("profiles")
          .select("commission_percentage")
          .eq("id", profileId)
          .single();

        const commissionRate = profile?.commission_percentage || 10;

        // Fetch all paid payouts linked to videos (bounties)
        const videoIds = data.map(v => v.id);
        const { data: bountyPayouts } = await supabase
          .from("payouts")
          .select("reference_id, amount, status")
          .eq("creator_id", profileId)
          .eq("status", "paid")
          .in("reference_id", videoIds);

        // Create a map of video_id -> total bounty earnings
        const bountyEarningsByVideo: Record<string, number> = {};
        bountyPayouts?.forEach(payout => {
          if (payout.reference_id) {
            bountyEarningsByVideo[payout.reference_id] = 
              (bountyEarningsByVideo[payout.reference_id] || 0) + parseFloat(payout.amount as any);
          }
        });

        // Fetch mentor feedback for rejected AND revision_requested videos
        const feedbackVideoIds = data.filter(v => v.status === 'rejected' || v.status === 'revision_requested' || v.status === 'pending').map(v => v.id);
        let mentorFeedbackMap: Record<string, { feedback: string; mentor_name: string }[]> = {};
        
        if (feedbackVideoIds.length > 0) {
          const { data: feedbackData } = await supabase
            .from("mentor_feedback")
            .select("video_id, feedback, mentor_id")
            .eq("creator_id", profileId)
            .in("video_id", feedbackVideoIds);

          if (feedbackData && feedbackData.length > 0) {
            const mentorIds = [...new Set(feedbackData.map(f => f.mentor_id))];
            const { data: mentorProfiles } = await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", mentorIds);
            
            const mentorNameMap = new Map(mentorProfiles?.map(p => [p.id, p.full_name]) || []);
            
            feedbackData.forEach(f => {
              if (!mentorFeedbackMap[f.video_id]) mentorFeedbackMap[f.video_id] = [];
              mentorFeedbackMap[f.video_id].push({
                feedback: f.feedback,
                mentor_name: mentorNameMap.get(f.mentor_id) || "Your mentor",
              });
            });
          }
        }

        const videosWithStats = data.map((video) => {
          const stats = video.performance_data?.reduce(
            (acc: any, pd: any) => ({
              impressions: acc.impressions + (pd.impressions || 0),
              clicks: acc.clicks + (pd.clicks || 0),
              purchases: acc.purchases + (pd.purchases || 0),
              revenue: acc.revenue + (pd.revenue || 0),
            }),
            { impressions: 0, clicks: 0, purchases: 0, revenue: 0 }
          ) || { impressions: 0, clicks: 0, purchases: 0, revenue: 0 };

          // Calculate ad commission earnings + any bounty payouts linked to this video
          const adCommissionEarnings = stats.revenue * (commissionRate / 100);
          const bountyEarnings = bountyEarningsByVideo[video.id] || 0;

          return {
            id: video.id,
            unique_video_id: video.unique_video_id,
            title: video.title,
            description: video.description,
            status: video.status,
            created_at: video.created_at,
            updated_at: video.updated_at,
            ...stats,
            earnings: adCommissionEarnings + bountyEarnings,
            thumbnail_url: video.thumbnail_url,
            video_url: video.video_url,
            admin_feedback: (video as any).admin_feedback || null,
            admin_feedback_stickers: (video as any).admin_feedback_stickers || null,
            admin_edited: !!(video as any).admin_edited,
            rejection_reason: video.rejection_reason || null,
            mentor_feedback: mentorFeedbackMap[video.id] || [],
            mentor_verdict: (video as any).mentor_verdict || null,
            mentor_verdict_notes: (video as any).mentor_verdict_notes || null,
          };
        });

        setVideos(videosWithStats);

        // 🎉 Celebrate recently approved videos (within last 24h of approval, not upload)
        if (!celebratedRef.current) {
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          const recentlyApproved = videosWithStats.filter(
            (v) =>
              v.status === "approved" &&
              new Date(v.updated_at ?? v.created_at).getTime() > oneDayAgo
          );

          recentlyApproved.forEach((v) => {
            const key = `video_approved_${v.id}`;
            try {
              if (!sessionStorage.getItem(key)) {
                sessionStorage.setItem(key, "1");
                playSoundEffect("cha-ching");
                fireMiniConfetti(0.5, 0.4);
              }
            } catch {/* ignore */}
          });

          celebratedRef.current = true;
        }
      }
    } catch (error) {
      console.error("Error fetching videos:", error);
    } finally {
      setLoading(false);
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
      if (statusFilter === "pending") {
        // Group saved_for_later with pending for creators
        filtered = filtered.filter((v) => v.status === "pending" || v.status === "saved_for_later");
      } else {
        filtered = filtered.filter((v) => v.status === statusFilter);
      }
    }

    setFilteredVideos(filtered);
  }

  async function handleDeleteVideo() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("videos")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Video deleted", description: `"${deleteTarget.title}" has been removed.` });
      setDeleteTarget(null);
      fetchVideos();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setDeleting(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-success text-success-foreground";
      case "rejected":
        return "bg-destructive text-destructive-foreground";
      case "pending":
      case "saved_for_later":
        return "bg-warning text-warning-foreground";
      case "revision_requested":
        return "bg-amber-500 text-white";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };


  return (
    <CreatorLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">My Videos</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Track your submissions and performance
            </p>
          </div>
          <Button asChild size="icon" className="h-8 w-8 md:h-9 md:w-auto md:px-4">
            <Link to="/creator/submit">
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline ml-2">Submit Video</span>
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 md:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 md:pl-10 h-8 md:h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 md:w-40 h-8 md:h-9 text-xs md:text-sm">
              <Filter className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5" />
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

        {/* Growth tracker */}
        <GrowthTracker />

        {/* Videos grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-xl border animate-pulse">
                <div className="h-40 bg-muted rounded-t-xl" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="bg-card rounded-xl border p-12 text-center">
            <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">
              {videos.length === 0 ? "No videos yet" : "No videos match your filters"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {videos.length === 0
                ? "Submit your first video to get started"
                : "Try adjusting your search or filters"}
            </p>
            {videos.length === 0 && (
              <Button asChild>
                <Link to="/creator/submit">
                  <Plus className="w-4 h-4 mr-2" />
                  Submit Video
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: TikTok-style full-bleed grid */}
            <div className="grid grid-cols-3 gap-1 sm:hidden">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  className="relative aspect-[9/16] overflow-hidden bg-muted cursor-pointer rounded-sm"
                  onClick={() => setPreviewVideo(video)}
                >
                  {/* Full-bleed thumbnail, no play button */}
                  <VideoThumbnail
                    thumbnailUrl={video.thumbnail_url}
                    videoUrl={video.video_url}
                    title={video.title}
                    status={video.status}
                    adminEdited={video.admin_edited}
                    size="sm"
                    showStatus={false}
                    showPlayButton={false}
                    className="!w-full !max-w-none h-full absolute inset-0"
                  />

                   {/* Status icon — top-left */}
                  <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                    {video.status === "approved" && (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 drop-shadow" />
                    )}
                    {video.status === "rejected" && (
                      <XCircle className="w-3.5 h-3.5 text-red-400 drop-shadow" />
                    )}
                    {video.status === "revision_requested" && (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 drop-shadow" />
                    )}
                    {(video.status === "pending" || video.status === "saved_for_later") && (
                      <Clock className="w-3.5 h-3.5 text-white/60 drop-shadow" />
                    )}
                  </div>

                  {/* Comment bubble — bottom-right, large tap target */}
                  <div className="absolute bottom-1 right-0.5 z-10 p-1.5">
                    <CommentBubble
                      videoId={video.id}
                      onClick={() => setActiveCommentVideoId(video.id)}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Grid layout */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  className="bg-card rounded-xl border overflow-hidden hover:border-primary/50 transition-colors"
                >
                  <VideoThumbnail
                    thumbnailUrl={video.thumbnail_url}
                    videoUrl={video.video_url}
                    title={video.title}
                    status={video.status}
                    adminEdited={video.admin_edited}
                    size="lg"
                    className="w-full max-w-none"
                    onClick={() => setPreviewVideo(video)}
                  />

                  <div className="p-4">
                    <h3 className="font-semibold truncate mb-1">{video.title}</h3>
                    <CopyableVideoId videoId={video.unique_video_id} variant="badge" className="mb-2" />
                    <div className="flex items-center gap-2 mb-2">
                      <CommentBubble
                        videoId={video.id}
                        onClick={() => setActiveCommentVideoId(video.id)}
                      />
                    </div>

                    {video.status === "approved" && (
                      <div className="grid grid-cols-2 gap-3 text-sm mt-4">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                          <span>{formatNumber(video.impressions)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MousePointer className="w-4 h-4 text-muted-foreground" />
                          <span>{formatNumber(video.clicks)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-success" />
                          <span>{video.purchases}</span>
                        </div>
                        {video.impressions > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {(video.impressions > 0 ? (video.clicks / video.impressions * 100) : 0).toFixed(1)}% CTR
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {(video.admin_feedback || (video.admin_feedback_stickers && video.admin_feedback_stickers.length > 0)) && video.status === "approved" && (
                      <div className="mt-3 p-2.5 rounded-lg bg-success/10 border border-success/20">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                          <div>
                            {video.admin_feedback && <p className="text-xs text-success">{video.admin_feedback}</p>}
                            <FeedbackStickers stickerUrls={video.admin_feedback_stickers} />
                          </div>
                        </div>
                      </div>
                    )}

                    {video.status === "rejected" && video.rejection_reason && (() => {
                      const { cleanText, urls } = parseStickersFromText(video.rejection_reason);
                      return (
                        <div className="mt-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                          <div className="flex items-start gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-destructive">Feedback from Admin</p>
                              {cleanText && <p className="text-xs text-destructive/80 mt-0.5">{cleanText}</p>}
                              <FeedbackStickers textWithStickers={video.rejection_reason} />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {video.mentor_feedback && video.mentor_feedback.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {video.mentor_feedback.map((mf, idx) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                            <div className="flex items-start gap-2">
                              <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-primary">Feedback from your mentor {mf.mentor_name}</p>
                                <p className="text-xs text-primary/80 mt-0.5">{mf.feedback}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {video.mentor_verdict === "needs_work" && video.mentor_verdict_notes && !video.mentor_feedback?.length && (
                      <div className="mt-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                        <div className="flex items-start gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-primary">Your mentor flagged this</p>
                            <p className="text-xs text-primary/80 mt-0.5">{video.mentor_verdict_notes}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {video.status === "revision_requested" && video.rejection_reason && (() => {
                      const { cleanText } = parseStickersFromText(video.rejection_reason);
                      return (
                        <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <div className="flex items-start gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-amber-500">Revision Requested</p>
                              {cleanText && <p className="text-xs text-amber-500/80 mt-0.5">{cleanText}</p>}
                              <FeedbackStickers textWithStickers={video.rejection_reason} />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {["pending", "rejected", "revision_requested"].includes(video.status) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="mt-3 w-full"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(video); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Delete Video
                      </Button>
                    )}

                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Video Preview Modal with Analytics */}
        <Dialog open={!!previewVideo} onOpenChange={() => setPreviewVideo(null)}>
          <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle className="truncate">{previewVideo?.title}</DialogTitle>
            </DialogHeader>
            <div className="p-4 space-y-4">
              {previewVideo?.video_url ? (
                <div className="aspect-[9/16] max-h-[50vh] bg-black rounded-lg overflow-hidden">
                  <video
                    src={getVideoUrl(previewVideo.video_url) || undefined}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="aspect-[9/16] max-h-[50vh] bg-muted rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Video className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No video file available</p>
                  </div>
                </div>
              )}

              {/* Performance Metrics for approved videos */}
              {previewVideo?.status === "approved" && (
                <div className="border-t pt-4">
                  {(previewVideo.impressions > 0 || previewVideo.clicks > 0 || previewVideo.purchases > 0) ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Impressions</span>
                        </div>
                        <p className="text-lg font-bold">{formatNumber(previewVideo.impressions)}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <MousePointer className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Link Clicks</span>
                        </div>
                        <p className="text-lg font-bold">{formatNumber(previewVideo.clicks)}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Link CTR</span>
                        </div>
                        <p className="text-lg font-bold">
                          {previewVideo.impressions > 0
                            ? (previewVideo.clicks / previewVideo.impressions * 100).toFixed(1)
                            : "0.0"}%
                        </p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Sales</span>
                        </div>
                        <p className="text-lg font-bold">{previewVideo.purchases}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">
                        Performance data will appear once your video starts running as ads.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Approved feedback with stickers */}
              {previewVideo?.status === "approved" && (previewVideo.admin_feedback || (previewVideo.admin_feedback_stickers && previewVideo.admin_feedback_stickers.length > 0)) && (
                <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                    <div>
                      {previewVideo.admin_feedback && <p className="text-xs text-success">{previewVideo.admin_feedback}</p>}
                      <FeedbackStickers stickerUrls={previewVideo.admin_feedback_stickers} />
                    </div>
                  </div>
                </div>
              )}

              {/* Rejection/Revision feedback panel — visible on all screen sizes */}
              {previewVideo?.status === "rejected" && previewVideo.rejection_reason && (() => {
                const { cleanText } = parseStickersFromText(previewVideo.rejection_reason);
                return (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-destructive">Feedback from Admin</p>
                        {cleanText && <p className="text-xs text-destructive/80 mt-0.5">{cleanText}</p>}
                        <FeedbackStickers textWithStickers={previewVideo.rejection_reason} />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {previewVideo?.mentor_feedback && previewVideo.mentor_feedback.length > 0 && (
                <div className="space-y-2">
                  {previewVideo.mentor_feedback.map((mf, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-start gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-primary">Feedback from your mentor {mf.mentor_name}</p>
                          <p className="text-xs text-primary/80 mt-0.5">{mf.feedback}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {previewVideo?.mentor_verdict === "needs_work" && previewVideo.mentor_verdict_notes && !previewVideo.mentor_feedback?.length && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-primary">Your mentor flagged this</p>
                      <p className="text-xs text-primary/80 mt-0.5">{previewVideo.mentor_verdict_notes}</p>
                    </div>
                  </div>
                </div>
              )}

              {previewVideo?.status === "revision_requested" && previewVideo.rejection_reason && (() => {
                const { cleanText } = parseStickersFromText(previewVideo.rejection_reason);
                return (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-amber-500">Revision Requested</p>
                        {cleanText && <p className="text-xs text-amber-500/80 mt-0.5">{cleanText}</p>}
                        <FeedbackStickers textWithStickers={previewVideo.rejection_reason} />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {previewVideo && ["pending", "rejected", "revision_requested"].includes(previewVideo.status) && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => { setPreviewVideo(null); setDeleteTarget(previewVideo); }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Video
                </Button>
              )}

              {previewVideo?.description && (
                <p className="text-sm text-muted-foreground">{previewVideo.description}</p>
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

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this video?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteTarget?.title}" will be permanently removed. You can always re-upload a new version.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteVideo}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CreatorLayout>
  );
}
