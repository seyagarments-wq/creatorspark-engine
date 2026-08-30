import CreatorLayout from "@/components/layout/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Send,
  Video,
  ShieldCheck,
  CheckCircle,
  ClipboardList,
  FileText,
} from "lucide-react";
import { useState } from "react";

const mockAssignments = [
  {
    id: "1",
    video_id: "v1",
    status: "assigned",
    task_contacted: false,
    task_feedback_sent: false,
    task_example_shared: false,
    mentor_notes: null,
    admin_notes: "Focus on their hook — it's too slow. Show them how to grab attention in the first 2 seconds.",
    created_at: new Date(Date.now() - 86400000).toISOString(),
    video: {
      id: "v1",
      title: "Summer Collection Haul & Try-On",
      unique_video_id: "VID-20260314-001",
      video_url: null,
      thumbnail_url: null,
      rejection_reason: "Hook is too slow — doesn't grab attention within the first 3 seconds. The product isn't shown until 8 seconds in.",
      admin_feedback: null,
      created_at: new Date(Date.now() - 172800000).toISOString(),
      creator_id: "c1",
    },
    creator_name: "Ina Morales",
    creator_user_id: "u1",
  },
  {
    id: "2",
    video_id: "v2",
    status: "in_progress",
    task_contacted: true,
    task_feedback_sent: true,
    task_example_shared: false,
    mentor_notes: "Talked to Marcus about his lighting. He's going to reshoot this weekend with natural light.",
    admin_notes: null,
    created_at: new Date(Date.now() - 259200000).toISOString(),
    video: {
      id: "v2",
      title: "Morning Routine ft. New Skincare",
      unique_video_id: "VID-20260312-003",
      video_url: null,
      thumbnail_url: null,
      rejection_reason: "Lighting is too dark throughout. Audio quality is poor — sounds echoey. Need to reshoot in a better environment.",
      admin_feedback: null,
      created_at: new Date(Date.now() - 345600000).toISOString(),
      creator_id: "c2",
    },
    creator_name: "Marcus Johnson",
    creator_user_id: "u2",
  },
  {
    id: "3",
    video_id: "v3",
    status: "completed",
    task_contacted: true,
    task_feedback_sent: true,
    task_example_shared: true,
    mentor_notes: "Spent 20 mins on a call with Sophia. She understood the issue and already reshot the video. Great improvement!",
    admin_notes: null,
    created_at: new Date(Date.now() - 604800000).toISOString(),
    video: {
      id: "v3",
      title: "Unboxing the New Drop 🔥",
      unique_video_id: "VID-20260307-002",
      video_url: null,
      thumbnail_url: null,
      rejection_reason: "CTA is missing entirely. Video ends abruptly without directing the viewer to the product page.",
      admin_feedback: null,
      created_at: new Date(Date.now() - 691200000).toISOString(),
      creator_id: "c3",
    },
    creator_name: "Sophia Chen",
    creator_user_id: "u3",
  },
];

export default function ContentReviewPreview() {
  const [filter, setFilter] = useState("all");
  const [assignments, setAssignments] = useState(mockAssignments);
  const [notesMap, setNotesMap] = useState<Record<string, string>>({
    "2": "Talked to Marcus about his lighting. He's going to reshoot this weekend with natural light.",
  });
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});

  const filteredAssignments = assignments.filter((a) => {
    if (filter === "assigned") return a.status === "assigned" || a.status === "in_progress";
    if (filter === "completed") return a.status === "completed";
    return true;
  });

  const completedCount = assignments.filter((a) => a.status === "completed").length;
  const activeCount = assignments.filter((a) => a.status !== "completed").length;

  const allTasksDone = (a: (typeof mockAssignments)[0]) =>
    a.task_contacted && a.task_feedback_sent && a.task_example_shared;

  function handleToggleTask(id: string, task: string) {
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [task]: !(a as any)[task] } : a))
    );
  }

  return (
    <CreatorLayout>
      <div className="space-y-6 animate-fade-in">
        {/* DEV BANNER */}
        <div className="p-3 rounded-lg bg-warning/20 border border-warning/40 text-center">
          <p className="text-xs font-semibold text-warning">⚠️ DEV PREVIEW — Mock data, no auth required</p>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Content Review</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Your assigned videos to review and help mentees improve
            </p>
          </div>
        </div>

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
        <div className="space-y-4">
          {filteredAssignments.map((assignment) => {
            const isComplete = assignment.status === "completed";
            const tasksReady = allTasksDone(assignment);
            return (
              <Card key={assignment.id} className={`overflow-hidden ${isComplete ? "opacity-70" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* Placeholder thumbnail */}
                    <div className="w-24 h-32 md:w-32 md:h-44 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                      <Video className="w-8 h-8 text-muted-foreground" />
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
                        <Badge
                          variant="outline"
                          className={
                            isComplete
                              ? "bg-success/10 text-success border-success/30"
                              : "bg-warning/10 text-warning border-warning/30"
                          }
                        >
                          {isComplete ? "Complete" : "Active"}
                        </Badge>
                      </div>

                      {/* Rejection reason */}
                      {assignment.video.rejection_reason && (
                        <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                          <p className="text-xs font-medium text-destructive mb-0.5">Rejection Reason</p>
                          <p className="text-xs text-destructive/80">{assignment.video.rejection_reason}</p>
                        </div>
                      )}

                      {assignment.admin_notes && (
                        <div className="p-2 rounded-lg bg-muted">
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Admin Notes</p>
                          <p className="text-xs">{assignment.admin_notes}</p>
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
                              onCheckedChange={() => handleToggleTask(assignment.id, "task_contacted")}
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
                              onCheckedChange={() => handleToggleTask(assignment.id, "task_feedback_sent")}
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
                              onCheckedChange={() => handleToggleTask(assignment.id, "task_example_shared")}
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
                            onChange={(e) => setFeedbackMap((prev) => ({ ...prev, [assignment.id]: e.target.value }))}
                            className="min-h-[60px] text-xs"
                          />
                          <Button size="sm" disabled={!feedbackMap[assignment.id]?.trim()} className="text-xs">
                            <Send className="w-3 h-3 mr-1" />
                            Send Feedback
                          </Button>
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
                              onChange={(e) => setNotesMap((prev) => ({ ...prev, [assignment.id]: e.target.value }))}
                              className="min-h-[60px] text-xs"
                            />
                            <Button size="sm" variant="outline" className="text-xs">
                              Save Notes
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {/* Action buttons */}
                      {!isComplete && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="text-xs">
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Message
                          </Button>
                          {tasksReady && (
                            <Button size="sm" className="text-xs">
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
      </div>
    </CreatorLayout>
  );
}
