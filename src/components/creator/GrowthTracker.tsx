import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Progress } from "@/components/ui/progress";
import { StreakIndicator } from "@/components/gamification/StreakIndicator";
import { useCreatorProgress } from "@/hooks/use-creator-progress";
import { REVIEW_CATEGORIES, scoreVerdict } from "@/lib/review-config";
import { cn } from "@/lib/utils";
import { TrendingUp, Sparkles, Loader2 } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

interface GrowthTrackerProps {
  className?: string;
}

interface Point {
  date: string;
  score: number;
  title: string;
}

export function GrowthTracker({ className }: GrowthTrackerProps) {
  const { profileId } = useAuth();
  const { progress } = useCreatorProgress();
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<Point[]>([]);
  const [averages, setAverages] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!profileId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function load() {
    setLoading(true);
    try {
      const { data: videos } = await supabase
        .from("videos")
        .select("id, title, created_at")
        .eq("creator_id", profileId);

      const ids = (videos || []).map((v) => v.id);
      if (ids.length === 0) {
        setPoints([]);
        setAverages({});
        return;
      }

      const { data: reviews } = await (supabase as any)
        .from("video_reviews")
        .select("*")
        .in("video_id", ids)
        .order("created_at", { ascending: true });

      const titleMap = new Map((videos || []).map((v) => [v.id, v.title]));

      setPoints(
        (reviews || [])
          .filter((r: any) => r.overall_score != null)
          .map((r: any) => ({
            date: new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            score: Number(r.overall_score),
            title: titleMap.get(r.video_id) || "Video",
          }))
      );

      const avg: Record<string, number> = {};
      REVIEW_CATEGORIES.forEach((cat) => {
        const vals = (reviews || [])
          .map((r: any) => r[cat.key])
          .filter((v: any) => typeof v === "number");
        if (vals.length) {
          avg[cat.key] = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
        }
      });
      setAverages(avg);
    } catch (err) {
      console.error("Error loading growth data:", err);
    } finally {
      setLoading(false);
    }
  }

  const overallAvg =
    points.length > 0 ? points.reduce((a, p) => a + p.score, 0) / points.length : null;
  const trend =
    points.length >= 2 ? points[points.length - 1].score - points[0].score : 0;
  const verdict = scoreVerdict(overallAvg);

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Your growth</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Level <span className="font-semibold text-foreground">{progress.currentLevel}</span>
          </span>
          <StreakIndicator
            currentStreak={progress.currentStreak}
            longestStreak={progress.longestStreak}
            size="sm"
            showLabel={false}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="p-4 grid md:grid-cols-2 gap-5">
          {/* Score over time */}
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-primary">
                {overallAvg != null ? overallAvg.toFixed(1) : "—"}
              </p>
              <span className="text-xs text-muted-foreground">avg review score</span>
              {trend !== 0 && (
                <span className={cn("text-xs font-medium", trend > 0 ? "text-success" : "text-destructive")}>
                  {trend > 0 ? "+" : ""}
                  {trend.toFixed(1)}
                </span>
              )}
            </div>
            {points.length >= 2 ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <defs>
                      <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <ChartTooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#growthFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-6">
                Get a couple of reviews and your score trend will appear here.
              </p>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-primary" />
              {verdict.label}
            </p>
          </div>

          {/* Skill bars */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Skill progress
            </p>
            {REVIEW_CATEGORIES.map((cat) => {
              const v = averages[cat.key];
              return (
                <div key={cat.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{cat.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {v ? `${v.toFixed(1)}/5` : "—"}
                    </span>
                  </div>
                  <Progress value={((v ?? 0) / 5) * 100} className="h-1.5" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
