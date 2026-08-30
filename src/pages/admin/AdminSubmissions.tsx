import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { batchFetchAll } from "@/lib/batch-fetch";
import { getVideoUrl } from "@/lib/storage";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Json } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Filter,
  Play,
  Check,
  X,
  Download,
  Clock,
  Video,
  Loader2,
  Upload,
  Zap,
  RefreshCw,
  AlertCircle,
  CheckSquare,
  Info,
  Trophy,
  Sparkles,
  Scissors,
  Columns2,
  Bookmark,
  BookmarkX,
  ArrowUpDown,
  CalendarDays,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  ClipboardCheck,
} from "lucide-react";
import { formatDistanceToNow, startOfWeek, subWeeks, subDays, isAfter } from "date-fns";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { CopyableVideoId, isLegacyVideoId } from "@/components/video/CopyableVideoId";
import { CommentBubble } from "@/components/video/CommentBubble";
import { VideoCommentThread } from "@/components/video/VideoCommentThread";
import { VideoTrimDialog } from "@/components/admin/VideoTrimDialog";
import { VideoCompareDialog } from "@/components/video/VideoCompareDialog";
import { VideoReviewDialog } from "@/components/video/VideoReviewDialog";
import { useAuth } from "@/lib/auth";
import { StickerPicker } from "@/components/chat/StickerPicker";

interface MentorProfile {
  id: string;
  full_name: string;
}

const FEEDBACK_REASONS = [
  "Audio Quality",
  "Lighting",
  "Script / Hook",
  "Brand Guidelines",
  "Too Short",
  "Wrong Format",
  "Low Resolution",
] as const;

interface Submission {
  id: string;
  title: string;
  description: string | null;
  unique_video_id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  status: "pending" | "approved" | "rejected" | "revision_requested" | "saved_for_later";
  created_at: string;
  rejection_reason: string | null;
  meta_status: string | null;
  meta_video_id: string | null;
  meta_error_reason: string | null;
  bounty_id: string | null;
  bounty_title?: string | null;
  hook_score: number | null;
  hook_analysis: string | null;
  ai_creative_insights: Json | null;
  analyzed_at: string | null;
  mentor_verdict: string | null;
  mentor_verdict_notes: string | null;
  mentor_verdict_by: string | null;
  similarity_flag?: boolean | null;
  similarity_reason?: string | null;
  rejection_reason_code?: string | null;
  mentor_verdict_by_name?: string | null;
  creator: {
    id: string;
    user_id: string;
    full_name: string;
    email: string;
    social_handles?: { instagram?: string } | null;
  };
}

