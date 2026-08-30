import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { FeedbackStickers, parseStickersFromText } from "@/components/video/FeedbackStickers";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  MessageSquare,
  Send,
  Video,
  ShieldCheck,
  CheckCircle,
  ClipboardList,
  FileText,
  Users,
} from "lucide-react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { VideoPreviewDialog } from "@/components/video/VideoPreviewDialog";

import { useToast } from "@/hooks/use-toast";

interface MentorAssignment {
  id: string;
  video_id: string;
  status: string;
  task_contacted: boolean;
  task_feedback_sent: boolean;
  task_example_shared: boolean;
  mentor_notes: string | null;
  admin_notes: string | null;
  created_at: string;
  video: {
    id: string;
    title: string;
    unique_video_id: string;
    video_url: string | null;
    thumbnail_url: string | null;
    rejection_reason: string | null;
    admin_feedback: string | null;
    created_at: string;
    creator_id: string;
  };
  creator_name: string;
  creator_user_id: string;
}

interface AssignedCreator {
  id: string;
  creator_id: string;
  creator_name: string;
  creator_user_id: string;
  notes: string | null;
  videos: {
    id: string;
    title: string;
    unique_video_id: string;
    video_url: string | null;
    thumbnail_url: string | null;
    status: string;
    created_at: string;
    mentor_verdict: string | null;
    mentor_verdict_notes: string | null;
  }[];
}

