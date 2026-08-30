import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { batchFetchAll } from "@/lib/batch-fetch";
import { sendNotification } from "@/lib/notifications";
import AdminLayout from "@/components/layout/AdminLayout";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Video,
  Search,
  Filter,
  Calendar,
  CheckCircle,
  XCircle,
  Download,
  User,
  Loader2,
} from "lucide-react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";

interface VideoWithCreator {
  id: string;
  unique_video_id: string;
  title: string;
  description: string;
  status: string;
  rejection_reason: string | null;
  rejection_reason_code?: string | null;
  similarity_flag?: boolean | null;
  similarity_reason?: string | null;
  created_at: string;
  thumbnail_url: string | null;
  video_url: string | null;
  profiles: {
    id: string;
    user_id: string;
    full_name: string;
    email: string;
  };
}

const REJECTION_CODES: { value: string; label: string }[] = [
  { value: "batch_content", label: "Batch content (looks mass-produced)" },
  { value: "low_effort", label: "Low effort" },
  { value: "off_brand", label: "Off-brand" },
  { value: "duplicate", label: "Duplicate / near-duplicate" },
  { value: "quality", label: "Quality issues (audio/video)" },
  { value: "other", label: "Other" },
];

export default function AdminVideos() {
  const [videos, setVideos] = useState<VideoWithCreator[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<VideoWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedVideo, setSelectedVideo] = useState<VideoWithCreator | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionCode, setRejectionCode] = useState<string>("other");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchVideos();
  }, []);

  useEffect(() => {
    filterVideos();
  }, [videos, searchQuery, statusFilter]);

  async function fetchVideos() {
    try {
      const data = await batchFetchAll((from, to) =>
        supabase
          .from("videos")
          .select("*, profiles!videos_creator_id_fkey(id, user_id, full_name, email)")
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

  function filterVideos() {
    let filtered = videos;

    if (searchQuery) {
      filtered = filtered.filter(
        (v) =>
          v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.unique_video_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.profiles?.full_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((v) => v.status === statusFilter);
    }

    setFilteredVideos(filtered);
  }

  function openApproveDialog(video: VideoWithCreator) {
    setSelectedVideo(video);
    setAdminFeedback("");
    setApproveDialogOpen(true);
  }

  async function handleApprove() {
    if (!selectedVideo) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("videos")
        .update({ 
          status: "approved",
          admin_feedback: adminFeedback || null,
        } as any)
        .eq("id", selectedVideo.id);

      if (error) throw error;

      // Fire-and-forget: don't block approval UI
      const feedbackText = adminFeedback 
        ? ` Feedback: "${adminFeedback}"`
        : "";
      sendNotification({
        userId: selectedVideo.profiles.user_id,
        title: "Video Approved! 🎉",
        message: `Your video "${selectedVideo.title}" has been approved and is now live.${feedbackText}`,
        notificationType: "video",
        link: "/creator/videos",
      }).catch(e => console.error("Failed to send notification:", e));

      // Notify assigned mentor(s)
      supabase.functions.invoke("notify-mentor-video-status", {
        body: { video_id: selectedVideo.id, new_status: "approved" },
      }).catch(e => console.error("Failed to notify mentor:", e));

      // Phase 2/4: refresh daily upload status + monthly eligibility for this creator
      supabase.functions.invoke("recompute-upload-status", {
        body: { creator_id: selectedVideo.profiles.id },
      }).catch(e => console.error("Failed to recompute eligibility:", e));

      toast({
        title: "Video approved",
        description: `"${selectedVideo.title}" has been approved.`,
      });

      setApproveDialogOpen(false);
      setAdminFeedback("");
      fetchVideos();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!selectedVideo) return;
    
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("videos")
        .update({ 
          status: "rejected",
          rejection_reason: rejectionReason || null,
          rejection_reason_code: rejectionCode || null,
        } as any)
        .eq("id", selectedVideo.id);

      if (error) throw error;

      // Fire-and-forget: don't block rejection UI
      sendNotification({
        userId: selectedVideo.profiles.user_id,
        title: "Video Needs Revision",
        message: rejectionReason 
          ? `Your video "${selectedVideo.title}" needs changes: ${rejectionReason}`
          : `Your video "${selectedVideo.title}" was not approved.`,
        notificationType: "video",
        link: "/creator/videos",
      }).catch(e => console.error("Failed to send notification:", e));

      // Notify assigned mentor(s)
      supabase.functions.invoke("notify-mentor-video-status", {
        body: { video_id: selectedVideo.id, new_status: "rejected", rejection_reason: rejectionReason || null },
      }).catch(e => console.error("Failed to notify mentor:", e));

      // Phase 2/4: refresh daily upload status + monthly eligibility for this creator
      supabase.functions.invoke("recompute-upload-status", {
        body: { creator_id: selectedVideo.profiles.id },
      }).catch(e => console.error("Failed to recompute eligibility:", e));

      toast({
        title: "Video rejected",
        description: `"${selectedVideo.title}" has been rejected.`,
      });

      setRejectDialogOpen(false);
      setSelectedVideo(null);
      setRejectionReason("");
      setRejectionCode("other");
      fetchVideos();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownload(video: VideoWithCreator) {
    if (!video.video_url) {
      toast({ title: "No video file", description: "This video has no file to download.", variant: "destructive" });
      return;
    }
    try {
      toast({ title: "Download starting…", description: `Preparing ${video.unique_video_id}` });
      const response = await fetch(video.video_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${video.unique_video_id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Download complete ✅", description: `${video.unique_video_id}.mp4 saved` });
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Video Queue</h1>
          <p className="text-sm text-muted-foreground">
            Review and manage video submissions
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, ID, or creator..."
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
            </SelectContent>
          </Select>
        </div>

        {/* Status counts */}
        <div className="flex gap-4 text-sm">
          <span className="text-muted-foreground">
            Pending: <strong className="text-warning">{videos.filter(v => v.status === 'pending').length}</strong>
          </span>
          <span className="text-muted-foreground">
            Approved: <strong className="text-success">{videos.filter(v => v.status === 'approved').length}</strong>
          </span>
          <span className="text-muted-foreground">
            Rejected: <strong className="text-destructive">{videos.filter(v => v.status === 'rejected').length}</strong>
          </span>
        </div>

        {/* Videos list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="stat-card animate-pulse">
                <div className="flex gap-4">
                  <div className="w-40 h-24 bg-muted rounded-lg" />
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
            <h3 className="font-medium mb-2">No videos found</h3>
            <p className="text-sm text-muted-foreground">
              {statusFilter === "pending"
                ? "No videos waiting for review"
                : "Try adjusting your filters"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredVideos.map((video) => (
              <div key={video.id} className="stat-card">
                <div className="flex flex-col lg:flex-row gap-4">
                  {/* 9:16 Thumbnail */}
                  <VideoThumbnail
                    thumbnailUrl={video.thumbnail_url}
                    title={video.title}
                    status={video.status}
                    adminEdited={!!(video as any).admin_edited}
                    size="md"
                    className="w-32 shrink-0"
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h3 className="font-semibold">{video.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {video.unique_video_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {video.similarity_flag && (
                          <Badge
                            variant="outline"
                            title={video.similarity_reason || "Possible duplicate / batch upload"}
                            className="border-warning/60 bg-warning/10 text-warning"
                          >
                            ⚠ Similar
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
                            video.status === "approved"
                              ? "bg-success text-success-foreground"
                              : ""
                          }
                        >
                          {video.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Creator info */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 min-w-0">
                      <User className="w-4 h-4 shrink-0" />
                      <span className="truncate">{video.profiles?.full_name} ({video.profiles?.email})</span>
                    </div>

                    {video.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {video.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {formatDate(video.created_at)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex lg:flex-col gap-2 shrink-0">
                    {video.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => openApproveDialog(video)}
                          disabled={actionLoading}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedVideo(video);
                            setRejectDialogOpen(true);
                          }}
                          disabled={actionLoading}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {video.status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(video)}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Export
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approve dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Video 🎉</DialogTitle>
            <DialogDescription>
              Add some positive feedback for the creator! This is optional but creators love hearing what you liked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Feedback (optional)</label>
              <Textarea
                placeholder="Great lighting! Love this location! 🔥"
                value={adminFeedback}
                onChange={(e) => setAdminFeedback(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={handleApprove}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <CheckCircle className="w-4 h-4 mr-1" />
              {adminFeedback ? "Approve with Feedback" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Video</DialogTitle>
            <DialogDescription>
              Provide feedback to help the creator improve their submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason code</label>
              <Select value={rejectionCode} onValueChange={setRejectionCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REJECTION_CODES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Note to creator (optional)</label>
              <Textarea
                placeholder="Explain why the video was rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Reject Video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
