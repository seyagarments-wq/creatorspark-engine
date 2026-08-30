import { CheckCircle2, Sparkles, TrendingUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { ReviewScoreStars } from "@/components/video/ReviewScoreStars";
import {
  REVIEW_CATEGORIES,
  formatTimestamp,
  scoreVerdict,
  type VideoReview,
  type VideoReviewNote,
} from "@/lib/review-config";

interface ReviewBreakdownProps {
  review: VideoReview | null;
  notes?: VideoReviewNote[];
  onSeek?: (seconds: number) => void;
  className?: string;
}

const toneClasses: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

export function ReviewBreakdown({ review, notes = [], onSeek, className }: ReviewBreakdownProps) {
  if (!review) {
    return (
      <div className={cn("rounded-xl border bg-card p-6 text-center", className)}>
        <p className="text-sm font-medium">No detailed review yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Once your video is reviewed, scores and feedback show up here.
        </p>
      </div>
    );
  }

  const verdict = scoreVerdict(review.overall_score);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Overall score */}
      <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
        <div className="relative w-16 h-16 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xl font-bold text-primary">
            {review.overall_score != null ? review.overall_score.toFixed(1) : "—"}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall review score</p>
          <p className={cn("text-base font-semibold", toneClasses[verdict.tone])}>{verdict.label}</p>
          <p className="text-xs text-muted-foreground">out of 5.0 across {REVIEW_CATEGORIES.length} categories</p>
        </div>
      </div>

      {/* Category bars */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score breakdown</p>
        {REVIEW_CATEGORIES.map((cat) => {
          const score = (review as any)[cat.key] as number | null;
          return (
            <div key={cat.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{cat.label}</span>
                <div className="flex items-center gap-2">
                  <ReviewScoreStars value={score} size="sm" />
                  <span className="text-xs text-muted-foreground w-6 text-right">
                    {score ? `${score}/5` : "—"}
                  </span>
                </div>
              </div>
              <Progress value={((score ?? 0) / 5) * 100} className="h-1.5" />
            </div>
          );
        })}
      </div>

      {/* Strengths / improvements */}
      {review.what_worked && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <p className="text-xs font-semibold text-success flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5" /> What worked
          </p>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{review.what_worked}</p>
        </div>
      )}

      {review.improvements && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <p className="text-xs font-semibold text-warning flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> What to improve
          </p>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{review.improvements}</p>
        </div>
      )}

      {review.checklist?.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Action items
          </p>
          <ul className="space-y-1.5">
            {review.checklist.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Timestamped notes
          </p>
          <div className="space-y-2">
            {notes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onSeek?.(n.timestamp_seconds)}
                className={cn(
                  "w-full text-left flex items-start gap-2 rounded-lg p-2 transition-colors",
                  onSeek ? "hover:bg-muted cursor-pointer" : "cursor-default"
                )}
              >
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  <Clock className="w-3 h-3" />
                  {formatTimestamp(n.timestamp_seconds)}
                </span>
                <span className="text-sm">{n.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