export default function AdminSubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mentorVerdictFilter, setMentorVerdictFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all_time");
  const [sortDirection, setSortDirection] = useState<"newest" | "oldest">("newest");
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const reviewOpen = reviewIndex !== null;
  const selectedVideo = reviewIndex !== null ? filteredSubmissions[reviewIndex] ?? null : null;
  const touchStartX = useRef<number | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionCategories, setRejectionCategories] = useState<string[]>([]);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionCategories, setRevisionCategories] = useState<string[]>([]);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState("");
  const [approveStickers, setApproveStickers] = useState<string[]>([]);
  const [rejectStickers, setRejectStickers] = useState<string[]>([]);
  const [revisionStickers, setRevisionStickers] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [exportingVideoId, setExportingVideoId] = useState<string | null>(null);
  const [metaConnected, setMetaConnected] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("We discussed the fix, and you're either working on redoing the video or you've already redone the video and it's been approved. Thanks.");
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [activeCommentVideoId, setActiveCommentVideoId] = useState<string | null>(null);
  const [trimDialogOpen, setTrimDialogOpen] = useState(false);
  const [trimVideo, setTrimVideo] = useState<Submission | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [mentorDialogOpen, setMentorDialogOpen] = useState(false);
  const [mentorDialogVideo, setMentorDialogVideo] = useState<Submission | null>(null);
  const [mentors, setMentors] = useState<MentorProfile[]>([]);
  const [selectedMentorId, setSelectedMentorId] = useState<string>("");
  const [assigningMentor, setAssigningMentor] = useState(false);
  const [assignedVideoIds, setAssignedVideoIds] = useState<Set<string>>(new Set());
  const [mentorAdminNotes, setMentorAdminNotes] = useState("");
  const [assignmentDetails, setAssignmentDetails] = useState<Record<string, { mentor_name: string; status: string; mentor_notes: string | null; task_contacted: boolean; task_feedback_sent: boolean; task_example_shared: boolean }>>({});
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchSubmissions();
    checkMetaConnection();
    fetchMentors();
    fetchAssignedVideos();
  }, []);

  // Optimistic local state update — avoids full refetch after each action
  function updateSubmissionLocally(id: string, updates: Partial<Submission>) {
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }

  function removeSubmissionLocally(id: string) {
    setSubmissions(prev => prev.filter(s => s.id !== id));
  }

  useEffect(() => {
    filterSubmissions();
  }, [submissions, searchQuery, statusFilter, mentorVerdictFilter, dateRange, sortDirection]);

  async function checkMetaConnection() {
    const { data } = await supabase
      .from("meta_credentials")
      .select("status")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    setMetaConnected(!!data);
  }

  async function fetchMentors() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_mentor", true);
    setMentors(data || []);
  }

  async function fetchAssignedVideos() {
    const { data } = await supabase
      .from("mentor_assignments")
      .select("video_id");
    setAssignedVideoIds(new Set(data?.map(a => a.video_id) || []));
    fetchAssignmentDetails();
  }

  async function fetchAssignmentDetails() {
    const { data } = await supabase
      .from("mentor_assignments")
      .select("video_id, status, mentor_notes, task_contacted, task_feedback_sent, task_example_shared, mentor_id");
    if (!data || data.length === 0) return;

    const mentorIds = [...new Set(data.map(a => a.mentor_id))];
    const { data: mentorProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", mentorIds);
    const mentorMap = new Map(mentorProfiles?.map(p => [p.id, p.full_name]) || []);

    const details: Record<string, { mentor_name: string; status: string; mentor_notes: string | null; task_contacted: boolean; task_feedback_sent: boolean; task_example_shared: boolean }> = {};
    data.forEach(a => {
      details[a.video_id] = {
        mentor_name: mentorMap.get(a.mentor_id) || "Unknown",
        status: a.status,
        mentor_notes: a.mentor_notes,
        task_contacted: a.task_contacted,
        task_feedback_sent: a.task_feedback_sent,
        task_example_shared: a.task_example_shared,
      };
    });
    setAssignmentDetails(details);
  }

  async function handleAssignMentor() {
    if (!mentorDialogVideo || !selectedMentorId || !user) return;
    setAssigningMentor(true);
    try {
      const adminNotes = mentorAdminNotes.trim() || null;
      const { error } = await supabase
        .from("mentor_assignments")
        .insert({
          video_id: mentorDialogVideo.id,
          mentor_id: selectedMentorId,
          assigned_by: user.id,
          admin_notes: adminNotes,
        });

      if (error) throw error;

      // Fire-and-forget: send assignment notification email
      supabase.functions.invoke("notify-mentor-assignment", {
        body: {
          mentor_id: selectedMentorId,
          video_id: mentorDialogVideo.id,
        },
      }).catch(e => console.error("Failed to send mentor assignment notification:", e));

      toast({
        title: "Assigned to Mentor",
        description: `Video assigned for review`,
      });

      setMentorDialogOpen(false);
      setSelectedMentorId("");
      setMentorAdminNotes("");
      setAssignedVideoIds(prev => new Set([...prev, mentorDialogVideo.id]));
      fetchAssignmentDetails();
    } catch (error: any) {
      toast({
        title: "Assignment Failed",
        description: error.message?.includes("duplicate") ? "Already assigned to this mentor" : error.message,
        variant: "destructive",
      });
    } finally {
      setAssigningMentor(false);
    }
  }

  async function analyzeSubmission(videoId: string) {
    setAnalyzingId(videoId);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-video-hook", {
        body: { videoId },
      });
      if (error) throw error;
      toast({
        title: "AI Analysis Complete",
        description: `Hook Score: ${data.hook_score}/100`,
      });
      fetchSubmissions();
    } catch (error: any) {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze",
        variant: "destructive",
      });
    } finally {
      setAnalyzingId(null);
    }
  }

  async function fetchSubmissions() {
    try {
      const data = await batchFetchAll((from, to) =>
        supabase
          .from("videos")
          .select(`
            id,
            title,
            description,
            unique_video_id,
            video_url,
            thumbnail_url,
            status,
            created_at,
            rejection_reason,
            meta_status,
            meta_video_id,
            meta_error_reason,
            bounty_id,
            hook_score,
            hook_analysis,
            ai_creative_insights,
            analyzed_at,
            mentor_verdict,
            mentor_verdict_notes,
            mentor_verdict_by,
            similarity_flag,
            similarity_reason,
            rejection_reason_code,
            bounties:bounty_id(title),
            profiles:creator_id(id, user_id, full_name, email, social_handles)
          `)
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      // Fetch mentor names for verdict_by
      const verdictByIds = [...new Set((data || []).filter((v: any) => v.mentor_verdict_by).map((v: any) => v.mentor_verdict_by))];
      let mentorNameMap = new Map<string, string>();
      if (verdictByIds.length > 0) {
        const { data: mentorProfiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", verdictByIds);
        mentorNameMap = new Map(mentorProfiles?.map(p => [p.id, p.full_name]) || []);
      }

      const formatted = (data || []).map((v: any) => ({
        ...v,
        bounty_title: v.bounties?.title || null,
        creator: v.profiles,
        mentor_verdict_by_name: v.mentor_verdict_by ? mentorNameMap.get(v.mentor_verdict_by) || null : null,
      }));

      setSubmissions(formatted);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    } finally {
      setLoading(false);
    }
  }

  function getDateRangeCutoff(range: string): Date | null {
    const now = new Date();
    switch (range) {
      case "this_week":
        return startOfWeek(now, { weekStartsOn: 1 });
      case "last_week": {
        const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        return lastWeekStart;
      }
      case "last_2_weeks":
        return subWeeks(now, 2);
      case "last_30_days":
        return subDays(now, 30);
      default:
        return null;
    }
  }

  function filterSubmissions() {
    let filtered = [...submissions];

    if (statusFilter === "meta_uploaded_not_live") {
      filtered = filtered.filter(
        (s) => s.status === "approved" && s.meta_status === "uploaded"
      );
    } else if (statusFilter === "all") {
      // "All" excludes saved_for_later so they don't clutter the main view
      filtered = filtered.filter((s) => s.status !== "saved_for_later");
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((s) => s.status === statusFilter);
    }

    // Mentor verdict filter
    if (mentorVerdictFilter === "likely_approve") {
      filtered = filtered.filter((s) => s.mentor_verdict === "likely_approve");
    } else if (mentorVerdictFilter === "needs_work") {
      filtered = filtered.filter((s) => s.mentor_verdict === "needs_work");
    } else if (mentorVerdictFilter === "no_verdict") {
      filtered = filtered.filter((s) => !s.mentor_verdict);
    }

    // Date range filter
    const cutoff = getDateRangeCutoff(dateRange);
    if (cutoff) {
      filtered = filtered.filter((s) => isAfter(new Date(s.created_at), cutoff));
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.unique_video_id.toLowerCase().includes(query) ||
          s.creator?.full_name?.toLowerCase().includes(query)
      );
    }

    // Sort: mentor-approved pending videos to top, then by date
    filtered.sort((a, b) => {
      // If both are pending, prioritize mentor_verdict = likely_approve
      if (a.status === "pending" && b.status === "pending") {
        const aEndorsed = a.mentor_verdict === "likely_approve" ? 1 : 0;
        const bEndorsed = b.mentor_verdict === "likely_approve" ? 1 : 0;
        if (aEndorsed !== bEndorsed) return bEndorsed - aEndorsed;
      }
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortDirection === "newest" ? dateB - dateA : dateA - dateB;
    });

    setFilteredSubmissions(filtered);
  }

  // Auto-advance: move to next submission or close if at end
  const advanceReview = useCallback(() => {
    setReviewIndex(prev => {
      if (prev === null) return null;
      // After optimistic update, filteredSubmissions will re-render
      // Move to same index (next item shifts into position) or close
      return prev < filteredSubmissions.length - 1 ? prev : null;
    });
  }, [filteredSubmissions.length]);

  // Keyboard navigation for review mode
  useEffect(() => {
    if (!reviewOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && reviewIndex !== null && reviewIndex > 0) {
        setReviewIndex(reviewIndex - 1);
      } else if (e.key === "ArrowRight" && reviewIndex !== null && reviewIndex < filteredSubmissions.length - 1) {
        setReviewIndex(reviewIndex + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [reviewOpen, reviewIndex, filteredSubmissions.length]);

  function openApproveDialog(submission: Submission) {
    // Find index if not already in review mode
    if (reviewIndex === null) {
      const idx = filteredSubmissions.findIndex(s => s.id === submission.id);
      if (idx !== -1) setReviewIndex(idx);
    }
    setAdminFeedback("");
    setApproveStickers([]);
    setApproveDialogOpen(true);
  }

  async function handleApprove() {
    if (!selectedVideo) return;
    const video = selectedVideo;
    const feedback = adminFeedback;
    const stickers = [...approveStickers];

    // Optimistic: close approve dialog and advance to next
    setApproveDialogOpen(false);
    setAdminFeedback("");
    setApproveStickers([]);
    updateSubmissionLocally(video.id, { status: "approved", rejection_reason: null } as any);
    toast({ title: "Video Approved ✅", description: `"${video.title}" has been approved` });

    // DB update + notifications in background — no await blocking UI
    supabase
      .from("videos")
      .update({ 
        status: "approved", 
        rejection_reason: null,
        admin_feedback: feedback || null,
        admin_feedback_stickers: stickers.length > 0 ? stickers : null,
        approved_at: new Date().toISOString(),
      } as any)
      .eq("id", video.id)
      .then(({ error }) => {
        if (error) {
          console.error("Approve DB error:", error);
          toast({ title: "Save failed", description: error.message, variant: "destructive" });
          // Revert optimistic update
          updateSubmissionLocally(video.id, { status: "pending" } as any);
          return;
        }

        // Fire-and-forget notifications
        const feedbackText = feedback 
          ? `\n\nNote from your reviewer: "${feedback}"`
          : "";
        supabase.functions.invoke("send-notification-email", {
          body: {
            user_id: video.creator?.user_id,
            title: "Video approved",
            message: `Your video "${video.title}" has been approved and is now in use.${feedbackText}\n\nKeep your upload schedule consistent — that consistency is what keeps your commission on track.`,
            notification_type: "video",
            link: "/creator/my-videos",
            button_text: "View your video",
          },
        }).catch(e => console.error("Failed to send notification:", e));

        supabase.functions.invoke("notify-mentor-video-status", {
          body: { video_id: video.id, new_status: "approved" },
        }).catch(e => console.error("Failed to notify mentor:", e));

        if (video.creator?.user_id) {
          supabase.functions.invoke("broadcast-peer-notification", {
            body: {
              event_type: "video_approved",
              actor_name: video.creator?.full_name || "A creator",
              actor_user_id: video.creator.user_id,
            },
          }).catch(e => console.error("Failed to broadcast peer notification:", e));
        }
      });
  }

  async function handleReject() {
    if (!selectedVideo) return;
    const video = selectedVideo;

    const categoryPrefix = rejectionCategories.length > 0
      ? `[${rejectionCategories.join(", ")}] `
      : "";
    const fullReason = categoryPrefix + (rejectionReason || "");
    const stickerSuffix = rejectStickers.length > 0
      ? "\n\n" + rejectStickers.map(url => `[sticker:${url}]`).join(" ")
      : "";
    const combinedReason = (fullReason + stickerSuffix) || null;

    // Optimistic
    setRejectDialogOpen(false);
    setRejectionReason("");
    setRejectionCategories([]);
    setRejectStickers([]);
    updateSubmissionLocally(video.id, { status: "rejected" as any, rejection_reason: combinedReason });
    toast({ title: "Video Rejected", description: `"${video.title}" has been rejected` });

    supabase
      .from("videos")
      .update({ status: "rejected", rejection_reason: combinedReason })
      .eq("id", video.id)
      .then(({ error }) => {
        if (error) {
          console.error("Reject DB error:", error);
          toast({ title: "Save failed", description: error.message, variant: "destructive" });
          updateSubmissionLocally(video.id, { status: "pending" } as any);
          return;
        }

        supabase.functions.invoke("send-notification-email", {
          body: {
            user_id: video.creator?.user_id,
            title: "[Important] Video not approved",
            message: fullReason
              ? `Your video "${video.title}" was not approved.\n\nReason:\n${fullReason}\n\nReview the notes carefully and apply them to your next submission. Rejections are final, so use this feedback to make sure your next upload meets the standard.`
              : `Your video "${video.title}" was not approved.\n\nReview your dashboard for details and apply the feedback to your next upload. Rejections are final, so use this as direction for what to improve.`,
            notification_type: "video",
            link: "/creator/my-videos",
            button_text: "View details",
          },
        }).catch(e => console.error("Failed to send notification:", e));

        supabase.functions.invoke("notify-mentor-video-status", {
          body: { video_id: video.id, new_status: "rejected", rejection_reason: fullReason || null },
        }).catch(e => console.error("Failed to notify mentor:", e));
      });
  }

  async function handleRevision() {
    if (!selectedVideo) return;
    const video = selectedVideo;

    const categoryPrefix = revisionCategories.length > 0
      ? `[${revisionCategories.join(", ")}] `
      : "";
    const fullNotes = categoryPrefix + (revisionNotes || "");
    const stickerSuffix = revisionStickers.length > 0
      ? "\n\n" + revisionStickers.map(url => `[sticker:${url}]`).join(" ")
      : "";
    const combinedReason = (fullNotes + stickerSuffix) || null;

    // Optimistic
    setRevisionDialogOpen(false);
    setRevisionNotes("");
    setRevisionCategories([]);
    setRevisionStickers([]);
    updateSubmissionLocally(video.id, { status: "revision_requested" as any, rejection_reason: combinedReason });
    toast({ title: "Revision Requested", description: `"${video.title}" has been sent back for revision` });

    supabase
      .from("videos")
      .update({ 
        status: "revision_requested" as any, 
        rejection_reason: combinedReason,
      })
      .eq("id", video.id)
      .then(({ error }) => {
        if (error) {
          console.error("Revision DB error:", error);
          toast({ title: "Save failed", description: error.message, variant: "destructive" });
          updateSubmissionLocally(video.id, { status: "pending" } as any);
          return;
        }

        supabase.functions.invoke("send-notification-email", {
          body: {
            user_id: video.creator?.user_id,
            title: "Revision needed on your video 🔄",
            message: fullNotes
              ? `Your video "${video.title}" needs a small tweak before it goes live.\n\nHere's what to fix:\n\n${fullNotes}\n\nHit up your mentor if you need help — they've got your back. Fix it, resubmit, and let's get this one live. 💪`
              : `Your video "${video.title}" needs a quick fix before it goes live.\n\nCheck your dashboard for details and reach out to your mentor if you're unsure what to change. Fix it up and resubmit — you're close. 💪`,
            notification_type: "video",
            link: "/creator/my-videos",
            button_text: "Revise Your Video",
          },
        }).catch(e => console.error("Failed to send notification:", e));

        // Notify assigned mentor(s) about revision
        supabase.functions.invoke("notify-mentor-video-status", {
          body: { video_id: video.id, new_status: "revision_requested", rejection_reason: combinedReason },
        }).catch(e => console.error("Failed to notify mentor:", e));
      });
  }

  async function handleExportToMeta(submission: Submission, retry = false) {
    if (!metaConnected) {
      toast({
        title: "Meta Ads Not Connected",
        description: "Please connect Meta Ads in Settings first",
        variant: "destructive",
      });
      return;
    }

    setExportingVideoId(submission.id);

    try {
      const { data, error } = await supabase.functions.invoke("meta-upload-video", {
        body: { videoId: submission.id, retry },
      });

      // When the backend returns a non-2xx status, supabase-js sets `error.message`
      // to a generic string. The actual JSON body (with our `error` field) is in
      // `error.context.body`. Extract it so admins see the real reason.
      if (error) {
        const body = (error as any)?.context?.body;
        if (typeof body === "string") {
          try {
            const parsed = JSON.parse(body);
            if (parsed?.error) throw new Error(parsed.error);
          } catch {
            // ignore JSON parse errors and fall back to the generic error message
          }
        }
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Exported to Meta",
        description: `"${submission.title}" has been uploaded to Meta Ads${data.partnership_ads ? " with creator attribution" : ""}`,
      });

      updateSubmissionLocally(submission.id, { meta_status: "uploaded" } as any);
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export video to Meta",
        variant: "destructive",
      });
    } finally {
      setExportingVideoId(null);
    }
  }

  async function handleSaveForLater(submission: Submission) {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("videos")
        .update({ status: "saved_for_later" as any })
        .eq("id", submission.id);
      if (error) throw error;
      toast({ title: "Saved for Later", description: `"${submission.title}" moved to saved` });
      setReviewIndex(null);
      updateSubmissionLocally(submission.id, { status: "saved_for_later" as any });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnsave(submission: Submission) {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("videos")
        .update({ status: "pending" as any })
        .eq("id", submission.id);
      if (error) throw error;
      toast({ title: "Unsaved", description: `"${submission.title}" moved back to pending` });
      updateSubmissionLocally(submission.id, { status: "pending" as any });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Rejected</Badge>;
      case "revision_requested":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">Revision Requested</Badge>;
      case "saved_for_later":
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30"><Bookmark className="w-3 h-3 mr-1" />Saved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getMetaStatusBadge(submission: Submission) {
    if (!submission.meta_status || submission.meta_status === "not_uploaded") {
      return null;
    }

    const statusConfig: Record<string, { label: string; className: string; icon?: React.ReactNode }> = {
      uploading: {
        label: "Uploading",
        className: "bg-warning/10 text-warning border-warning/30",
        icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" />,
      },
      uploaded: {
        label: "On Meta",
        className: "bg-info/10 text-info border-info/30",
      },
      paused: {
        label: "Paused",
        className: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      },
      live: {
        label: "Live",
        className: "bg-success/10 text-success border-success/30",
        icon: <Zap className="w-3 h-3 mr-1" />,
      },
      error: {
        label: "Error",
        className: "bg-destructive/10 text-destructive border-destructive/30",
        icon: <AlertCircle className="w-3 h-3 mr-1" />,
      },
    };

    const config = statusConfig[submission.meta_status];
    if (!config) return null;

    if (submission.meta_status === "error" && submission.meta_error_reason) {
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
              <p className="max-w-xs">{submission.meta_error_reason}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Badge variant="outline" className={`${config.className} flex items-center`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  }

  // Bulk action handlers
  function toggleSelectAll() {
    const selectableIds = filteredSubmissions.filter(s => s.status === "pending" || s.status === "revision_requested").map(s => s.id);
    if (selectedIds.size === selectableIds.length && selectableIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }

  function toggleSelect(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const { error } = await supabase
        .from("videos")
        .update({ status: "approved", rejection_reason: null, approved_at: new Date().toISOString() } as any)
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      // Send notifications to all creators whose videos were approved
      const approvedVideos = submissions.filter(s => selectedIds.has(s.id));
      const uniqueCreators = new Map<string, { userId: string; creatorName: string; videoTitles: string[] }>();
      
      approvedVideos.forEach(video => {
        if (video.creator?.user_id) {
          const existing = uniqueCreators.get(video.creator.user_id);
          if (existing) {
            existing.videoTitles.push(video.title);
          } else {
            uniqueCreators.set(video.creator.user_id, { 
              userId: video.creator.user_id, 
              creatorName: video.creator?.full_name || "A creator",
              videoTitles: [video.title] 
            });
          }
        }
      });

      // Fire-and-forget: send notifications in background
      for (const [_, creatorInfo] of uniqueCreators) {
        const count = creatorInfo.videoTitles.length;
        supabase.functions.invoke("send-notification-email", {
          body: {
            user_id: creatorInfo.userId,
            title: count > 1 ? `${count} videos approved` : "Video approved",
            message: count > 1 
              ? `${count} of your videos have been approved and are now in use.\n\nKeep your upload schedule consistent — that consistency is what keeps your commission on track.`
              : `Your video "${creatorInfo.videoTitles[0]}" has been approved and is now in use.\n\nKeep your upload schedule consistent — that consistency is what keeps your commission on track.`,
            notification_type: "video",
            link: "/creator/my-videos",
            button_text: "View your videos",
          },
        }).catch(e => console.error("Failed to send notification:", e));

        // Broadcast peer notification for each approved creator (use real name, not generic)
        supabase.functions.invoke("broadcast-peer-notification", {
          body: {
            event_type: "video_approved",
            actor_name: creatorInfo.creatorName,
            actor_user_id: creatorInfo.userId,
            details: { video_count: count },
          },
        }).catch(e => console.error("Failed to broadcast peer notification:", e));
      }

      toast({
        title: "Videos Approved",
        description: `${selectedIds.size} videos have been approved`,
      });

      setSelectedIds(new Set());
      fetchSubmissions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function handleBulkReject() {
    if (selectedIds.size === 0) return;
    const reason = bulkRejectReason.trim() || null;
    setBulkActionLoading(true);
    try {
      const { error } = await supabase
        .from("videos")
        .update({ status: "rejected", rejection_reason: reason })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      // Send notifications to all creators whose videos were rejected
      const rejectedVideos = submissions.filter(s => selectedIds.has(s.id));
      const uniqueCreators = new Map<string, { userId: string; videoTitles: string[] }>();
      
      rejectedVideos.forEach(video => {
        if (video.creator?.user_id) {
          const existing = uniqueCreators.get(video.creator.user_id);
          if (existing) {
            existing.videoTitles.push(video.title);
          } else {
            uniqueCreators.set(video.creator.user_id, { 
              userId: video.creator.user_id, 
              videoTitles: [video.title] 
            });
          }
        }
      });

      // Fire-and-forget: send notifications in background
      for (const [_, creatorInfo] of uniqueCreators) {
        const count = creatorInfo.videoTitles.length;
        const reasonText = reason ? `\n\n${reason}` : "";
        supabase.functions.invoke("send-notification-email", {
          body: {
            user_id: creatorInfo.userId,
            title: count > 1 ? `[Important] ${count} videos not approved` : "[Important] Video not approved",
            message: count > 1 
              ? `${count} of your videos were not approved.${reasonText}\n\nReview the notes and apply them to your next submissions. Rejections are final, so use this feedback as direction for what to improve.`
              : `Your video "${creatorInfo.videoTitles[0]}" was not approved.${reasonText}\n\nReview the notes and apply them to your next submission. Rejections are final, so use this feedback as direction for what to improve.`,
            notification_type: "video",
            link: "/creator/my-videos",
            button_text: "View details",
          },
        }).catch(e => console.error("Failed to send notification:", e));
      }

      toast({
        title: "Videos Rejected",
        description: `${selectedIds.size} videos have been rejected`,
      });

      setSelectedIds(new Set());
      setBulkRejectDialogOpen(false);
      fetchSubmissions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBulkActionLoading(false);
    }
  }

  const pendingCount = submissions.filter((s) => s.status === "pending").length;
  const savedCount = submissions.filter((s) => s.status === "saved_for_later").length;
  const revisionCount = submissions.filter((s) => s.status === "revision_requested").length;
  const approvedNotExported = submissions.filter(
    (s) => s.status === "approved" && (!s.meta_status || s.meta_status === "not_uploaded")
  ).length;
  const unlaunchedCount = submissions.filter(
    (s) => s.status === "approved" && s.meta_status === "uploaded"
  ).length;
  const selectableInFiltered = filteredSubmissions.filter(s => s.status === "pending" || s.status === "revision_requested").length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Video Review</h1>
          <p className="text-sm text-muted-foreground">
            Review and approve creator videos • Search by V##-# ID for quick lookup
            {pendingCount > 0 && (
              <span className="ml-2 text-warning font-medium">
                ({pendingCount} pending)
              </span>
            )}
            {revisionCount > 0 && (
              <span className="ml-2 text-amber-500 font-medium">
                ({revisionCount} in revision)
              </span>
            )}
            {savedCount > 0 && (
              <span className="ml-2 text-muted-foreground font-medium">
                ({savedCount} saved)
              </span>
            )}
            {approvedNotExported > 0 && metaConnected && (
              <span className="ml-2 text-primary font-medium">
                ({approvedNotExported} ready to export)
              </span>
            )}
            {unlaunchedCount > 0 && metaConnected && (
              <span className="ml-2 text-amber-500 font-medium">
                ({unlaunchedCount} unlaunched)
              </span>
            )}
          </p>
        </div>

        {/* Legacy ID Info Banner - show only if there are legacy IDs */}
        {submissions.some(s => isLegacyVideoId(s.unique_video_id)) && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            <Info className="w-4 h-4 shrink-0" />
            <span>
              Some videos have legacy IDs (pre-tracking system). New uploads use the V##-# format for easier tracking.
            </span>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, ID, or creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="revision_requested">Revision Requested</SelectItem>
              <SelectItem value="saved_for_later">Saved for Later</SelectItem>
              <SelectItem value="meta_uploaded_not_live">Uploaded, Not Live</SelectItem>
            </SelectContent>
          </Select>
          <Select value={mentorVerdictFilter} onValueChange={setMentorVerdictFilter}>
            <SelectTrigger className="w-[170px]">
              <ShieldCheck className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Mentor verdict" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Verdicts</SelectItem>
              <SelectItem value="likely_approve">Likely Approve</SelectItem>
              <SelectItem value="needs_work">Needs Work</SelectItem>
              <SelectItem value="no_verdict">No Verdict</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[160px]">
              <CalendarDays className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_time">All Time</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_week">Last Week</SelectItem>
              <SelectItem value="last_2_weeks">Last 2 Weeks</SelectItem>
              <SelectItem value="last_30_days">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortDirection(d => d === "newest" ? "oldest" : "newest")}
            className="gap-1.5"
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortDirection === "newest" ? "Newest" : "Oldest"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
            <Columns2 className="w-4 h-4 mr-2" />
            Compare
          </Button>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-3 md:p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-primary" />
              <span className="font-medium text-sm">{selectedIds.size} selected</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="success" onClick={handleBulkApprove} disabled={bulkActionLoading}>
                {bulkActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                Approve All
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setBulkRejectDialogOpen(true)} disabled={bulkActionLoading}>
                <X className="w-4 h-4 mr-1" />
                Reject All
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Submissions Grid */}
        {loading ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-72 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="stat-card text-center py-16">
            <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No submissions found</h3>
            <p className="text-sm text-muted-foreground">
              {submissions.length === 0
                ? "Videos will appear here when creators submit them"
                : "Try adjusting your filters"}
            </p>
          </div>
        ) : (
          <>
            {/* Select All for pending + revision */}
            {selectableInFiltered > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <Checkbox
                  checked={selectedIds.size === selectableInFiltered && selectableInFiltered > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">
                  Select all ({selectableInFiltered})
                </span>
              </div>
            )}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredSubmissions.map((submission) => (
                <div
                  key={submission.id}
                  className={`stat-card group transition-colors relative ${
                    selectedIds.has(submission.id) 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "hover:border-primary/30"
                  }`}
                >
                  {/* Selection checkbox for pending + revision */}
                  {(submission.status === "pending" || submission.status === "revision_requested") && (
                    <div className="absolute top-2 left-2 z-10">
                      <Checkbox
                        checked={selectedIds.has(submission.id)}
                        onCheckedChange={() => toggleSelect(submission.id)}
                        className="bg-background border-2"
                      />
                    </div>
                  )}
                  
                  {/* 9:16 Thumbnail */}
                  <div className="flex justify-center mb-4">
                    <VideoThumbnail
                      thumbnailUrl={submission.thumbnail_url}
                      videoUrl={submission.video_url}
                      title={submission.title}
                      status={submission.status}
                      adminEdited={!!(submission as any).admin_edited}
                      size="lg"
                      className="w-full max-w-xs mx-auto"
                      onClick={() => {
                        const idx = filteredSubmissions.findIndex(s => s.id === submission.id);
                        setReviewIndex(idx !== -1 ? idx : null);
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap justify-center gap-1 -mt-2 mb-2">
                    {getMetaStatusBadge(submission)}
                    {submission.bounty_id && (
                      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">
                        <Trophy className="w-3 h-3 mr-1" />
                        {submission.bounty_title || "Bounty"}
                      </Badge>
                    )}
                    {submission.mentor_verdict === "likely_approve" && (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Mentor: Likely Approve
                      </Badge>
                    )}
                    {submission.mentor_verdict === "needs_work" && (
                      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Mentor: Needs Work
                      </Badge>
                    )}
                    {submission.similarity_flag && (
                      <Badge
                        variant="outline"
                        title={submission.similarity_reason || "Possible duplicate / batch upload"}
                        className="bg-warning/10 text-warning border-warning/40 text-[10px]"
                      >
                        ⚠ Similar
                      </Badge>
                    )}
                  </div>

                {/* Info */}
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold truncate">{submission.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <CopyableVideoId videoId={submission.unique_video_id} variant="badge" />
                      {isLegacyVideoId(submission.unique_video_id) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Legacy ID format (pre-tracking system)</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {submission.creator?.full_name?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block">{submission.creator?.full_name}</span>
                      {submission.creator?.social_handles?.instagram && (
                        <span className="text-xs text-muted-foreground">
                          @{submission.creator.social_handles.instagram}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}
                    </span>
                    <CommentBubble
                      videoId={submission.id}
                      onClick={() => setActiveCommentVideoId(submission.id)}
                    />
                  </div>

                  {/* AI Pre-screening Hints */}
                  {submission.status === "pending" && (
                    <div className="space-y-2">
                      {submission.hook_score !== null ? (
                        <div className="p-2 rounded-lg bg-primary/5 border border-primary/10">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-primary" />
                              <span className="text-xs font-medium">AI Hook Score</span>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${
                                submission.hook_score >= 70
                                  ? "bg-success/10 text-success border-success/30"
                                  : submission.hook_score >= 40
                                  ? "bg-warning/10 text-warning border-warning/30"
                                  : "bg-destructive/10 text-destructive border-destructive/30"
                              }`}
                            >
                              {submission.hook_score}/100
                            </Badge>
                          </div>
                          {submission.hook_analysis && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{submission.hook_analysis}</p>
                          )}
                          {submission.ai_creative_insights && (() => {
                            const insights = submission.ai_creative_insights as any;
                            const improvements = insights?.improvements?.slice(0, 2) || [];
                            if (improvements.length === 0) return null;
                            return (
                              <div className="mt-1.5 space-y-0.5">
                                {improvements.map((imp: string, i: number) => (
                                  <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                                    <span className="text-warning shrink-0">•</span>
                                    <span className="line-clamp-1">{imp}</span>
                                  </p>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          onClick={() => analyzeSubmission(submission.id)}
                          disabled={analyzingId === submission.id}
                        >
                          {analyzingId === submission.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3 mr-1" />
                          )}
                          AI Pre-screen
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Detailed review */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => {
                      setReviewVideo(submission);
                      setReviewDialogOpen(true);
                    }}
                  >
                    <ClipboardCheck className="w-4 h-4 mr-1" />
                    Detailed review
                  </Button>

                  {/* Actions */}
                  {submission.status === "saved_for_later" ? (
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleUnsave(submission)}
                        disabled={actionLoading}
                      >
                        <BookmarkX className="w-4 h-4 mr-1" />
                        Unsave
                      </Button>
                      <Button
                        size="sm"
                        variant="success"
                        className="flex-1"
                        onClick={() => openApproveDialog(submission)}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  ) : (submission.status === "pending" || submission.status === "revision_requested") ? (
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          className="flex-1"
                          onClick={() => openApproveDialog(submission)}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        {submission.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                            onClick={() => {
                              const idx = filteredSubmissions.findIndex(s => s.id === submission.id);
                              if (idx !== -1) setReviewIndex(idx);
                              setRevisionDialogOpen(true);
                            }}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Revision
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={() => {
                            const idx = filteredSubmissions.findIndex(s => s.id === submission.id);
                            if (idx !== -1) setReviewIndex(idx);
                            setRejectDialogOpen(true);
                          }}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                      {submission.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full text-muted-foreground hover:text-foreground"
                          onClick={() => handleSaveForLater(submission)}
                          disabled={actionLoading}
                        >
                          <Bookmark className="w-4 h-4 mr-1" />
                          Save for Later
                        </Button>
                      )}
                    </div>
                    ) : submission.status === "rejected" ? (
                    <div className="pt-2 border-t">
                      {assignedVideoIds.has(submission.id) ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-success">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Assigned to {assignmentDetails[submission.id]?.mentor_name || "Mentor"}
                            {assignmentDetails[submission.id]?.status === "completed" && (
                              <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30 ml-1">Done</Badge>
                            )}
                          </div>
                          {/* Task progress */}
                          {assignmentDetails[submission.id] && (
                            <div className="text-[10px] text-muted-foreground space-y-0.5">
                              <p className={assignmentDetails[submission.id].task_contacted ? "text-success" : ""}>
                                {assignmentDetails[submission.id].task_contacted ? "✅" : "⬜"} Contacted creator
                              </p>
                              <p className={assignmentDetails[submission.id].task_feedback_sent ? "text-success" : ""}>
                                {assignmentDetails[submission.id].task_feedback_sent ? "✅" : "⬜"} Feedback sent
                              </p>
                              <p className={assignmentDetails[submission.id].task_example_shared ? "text-success" : ""}>
                                {assignmentDetails[submission.id].task_example_shared ? "✅" : "⬜"} Example shared
                              </p>
                            </div>
                          )}
                          {/* Mentor notes */}
                          {assignmentDetails[submission.id]?.mentor_notes && (
                            <div className="p-2 rounded-lg bg-muted">
                              <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Mentor Update</p>
                              <p className="text-xs">{assignmentDetails[submission.id].mentor_notes}</p>
                            </div>
                          )}
                        </div>
                      ) : mentors.length > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => {
                            setMentorDialogVideo(submission);
                            setSelectedMentorId("");
                            setMentorDialogOpen(true);
                          }}
                        >
                          <UserPlus className="w-4 h-4 mr-1" />
                          Assign to Mentor
                        </Button>
                      ) : null}
                    </div>
                    ) : submission.status === "approved" && (
                    <div className="pt-2 border-t space-y-2">
                      {/* Trim button - always available for approved videos */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-warning/30 text-warning hover:bg-warning/10"
                        onClick={() => {
                          setTrimVideo(submission);
                          setTrimDialogOpen(true);
                        }}
                      >
                        <Scissors className="w-4 h-4 mr-2" />
                        Trim Video
                      </Button>
                      {metaConnected && (
                        <>
                          {submission.meta_status === "error" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() => handleExportToMeta(submission, true)}
                              disabled={exportingVideoId === submission.id}
                            >
                              {exportingVideoId === submission.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4 mr-2" />
                              )}
                              Retry Export
                            </Button>
                          ) : !submission.meta_status || submission.meta_status === "not_uploaded" ? (
                            <Button
                              size="sm"
                              variant="default"
                              className="w-full bg-[#1877F2] hover:bg-[#166FE5]"
                              onClick={() => handleExportToMeta(submission)}
                              disabled={exportingVideoId === submission.id}
                            >
                              {exportingVideoId === submission.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4 mr-2" />
                              )}
                              Export to Meta
                            </Button>
                          ) : (
                            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                              <Zap className="w-4 h-4 text-success" />
                              <span>Exported to Meta</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
      {/* Review Modal with Navigation */}
      <Dialog open={reviewOpen} onOpenChange={(open) => { if (!open) setReviewIndex(null); }}>
        <DialogContent
          className="max-w-3xl bg-background/95 backdrop-blur-md border-border/50"
          onPointerDown={(e) => { touchStartX.current = e.clientX; }}
          onPointerUp={(e) => {
            if (touchStartX.current === null) return;
            const diff = e.clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(diff) < 60) return;
            if (diff > 0 && reviewIndex !== null && reviewIndex > 0) setReviewIndex(reviewIndex - 1);
            if (diff < 0 && reviewIndex !== null && reviewIndex < filteredSubmissions.length - 1) setReviewIndex(reviewIndex + 1);
          }}
        >
          {/* Navigation header */}
          <div className="flex items-center justify-between -mt-2 mb-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={reviewIndex === null || reviewIndex <= 0}
              onClick={() => reviewIndex !== null && setReviewIndex(reviewIndex - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground font-medium">
              {reviewIndex !== null ? reviewIndex + 1 : 0} of {filteredSubmissions.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={reviewIndex === null || reviewIndex >= filteredSubmissions.length - 1}
              onClick={() => reviewIndex !== null && setReviewIndex(reviewIndex + 1)}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <DialogHeader>
            <DialogTitle>{selectedVideo?.title}</DialogTitle>
            <DialogDescription>
              Submitted by {selectedVideo?.creator?.full_name} •{" "}
              ID: {selectedVideo?.unique_video_id}
              {selectedVideo?.creator?.social_handles?.instagram && (
                <span className="ml-2">• @{selectedVideo.creator.social_handles.instagram}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Video Preview */}
            <div className="aspect-video bg-muted rounded-lg overflow-hidden">
              {selectedVideo?.video_url ? (
                <video
                  src={getVideoUrl(selectedVideo.video_url) || undefined}
                  controls
                  className="w-full h-full"
                />
              ) : selectedVideo?.thumbnail_url ? (
                <img
                  src={selectedVideo.thumbnail_url}
                  alt={selectedVideo.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video className="w-16 h-16 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Description */}
            {selectedVideo?.description && (
              <div>
                <h4 className="text-sm font-medium mb-1">Description</h4>
                <p className="text-sm text-muted-foreground">{selectedVideo.description}</p>
              </div>
            )}

            {/* Creator Info */}
            <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
              <Avatar>
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedVideo?.creator?.full_name?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{selectedVideo?.creator?.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedVideo?.creator?.email}
                  {selectedVideo?.creator?.social_handles?.instagram && (
                    <span className="ml-2">• @{selectedVideo.creator.social_handles.instagram}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Mentor Verdict */}
            {selectedVideo?.mentor_verdict && (
              <div className={`flex items-start gap-2 p-3 rounded-lg ${
                selectedVideo.mentor_verdict === "likely_approve" 
                  ? "bg-success/10 border border-success/20" 
                  : "bg-amber-500/10 border border-amber-500/20"
              }`}>
                <ShieldCheck className={`w-4 h-4 mt-0.5 ${
                  selectedVideo.mentor_verdict === "likely_approve" ? "text-success" : "text-amber-500"
                }`} />
                <div>
                  <p className="text-sm font-medium">
                    Mentor Verdict: {selectedVideo.mentor_verdict === "likely_approve" ? "Likely Approve ✅" : "Needs Work 📝"}
                    {selectedVideo.mentor_verdict_by_name && (
                      <span className="text-xs font-normal text-muted-foreground ml-2">
                        by {selectedVideo.mentor_verdict_by_name}
                      </span>
                    )}
                  </p>
                  {selectedVideo.mentor_verdict_notes && (
                    <p className="text-xs text-muted-foreground mt-1">"{selectedVideo.mentor_verdict_notes}"</p>
                  )}
                </div>
              </div>
            )}

            {/* Meta Status */}
            {selectedVideo?.meta_status && selectedVideo.meta_status !== "not_uploaded" && (
              <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg">
                <Zap className="w-4 h-4 text-success" />
                <div>
                  <p className="text-sm font-medium">Meta Ads Status</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedVideo.meta_status === "uploaded" && "Video uploaded to Meta"}
                    {selectedVideo.meta_status === "live" && "Video is live in Meta Ads"}
                    {selectedVideo.meta_status === "error" && `Error: ${selectedVideo.meta_error_reason}`}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {selectedVideo?.video_url && (
              <Button variant="outline" asChild>
                <a href={selectedVideo.video_url} download>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
              </Button>
            )}
            {selectedVideo?.status === "approved" && metaConnected && 
              (!selectedVideo.meta_status || selectedVideo.meta_status === "not_uploaded" || selectedVideo.meta_status === "error") && (
              <Button
                variant="default"
                className="bg-[#1877F2] hover:bg-[#166FE5]"
                onClick={() => selectedVideo && handleExportToMeta(selectedVideo, selectedVideo.meta_status === "error")}
                disabled={exportingVideoId === selectedVideo?.id}
              >
                {exportingVideoId === selectedVideo?.id ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {selectedVideo.meta_status === "error" ? "Retry Export" : "Export to Meta"}
              </Button>
            )}
            {selectedVideo?.status === "saved_for_later" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => selectedVideo && handleUnsave(selectedVideo)}
                  disabled={actionLoading}
                >
                  <BookmarkX className="w-4 h-4 mr-2" />
                  Unsave
                </Button>
                <Button
                  variant="success"
                  onClick={() => selectedVideo && openApproveDialog(selectedVideo)}
                  disabled={actionLoading}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
            {(selectedVideo?.status === "pending" || selectedVideo?.status === "revision_requested") && (
              <>
                {selectedVideo?.status === "pending" && (
                  <Button
                    variant="ghost"
                    onClick={() => selectedVideo && handleSaveForLater(selectedVideo)}
                    disabled={actionLoading}
                  >
                    <Bookmark className="w-4 h-4 mr-2" />
                    Save for Later
                  </Button>
                )}
                <Button
                  variant="destructive"
                    onClick={() => {
                      setRejectDialogOpen(true);
                    }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                {selectedVideo?.status === "pending" && (
                  <Button
                    className="bg-amber-500 hover:bg-amber-600 text-white"
                    onClick={() => {
                      setRevisionDialogOpen(true);
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Revision
                  </Button>
                )}
                <Button
                  variant="success"
                  onClick={() => selectedVideo && openApproveDialog(selectedVideo)}
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <Check className="w-4 h-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Video 🎉</DialogTitle>
            <DialogDescription>
              Add some positive feedback for the creator! This is optional but creators love hearing what you liked.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <Textarea
                placeholder="Great lighting! Love this location! 🔥"
                value={adminFeedback}
                onChange={(e) => setAdminFeedback(e.target.value)}
                rows={3}
                className="flex-1"
              />
              <StickerPicker
                onSelect={(url) => setApproveStickers(prev => [...prev, url])}
                size="sm"
              />
            </div>
            {approveStickers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {approveStickers.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="Sticker" className="w-12 h-12 object-contain rounded-lg border bg-muted p-1" />
                    <button
                      type="button"
                      onClick={() => setApproveStickers(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
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
              <Check className="w-4 h-4 mr-2" />
              {adminFeedback ? "Approve with Feedback" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Video</DialogTitle>
            <DialogDescription>
              Select the issues and optionally add more detail.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            {FEEDBACK_REASONS.map((reason) => {
              const selected = rejectionCategories.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() =>
                    setRejectionCategories((prev) =>
                      selected ? prev.filter((r) => r !== reason) : [...prev, reason]
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selected
                      ? "bg-destructive/10 text-destructive border-destructive/40"
                      : "bg-muted/50 text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  {reason}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <Textarea
                placeholder="Additional notes (optional)..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="flex-1"
              />
              <StickerPicker
                onSelect={(url) => setRejectStickers(prev => [...prev, url])}
                size="sm"
              />
            </div>
            {rejectStickers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {rejectStickers.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="Sticker" className="w-12 h-12 object-contain rounded-lg border bg-muted p-1" />
                    <button
                      type="button"
                      onClick={() => setRejectStickers(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
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

      {/* Revision Dialog */}
      <Dialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revision 🔄</DialogTitle>
            <DialogDescription>
              Select what needs to change. The creator will be able to resubmit.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            {FEEDBACK_REASONS.map((reason) => {
              const selected = revisionCategories.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() =>
                    setRevisionCategories((prev) =>
                      selected ? prev.filter((r) => r !== reason) : [...prev, reason]
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selected
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/40"
                      : "bg-muted/50 text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  {reason}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <Textarea
                placeholder="Additional notes (optional)... e.g. 'Lighting is too dark, try near a window'"
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                rows={3}
                className="flex-1"
              />
              <StickerPicker
                onSelect={(url) => setRevisionStickers(prev => [...prev, url])}
                size="sm"
              />
            </div>
            {revisionStickers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {revisionStickers.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="Sticker" className="w-12 h-12 object-contain rounded-lg border bg-muted p-1" />
                    <button
                      type="button"
                      onClick={() => setRevisionStickers(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleRevision}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <RefreshCw className="w-4 h-4 mr-2" />
              Request Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Comment Thread */}
      <VideoCommentThread
        videoId={activeCommentVideoId}
        videoTitle={submissions.find(s => s.id === activeCommentVideoId)?.title}
        isAdmin={true}
        open={!!activeCommentVideoId}
        onOpenChange={(open) => !open && setActiveCommentVideoId(null)}
      />

      {/* Video Trim Dialog */}
      {trimVideo && (
        <VideoTrimDialog
          open={trimDialogOpen}
          onOpenChange={setTrimDialogOpen}
          videoId={trimVideo.id}
          videoUrl={trimVideo.video_url}
          videoTitle={trimVideo.title}
          onTrimComplete={() => fetchSubmissions()}
        />
      )}

      <VideoCompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        preselectedIds={selectedIds.size === 2 ? Array.from(selectedIds) : undefined}
      />

      {/* Mentor Assignment Dialog */}
      <Dialog open={mentorDialogOpen} onOpenChange={setMentorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Assign to Mentor
            </DialogTitle>
            <DialogDescription>
              Choose a mentor to review "{mentorDialogVideo?.title}" and help the creator improve.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Select value={selectedMentorId} onValueChange={setSelectedMentorId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a mentor..." />
              </SelectTrigger>
              <SelectContent>
                {mentors.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Admin notes for the mentor (optional) — e.g. 'Focus on their lighting and hook'"
              value={mentorAdminNotes}
              onChange={(e) => setMentorAdminNotes(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMentorDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignMentor}
              disabled={!selectedMentorId || assigningMentor}
            >
              {assigningMentor && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <UserPlus className="w-4 h-4 mr-2" />
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Reject Dialog */}
      <Dialog open={bulkRejectDialogOpen} onOpenChange={setBulkRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {selectedIds.size} Video{selectedIds.size !== 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              This comment will be sent to each creator via email. You can edit it before confirming.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rejection Comment</label>
              <Textarea
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                rows={4}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkReject}
              disabled={bulkActionLoading}
            >
              {bulkActionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Reject {selectedIds.size} Video{selectedIds.size !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
