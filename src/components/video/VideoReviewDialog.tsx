import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { getVideoUrl } from "@/lib/storage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ReviewScoreStars } from "@/components/video/ReviewScoreStars";
import { Loader2, Plus, Trash2, ClipboardCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHECKLIST_ITEMS,
  REVIEW_CATEGORIES,
  computeOverall,
  formatTimestamp,
  scoreVerdict,
  type ReviewCategoryKey,
  type VideoReviewNote,
} from "@/lib/review-config";

interface VideoReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string | null;
  videoTitle?: string;
  videoUrl?: string | null;
  creatorName?: string;
  onSaved?: () => void;
}

type Scores = Partial<Record<ReviewCategoryKey, number>>;

export function VideoReviewDialog({
  open,
  onOpenChange,
  videoId,
  videoTitle,
  videoUrl,
  creatorName,
  onSaved,
}: VideoReviewDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [scores, setScores] = useState<Scores>({});
  const [whatWorked, setWhatWorked] = useState("");
  const [improvements, setImprovements] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [notes, setNotes] = useState<VideoReviewNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [noteTime, setNoteTime] = useState(0);

  useEffect(() => {
    if (!open || !videoId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoId]);

  async function load() {
    setLoading(true);
    try {
      const { data: reviews } = await (supabase as any)
        .from("video_reviews")
        .select("*")
        .eq("video_id", videoId)
        .order("created_at", { ascending: false })
        .limit(1);

      const review = reviews?.[0];
      if (review) {
        setReviewId(review.id);
        setScores({
          score_hook: review.score_hook ?? undefined,
          score_visuals: review.score_visuals ?? undefined,
          score_audio: review.score_audio ?? undefined,
          score_pacing: review.score_pacing ?? undefined,
          score_cta: review.score_cta ?? undefined,
        });
        setWhatWorked(review.what_worked ?? "");
        setImprovements(review.improvements ?? "");
        setChecklist(Array.isArray(review.checklist) ? review.checklist : []);
      } else {
        setReviewId(null);
        setScores({});
        setWhatWorked("");
        setImprovements("");
        setChecklist([]);
      }

      const { data: noteRows } = await (supabase as any)
        .from("video_review_notes")
        .select("*")
        .eq("video_id", videoId)
        .order("timestamp_seconds", { ascending: true });
      setNotes(noteRows || []);
    } catch (err) {
      console.error("Error loading review:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleChecklist(item: string) {
    setChecklist((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  }

  function captureTime() {
    setNoteTime(Math.floor(videoRef.current?.currentTime || 0));
  }

  async function addNote() {
    if (!newNote.trim() || !videoId || !user) return;
    try {
      const { data, error } = await (supabase as any)
        .from("video_review_notes")
        .insert({
          video_id: videoId,
          review_id: reviewId,
          author_id: user.id,
          timestamp_seconds: noteTime,
          note: newNote.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      setNotes((prev) => [...prev, data].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
      setNewNote("");
    } catch (err: any) {
      toast({ title: "Couldn't add note", description: err.message, variant: "destructive" });
    }
  }

  async function deleteNote(id: string) {
    await (supabase as any).from("video_review_notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleSave() {
    if (!videoId || !user) return;
    setSaving(true);
    try {
      const payload = {
        video_id: videoId,
        reviewer_id: user.id,
        score_hook: scores.score_hook ?? null,
        score_visuals: scores.score_visuals ?? null,
        score_audio: scores.score_audio ?? null,
        score_pacing: scores.score_pacing ?? null,
        score_cta: scores.score_cta ?? null,
        overall_score: computeOverall(scores),
        what_worked: whatWorked.trim() || null,
        improvements: improvements.trim() || null,
        checklist,
        updated_at: new Date().toISOString(),
      };

      if (reviewId) {
        const { error } = await (supabase as any)
          .from("video_reviews")
          .update(payload)
          .eq("id", reviewId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("video_reviews")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setReviewId(data.id);
        if (notes.length > 0) {
          await (supabase as any)
            .from("video_review_notes")
            .update({ review_id: data.id })
            .eq("video_id", videoId)
            .is("review_id", null);
        }
      }

      toast({ title: "Review saved", description: "The creator can now see this feedback." });
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Couldn't save review", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const overall = computeOverall(scores);
  const verdict = scoreVerdict(overall);
  const src = videoUrl ? getVideoUrl(videoUrl) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            Detailed review
          </DialogTitle>
          <DialogDescription>
            {videoTitle}
            {creatorName ? ` · ${creatorName}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid md:grid-cols-[220px_1fr] gap-5">
            {/* Player */}
            <div className="space-y-2">
              {src ? (
                <video
                  ref={videoRef}
                  src={src || undefined}
                  controls
                  className="w-full aspect-[9/16] rounded-lg bg-black object-contain"
                />
              ) : (
                <div className="w-full aspect-[9/16] rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  No video file
                </div>
              )}
              <div className="rounded-lg border bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Overall</p>
                <p className="text-2xl font-bold text-primary">{overall != null ? overall.toFixed(1) : "—"}</p>
                <p className="text-xs text-muted-foreground">{verdict.label}</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Scores */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Score the video
                </p>
                {REVIEW_CATEGORIES.map((cat) => (
                  <div key={cat.key} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{cat.label}</p>
                      <p className="text-[11px] text-muted-foreground">{cat.hint}</p>
                    </div>
                    <ReviewScoreStars
                      value={scores[cat.key] ?? null}
                      onChange={(v) => setScores((prev) => ({ ...prev, [cat.key]: v }))}
                    />
                  </div>
                ))}
              </div>

              {/* Checklist */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Things to improve
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CHECKLIST_ITEMS.map((item) => {
                    const active = checklist.includes(item);
                    return (
                      <button key={item} type="button" onClick={() => toggleChecklist(item)}>
                        <Badge
                          variant="outline"
                          className={cn(
                            "cursor-pointer transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted"
                          )}
                        >
                          {item}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text feedback */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-success">What worked</p>
                  <Textarea
                    value={whatWorked}
                    onChange={(e) => setWhatWorked(e.target.value)}
                    placeholder="Call out what they nailed..."
                    className="min-h-[90px] text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-warning">What to improve</p>
                  <Textarea
                    value={improvements}
                    onChange={(e) => setImprovements(e.target.value)}
                    placeholder="Specific, actionable advice for next time..."
                    className="min-h-[90px] text-sm"
                  />
                </div>
              </div>

              {/* Timestamped notes */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Timestamped notes
                </p>
                {notes.length > 0 && (
                  <div className="space-y-1.5">
                    {notes.map((n) => (
                      <div key={n.id} className="flex items-start gap-2 rounded-lg border bg-card p-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (videoRef.current) videoRef.current.currentTime = n.timestamp_seconds;
                          }}
                          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"
                        >
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(n.timestamp_seconds)}
                        </button>
                        <span className="text-sm flex-1">{n.note}</span>
                        <button type="button" onClick={() => deleteNote(n.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={captureTime} className="shrink-0">
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    {formatTimestamp(noteTime)}
                  </Button>
                  <Input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Note at this moment..."
                    className="text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addNote();
                      }
                    }}
                  />
                  <Button type="button" size="sm" onClick={addNote} disabled={!newNote.trim()}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