export default function CreatorContentReview() {
  const { profileId, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<MentorAssignment[]>([]);
  const [assignedCreators, setAssignedCreators] = useState<AssignedCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorsLoading, setCreatorsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [submittingMap, setSubmittingMap] = useState<Record<string, boolean>>({});
  const [verdictNotesMap, setVerdictNotesMap] = useState<Record<string, string>>({});
  const [showNeedsWorkInput, setShowNeedsWorkInput] = useState<Record<string, boolean>>({});
  const [previewVideo, setPreviewVideo] = useState<{ url: string | null; title: string } | null>(null);
  const [activeTab, setActiveTab] = useState("creators");

  useEffect(() => {
    if (profileId) {
      fetchAssignments();
      fetchAssignedCreators();
    }
  }, [profileId]);

  async function fetchAssignedCreators() {
    try {
      // Get creator assignments for this mentor
      const { data: creatorAssignments, error } = await supabase
        .from("mentor_creator_assignments")
        .select("id, creator_id, notes")
        .eq("mentor_id", profileId!)
        .eq("status", "active");

      if (error) throw error;
      if (!creatorAssignments || creatorAssignments.length === 0) {
        setAssignedCreators([]);
        setCreatorsLoading(false);
        return;
      }

      const creatorIds = creatorAssignments.map(a => a.creator_id);

      // Fetch creator profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, user_id")
        .in("id", creatorIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Fetch all videos for these creators
      const { data: videos } = await supabase
        .from("videos")
        .select("id, title, unique_video_id, video_url, thumbnail_url, status, created_at, creator_id, mentor_verdict, mentor_verdict_notes")
        .in("creator_id", creatorIds)
        .order("created_at", { ascending: false });

      const videosByCreator = new Map<string, typeof videos>();
      (videos || []).forEach(v => {
        const existing = videosByCreator.get(v.creator_id) || [];
        existing.push(v);
        videosByCreator.set(v.creator_id, existing);
      });

      const mapped: AssignedCreator[] = creatorAssignments.map(a => {
        const profile = profileMap.get(a.creator_id);
        return {
          ...a,
          creator_name: profile?.full_name || "Unknown Creator",
          creator_user_id: profile?.user_id || "",
          videos: videosByCreator.get(a.creator_id) || [],
        };
      });

      setAssignedCreators(mapped);
    } catch (err) {
      console.error("Error fetching assigned creators:", err);
    } finally {
      setCreatorsLoading(false);
    }
  }

  async function fetchAssignments() {
    try {
      const { data: assignmentData, error } = await supabase
        .from("mentor_assignments")
        .select("id, video_id, status, task_contacted, task_feedback_sent, task_example_shared, mentor_notes, admin_notes, created_at")
        .eq("mentor_id", profileId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!assignmentData || assignmentData.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      const videoIds = assignmentData.map(a => a.video_id);
      const { data: videos } = await supabase
        .from("videos")
        .select("id, title, unique_video_id, video_url, thumbnail_url, rejection_reason, admin_feedback, created_at, creator_id")
        .in("id", videoIds);

      if (!videos) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      const creatorIds = [...new Set(videos.map(v => v.creator_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, user_id")
        .in("id", creatorIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const videoMap = new Map(videos.map(v => [v.id, v]));

      const mapped: MentorAssignment[] = assignmentData
        .map(a => {
          const video = videoMap.get(a.video_id);
          if (!video) return null;
          const profile = profileMap.get(video.creator_id);
          return {
            ...a,
            video,
            creator_name: profile?.full_name || "Unknown Creator",
            creator_user_id: profile?.user_id || "",
          };
        })
        .filter(Boolean) as MentorAssignment[];

      setAssignments(mapped);

      const notes: Record<string, string> = {};
      mapped.forEach(a => {
        if (a.mentor_notes) notes[a.id] = a.mentor_notes;
      });
      setNotesMap(notes);
    } catch (error) {
      console.error("Error fetching assignments:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredAssignments = assignments.filter(a => {
    if (filter === "assigned") return a.status === "assigned" || a.status === "in_progress";
    if (filter === "completed") return a.status === "completed";
    return true;
  });

  const completedCount = assignments.filter(a => a.status === "completed").length;
  const activeCount = assignments.filter(a => a.status !== "completed").length;

  async function handleToggleTask(assignment: MentorAssignment, task: "task_contacted" | "task_feedback_sent" | "task_example_shared") {
    const newValue = !assignment[task];
    setAssignments(prev => prev.map(a =>
      a.id === assignment.id ? { ...a, [task]: newValue } : a
    ));

    const { error } = await supabase
      .from("mentor_assignments")
      .update({ [task]: newValue, status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", assignment.id);

    if (error) {
      setAssignments(prev => prev.map(a =>
        a.id === assignment.id ? { ...a, [task]: !newValue } : a
      ));
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  async function handleSendFeedback(assignment: MentorAssignment) {
    const feedback = feedbackMap[assignment.id]?.trim();
    if (!feedback || !profileId) return;

    setSubmittingMap(prev => ({ ...prev, [assignment.id]: true }));

    try {
      const { error } = await supabase
        .from("mentor_feedback")
        .insert({
          mentor_id: profileId,
          video_id: assignment.video_id,
          creator_id: assignment.video.creator_id,
          feedback,
        });

      if (error) throw error;

      await supabase
        .from("mentor_assignments")
        .update({ task_feedback_sent: true, status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", assignment.id);

      try {
        await supabase.functions.invoke("send-mentor-feedback", {
          body: {
            mentor_id: profileId,
            video_id: assignment.video_id,
            creator_id: assignment.video.creator_id,
            feedback,
          },
        });
      } catch (emailErr) {
        console.error("Email send error (non-blocking):", emailErr);
      }

      setAssignments(prev => prev.map(a =>
        a.id === assignment.id ? { ...a, task_feedback_sent: true } : a
      ));
      setFeedbackMap(prev => ({ ...prev, [assignment.id]: "" }));

      toast({
        title: "Feedback sent! 🎉",
        description: `Your feedback has been sent to ${assignment.creator_name}.`,
      });
    } catch (error: any) {
      toast({ title: "Failed to send feedback", description: error.message, variant: "destructive" });
    } finally {
      setSubmittingMap(prev => ({ ...prev, [assignment.id]: false }));
    }
  }

  async function handleSaveNotes(assignment: MentorAssignment) {
    const notes = notesMap[assignment.id]?.trim() || "";

    const { error } = await supabase
      .from("mentor_assignments")
      .update({ mentor_notes: notes || null, updated_at: new Date().toISOString() })
      .eq("id", assignment.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Notes saved", description: "Your notes have been updated." });
      setAssignments(prev => prev.map(a =>
        a.id === assignment.id ? { ...a, mentor_notes: notes || null } : a
      ));
    }
  }

  async function handleMarkComplete(assignment: MentorAssignment) {
    const notes = notesMap[assignment.id]?.trim() || assignment.mentor_notes || "";

    const { error } = await supabase
      .from("mentor_assignments")
      .update({
        status: "completed",
        mentor_notes: notes || null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignment.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assignment completed! ✅", description: "Great work helping your mentee." });
      setAssignments(prev => prev.map(a =>
        a.id === assignment.id ? { ...a, status: "completed", completed_at: new Date().toISOString() } : a
      ));
    }
  }

  async function handleMessageCreator(creatorUserId: string, creatorName: string, assignmentId?: string) {
    if (!user) return;

    try {
      const { data: existingDm } = await supabase
        .from("direct_messages")
        .select("id")
        .or(`and(participant1_id.eq.${user.id},participant2_id.eq.${creatorUserId}),and(participant1_id.eq.${creatorUserId},participant2_id.eq.${user.id})`)
        .maybeSingle();

      let dmId = existingDm?.id;

      if (!dmId && creatorUserId) {
        const { data: newDm, error: createError } = await supabase
          .from("direct_messages")
          .insert({
            participant1_id: user.id,
            participant2_id: creatorUserId,
          })
          .select("id")
          .single();

        if (createError) {
          console.error("DM creation error:", createError);
          toast({ title: "Can't start DM", description: "Unable to create a conversation. Please try from the chat page.", variant: "destructive" });
          navigate(`/creator/chat`);
          return;
        }
        dmId = newDm.id;
      }

      if (dmId) {
        // If this is from a video assignment, mark contacted
        if (assignmentId) {
          await supabase
            .from("mentor_assignments")
            .update({ task_contacted: true, status: "in_progress", updated_at: new Date().toISOString() })
            .eq("id", assignmentId);

          setAssignments(prev => prev.map(a =>
            a.id === assignmentId ? { ...a, task_contacted: true, status: "in_progress" } : a
          ));
        }

        navigate(`/creator/chat?dm=${dmId}`);
      } else {
        navigate(`/creator/chat`);
        toast({ title: "Open Chat", description: `Start a conversation with ${creatorName} from the chat page.` });
      }
    } catch (err) {
      console.error("Message creator error:", err);
      navigate(`/creator/chat`);
    }
  }

  const allTasksDone = (a: MentorAssignment) => a.task_contacted && a.task_feedback_sent && a.task_example_shared;

  async function handleMentorVerdict(videoId: string, creatorId: string, verdict: "likely_approve" | "needs_work") {
    if (!profileId) return;
    const notes = verdict === "needs_work" ? verdictNotesMap[videoId]?.trim() || null : null;

    setSubmittingMap(prev => ({ ...prev, [videoId]: true }));
    try {
      const { error } = await supabase
        .from("videos")
        .update({
          mentor_verdict: verdict,
          mentor_verdict_at: new Date().toISOString(),
          mentor_verdict_by: profileId,
          mentor_verdict_notes: notes,
        } as any)
        .eq("id", videoId);

      if (error) throw error;

      // Update local state
      setAssignedCreators(prev => prev.map(c => ({
        ...c,
        videos: c.videos.map(v =>
          v.id === videoId ? { ...v, mentor_verdict: verdict, mentor_verdict_notes: notes } : v
        ),
      })));

      setShowNeedsWorkInput(prev => ({ ...prev, [videoId]: false }));
      setVerdictNotesMap(prev => ({ ...prev, [videoId]: "" }));

      // If needs_work, notify the creator
      if (verdict === "needs_work" && notes) {
        supabase.functions.invoke("send-mentor-feedback", {
          body: {
            mentor_id: profileId,
            video_id: videoId,
            creator_id: creatorId,
            feedback: notes,
          },
        }).catch(e => console.error("Failed to send mentor feedback:", e));
      }

      toast({
        title: verdict === "likely_approve" ? "Marked as Likely Approve ✅" : "Marked as Needs Work 📝",
        description: verdict === "likely_approve"
          ? "This will surface to the admin queue with your endorsement."
          : "The creator will be notified with your feedback.",
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmittingMap(prev => ({ ...prev, [videoId]: false }));
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-success/10 text-success border-success/30";
      case "rejected": return "bg-destructive/10 text-destructive border-destructive/30";
      case "pending": return "bg-warning/10 text-warning border-warning/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const verdictBadge = (verdict: string | null) => {
    if (verdict === "likely_approve") return <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">✅ Likely Approve</Badge>;
    if (verdict === "needs_work") return <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30">📝 Needs Work</Badge>;
    return null;
  };

  return (
    <CreatorLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Content Review</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Review assigned creators and help mentees improve
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="creators" className="gap-1.5">
              <Users className="w-4 h-4" />
              My Creators
              {assignedCreators.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{assignedCreators.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="videos" className="gap-1.5">
              <Video className="w-4 h-4" />
              Video Tasks
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{activeCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* MY CREATORS TAB */}
          <TabsContent value="creators" className="space-y-4 mt-4">
            {creatorsLoading ? (
              <div className="flex items-center justify-center min-h-[200px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : assignedCreators.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No creators assigned yet</h3>
                  <p className="text-sm text-muted-foreground">
                    When the admin assigns creators to you, they'll appear here with all their videos.
                  </p>
                </CardContent>
              </Card>
            ) : (
              assignedCreators.map(creator => (
                <Card key={creator.id}>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-sm">{creator.creator_name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {creator.videos.length} video{creator.videos.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMessageCreator(creator.creator_user_id, creator.creator_name)}
                        className="text-xs"
                      >
                        <MessageSquare className="w-3 h-3 mr-1" />
                        Message
                      </Button>
                    </div>

                    {creator.notes && (
                      <div className="p-2 rounded-lg bg-muted">
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">Admin Notes</p>
                        <p className="text-xs">{creator.notes}</p>
                      </div>
                    )}

                    {/* Video list */}
                    {creator.videos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No videos submitted yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {creator.videos.map(video => (
                          <div key={video.id} className="flex gap-3 p-2 rounded-lg border bg-card hover:bg-secondary/20 transition-colors">
                            <div
                              className="w-16 h-20 shrink-0 cursor-pointer rounded overflow-hidden"
                              onClick={() => setPreviewVideo({ url: video.video_url, title: video.title })}
                            >
                              <VideoThumbnail
                                thumbnailUrl={video.thumbnail_url}
                                videoUrl={video.video_url}
                                title={video.title}
                                status={video.status as any}
                                size="sm"
                                showStatus={false}
                                className="!w-full !max-w-none h-full"
                              />
                            </div>
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-medium truncate">{video.title}</p>
                                <div className="flex items-center gap-1 shrink-0">
                                  {verdictBadge(video.mentor_verdict)}
                                  <Badge variant="outline" className={`text-[10px] ${statusColor(video.status)}`}>
                                    {video.status}
                                  </Badge>
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                {video.unique_video_id} · {new Date(video.created_at).toLocaleDateString()}
                              </p>

                              {/* Mentor verdict notes */}
                              {video.mentor_verdict === "needs_work" && video.mentor_verdict_notes && (
                                <p className="text-[10px] text-amber-500 italic">"{video.mentor_verdict_notes}"</p>
                              )}

                              {/* Verdict buttons - only for pending videos without a verdict */}
                              {video.status === "pending" && !video.mentor_verdict && (
                                <div className="space-y-2">
                                  {showNeedsWorkInput[video.id] ? (
                                    <div className="space-y-1.5">
                                      <Textarea
                                        placeholder="What needs to change? This will be sent to the creator..."
                                        value={verdictNotesMap[video.id] || ""}
                                        onChange={(e) => setVerdictNotesMap(prev => ({ ...prev, [video.id]: e.target.value }))}
                                        className="min-h-[50px] text-xs"
                                      />
                                      <div className="flex gap-1.5">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-[10px] h-7 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                                          onClick={() => handleMentorVerdict(video.id, creator.creator_id, "needs_work")}
                                          disabled={!verdictNotesMap[video.id]?.trim() || submittingMap[video.id]}
                                        >
                                          {submittingMap[video.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : "Submit"}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-[10px] h-7"
                                          onClick={() => setShowNeedsWorkInput(prev => ({ ...prev, [video.id]: false }))}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-[10px] h-7 border-success/30 text-success hover:bg-success/10"
                                        onClick={() => handleMentorVerdict(video.id, creator.creator_id, "likely_approve")}
                                        disabled={submittingMap[video.id]}
                                      >
                                        {submittingMap[video.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : "✅ Likely Approve"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-[10px] h-7 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                                        onClick={() => setShowNeedsWorkInput(prev => ({ ...prev, [video.id]: true }))}
                                      >
                                        📝 Needs Work
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* VIDEO TASKS TAB */}
          <TabsContent value="videos" className="space-y-4 mt-4">
            {/* Stats bar */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-warning" />
                <span className="font-medium">{activeCount}</span>
                <span className="text-muted-foreground">Active</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="font-medium">{completedCount}</span>
                <span className="text-muted-foreground">Completed</span>
              </div>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-3">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignments</SelectItem>
                  <SelectItem value="assigned">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex items-center justify-center min-h-[300px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredAssignments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No assignments yet</h3>
                  <p className="text-sm text-muted-foreground">
                    {filter !== "all"
                      ? "Try changing your filter"
                      : "You'll see assigned videos here when the admin sends them your way."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredAssignments.map((assignment) => {
                  const isComplete = assignment.status === "completed";
                  const tasksReady = allTasksDone(assignment);
                  return (
                    <Card key={assignment.id} className={`overflow-hidden ${isComplete ? "opacity-70" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          {/* Thumbnail */}
                          <div
                            className="w-24 h-32 md:w-32 md:h-44 shrink-0 cursor-pointer rounded-lg overflow-hidden"
                            onClick={() => setPreviewVideo({ url: assignment.video.video_url, title: assignment.video.title })}
                          >
                            <VideoThumbnail
                              thumbnailUrl={assignment.video.thumbnail_url}
                              videoUrl={assignment.video.video_url}
                              title={assignment.video.title}
                              status="rejected"
                              size="sm"
                              showStatus={false}
                              className="!w-full !max-w-none h-full"
                            />
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-semibold text-sm truncate">{assignment.video.title}</h3>
                                <p className="text-xs text-muted-foreground">
                                  by {assignment.creator_name} · {new Date(assignment.video.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              <Badge variant="outline" className={
                                isComplete
                                  ? "bg-success/10 text-success border-success/30"
                                  : "bg-warning/10 text-warning border-warning/30"
                              }>
                                {isComplete ? "Complete" : "Active"}
                              </Badge>
                            </div>

                            {/* Rejection reason */}
                            {assignment.video.rejection_reason && (() => {
                              const { cleanText } = parseStickersFromText(assignment.video.rejection_reason);
                              return (
                                <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                                  <p className="text-xs font-medium text-destructive mb-0.5">Rejection Reason</p>
                                  {cleanText && <p className="text-xs text-destructive/80">{cleanText}</p>}
                                  <FeedbackStickers textWithStickers={assignment.video.rejection_reason} />
                                </div>
                              );
                            })()}

                            {(assignment.video.admin_feedback || ((assignment.video as any).admin_feedback_stickers && (assignment.video as any).admin_feedback_stickers.length > 0)) && (
                              <div className="p-2 rounded-lg bg-muted">
                                <p className="text-xs font-medium text-muted-foreground mb-0.5">Admin Notes</p>
                                {assignment.video.admin_feedback && <p className="text-xs">{assignment.video.admin_feedback}</p>}
                                <FeedbackStickers stickerUrls={(assignment.video as any).admin_feedback_stickers} />
                              </div>
                            )}

                            {/* Task Checklist */}
                            <div className="p-3 rounded-lg border bg-card space-y-2">
                              <p className="text-xs font-semibold flex items-center gap-1.5">
                                <ClipboardList className="w-3.5 h-3.5 text-primary" />
                                Your Tasks
                              </p>
                              <div className="space-y-2">
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <Checkbox
                                    checked={assignment.task_contacted}
                                    onCheckedChange={() => handleToggleTask(assignment, "task_contacted")}
                                    disabled={isComplete}
                                  />
                                  <div>
                                    <p className={`text-xs font-medium ${assignment.task_contacted ? "line-through text-muted-foreground" : ""}`}>
                                      Contact the creator
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">Reach out via DM about their video</p>
                                  </div>
                                </label>
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <Checkbox
                                    checked={assignment.task_feedback_sent}
                                    onCheckedChange={() => handleToggleTask(assignment, "task_feedback_sent")}
                                    disabled={isComplete}
                                  />
                                  <div>
                                    <p className={`text-xs font-medium ${assignment.task_feedback_sent ? "line-through text-muted-foreground" : ""}`}>
                                      Give feedback & advice
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">Write feedback that gets emailed to them</p>
                                  </div>
                                </label>
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <Checkbox
                                    checked={assignment.task_example_shared}
                                    onCheckedChange={() => handleToggleTask(assignment, "task_example_shared")}
                                    disabled={isComplete}
                                  />
                                  <div>
                                    <p className={`text-xs font-medium ${assignment.task_example_shared ? "line-through text-muted-foreground" : ""}`}>
                                      Share a similar example
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">Explain what works and why with an example</p>
                                  </div>
                                </label>
                              </div>
                            </div>

                            {/* Feedback textarea */}
                            {!isComplete && !assignment.task_feedback_sent && (
                              <div className="space-y-2">
                                <Textarea
                                  placeholder={`Write your feedback for ${assignment.creator_name}...`}
                                  value={feedbackMap[assignment.id] || ""}
                                  onChange={(e) => setFeedbackMap(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                                  className="min-h-[60px] text-xs"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleSendFeedback(assignment)}
                                  disabled={!feedbackMap[assignment.id]?.trim() || submittingMap[assignment.id]}
                                  className="text-xs"
                                >
                                  {submittingMap[assignment.id] ? (
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  ) : (
                                    <Send className="w-3 h-3 mr-1" />
                                  )}
                                  Send Feedback
                                </Button>
                              </div>
                            )}

                            {assignment.admin_notes && (
                              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                                <p className="text-xs font-medium text-primary mb-0.5">Instructions from Admin</p>
                                <p className="text-xs">{assignment.admin_notes}</p>
                              </div>
                            )}




                            {/* Mentor Notes */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                                Your Notes {isComplete && assignment.mentor_notes ? "" : "(for admin)"}
                              </p>
                              {isComplete && assignment.mentor_notes ? (
                                <div className="p-2 rounded-lg bg-muted">
                                  <p className="text-xs">{assignment.mentor_notes}</p>
                                </div>
                              ) : !isComplete ? (
                                <div className="space-y-2">
                                  <Textarea
                                    placeholder="Update the admin on what you discussed, what advice you gave, any progress..."
                                    value={notesMap[assignment.id] || ""}
                                    onChange={(e) => setNotesMap(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                                    className="min-h-[60px] text-xs"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSaveNotes(assignment)}
                                    className="text-xs"
                                  >
                                    Save Notes
                                  </Button>
                                </div>
                              ) : null}
                            </div>

                            {/* Action buttons */}
                            {!isComplete && (
                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMessageCreator(assignment.creator_user_id, assignment.creator_name, assignment.id)}
                                  className="text-xs"
                                >
                                  <MessageSquare className="w-3 h-3 mr-1" />
                                  Message
                                </Button>
                                {tasksReady && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleMarkComplete(assignment)}
                                    className="text-xs"
                                  >
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Mark Complete
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Video Preview */}
        <VideoPreviewDialog
          open={!!previewVideo}
          onOpenChange={(open) => !open && setPreviewVideo(null)}
          videoUrl={previewVideo?.url || null}
          title={previewVideo?.title}
        />
      </div>
    </CreatorLayout>
  );
}
