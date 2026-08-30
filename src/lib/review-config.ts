/**
 * Shared config + types for the structured video review system.
 */

export const REVIEW_CATEGORIES = [
  { key: "score_hook", label: "Hook", hint: "Grabs attention in the first 3 seconds" },
  { key: "score_visuals", label: "Visuals", hint: "Lighting, framing, product visibility" },
  { key: "score_audio", label: "Audio", hint: "Clear voice, no echo, good levels" },
  { key: "score_pacing", label: "Pacing", hint: "Edit rhythm, no dead air" },
  { key: "score_cta", label: "CTA", hint: "Clear call to action at the end" },
] as const;

export type ReviewCategoryKey = (typeof REVIEW_CATEGORIES)[number]["key"];

export const CHECKLIST_ITEMS = [
  "Tighten the hook",
  "Improve lighting",
  "Fix audio quality",
  "Show the product sooner",
  "Add on-screen captions",
  "Cut dead air / trim length",
  "Add a clear CTA",
  "Follow the brief more closely",
  "Shoot in vertical 9:16",
  "More energy / personality",
] as const;

export interface VideoReview {
  id: string;
  video_id: string;
  reviewer_id: string;
  score_hook: number | null;
  score_visuals: number | null;
  score_audio: number | null;
  score_pacing: number | null;
  score_cta: number | null;
  overall_score: number | null;
  what_worked: string | null;
  improvements: string | null;
  checklist: string[];
  decision: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoReviewNote {
  id: string;
  video_id: string;
  review_id: string | null;
  author_id: string;
  timestamp_seconds: number;
  note: string;
  created_at: string;
}

export function computeOverall(scores: Partial<Record<ReviewCategoryKey, number | null>>): number | null {
  const values = REVIEW_CATEGORIES.map((c) => scores[c.key]).filter(
    (v): v is number => typeof v === "number" && v > 0
  );
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export function scoreVerdict(overall: number | null): { label: string; tone: "success" | "warning" | "destructive" | "muted" } {
  if (overall === null) return { label: "Not scored", tone: "muted" };
  if (overall >= 4.5) return { label: "Outstanding", tone: "success" };
  if (overall >= 3.5) return { label: "Strong", tone: "success" };
  if (overall >= 2.5) return { label: "Getting there", tone: "warning" };
  return { label: "Needs work", tone: "destructive" };
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
