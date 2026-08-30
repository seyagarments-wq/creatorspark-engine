import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getVideoUrl } from "@/lib/storage";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewBreakdown } from "@/components/video/ReviewBreakdown";
import { VideoReviewThread } from "@/components/video/VideoReviewThread";
import { FeedbackStickers, parseStickersFromText } from "@/components/video/FeedbackStickers";
import { GrowthTracker } from "@/components/creator/GrowthTracker";
import { CopyableVideoId } from "@/components/video/CopyableVideoId";
import {
  ArrowLeft,
  Video as VideoIcon,
  Eye,
  MousePointer,
  ShoppingCart,
  Loader2,
  Star,
  Calendar,
  Activity,
  FileText,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { scoreVerdict, type VideoReview, type VideoReviewNote } from "@/lib/review-config";

interface VideoRow {
  id: string;
  unique_video_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  video_url: string | null;
  thumbnail_url: string | null;
  admin_feedback: string | null;
  admin_feedback_stickers: string[] | null;
  rejection_reason: string | null;
  hook_score: number | null;
}

const statusStyles: Record<string, string> = {
  approved: "bg-success/10 text-success border-success/30",
  pending: "bg-warning/10 text-warning border-warning/30",
  saved_for_later: "bg-warning/10 text-warning border-warning/30",
  revision_requested: "bg-warning/10 text-warning border-warning/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function CreatorVideoDetail() {
  const { id } = useParams<{ id: string }>();
  const { profileId } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [loading, setLoading] = useState(true);
  const [video, setVideo] = useState<VideoRow | null>(null);
  const [stats, setStats] = useState({ impressions: 0, clicks: 0, purchases: 0, revenue: 0 });
  const [review, setReview] = useState<VideoReview | null>(null);
  const [notes, setNotes] = useState<VideoReviewNote[]>([]);

  useEffect(() => {
    if (!id || !profileId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profileId]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("videos")
        .select("*, performance_data(*)")
        .eq("id", id)
        .eq("creator_id", profileId)
        .maybeSingle();

      if (!data) {
        setVideo(null);
        return;
      }

      setVideo(data as unknown as VideoRow);
      const agg = ((data as any).performance_data || []).reduce(
        (acc: any, pd: any) => ({
          impressions: acc.impressions + (pd.impressions || 0),
          clicks: acc.clicks + (pd.clicks || 0),
          purchases: acc.purchases + (pd.purchases || 0),
          revenue: acc.revenue + (Number(pd.revenue) || 0),
        }),
        { impressions: 0, clicks: 0, purchases: 0, revenue: 0 }
      );
      setStats(agg);

      const { data: reviews } = await (supabase as any)
        .from("video_reviews")
        .select("*")
        .eq("video_id", id)
        .order("created_at", { ascending: false })
        .limit(1);
      setReview(reviews?.[0] || null);

      const { data: noteRows } = await (supabase as any)
        .from("video_review_notes")
        .select("*")
        .eq("video_id", id)
        .order("timestamp_seconds", { ascending: true });
      setNotes(noteRows || []);
    } catch (err) {
      console.error("Error loading video detail:", err);
    } finally {
      setLoading(false);
    }
  }

  function seekTo(seconds: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      void videoRef.current.play();
      videoRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  if (loading) {
    return (
      <CreatorLayout>
        <div className="py-20 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </CreatorLayout>
    );
  }

  if (!video) {
    return (
      <CreatorLayout>
        <div className="py-20 text-center space-y-3">
          <p className="text-sm text-muted-foreground">This video couldn't be found.</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/creator/videos">Back to my videos</Link>
          </Button>
        </div>
      </CreatorLayout>
    );
  }

  const src = video.video_url ? getVideoUrl(video.video_url) : null;
  const verdict = scoreVerdict(review?.overall_score ?? null);
  const ctr = stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0;
  const cleanRejection = video.rejection_reason
    ? parseStickersFromText(video.rejection_reason).cleanText
    : "";

  return (
    <CreatorLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
            <Link to="/creator/videos">
              <ArrowLeft className="w-4 h-4 mr-1" />
              My videos
            </Link>
          </Button>

          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center shrink-0">
              <VideoIcon className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-bold truncate">{video.title}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <CopyableVideoId videoId={video.unique_video_id} />
                <span>·</span>
                <span>{new Date(video.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <Badge variant="outline" className={cn("capitalize", statusStyles[video.status] || "")}>
              {video.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pb-4 border-b">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Review score</p>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 fill-warning text-warning" />
              {review?.overall_score != null ? `${review.overall_score.toFixed(1)} / 5` : "Not scored"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Verdict</p>
            <p className="text-sm font-semibold">{verdict.label}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Impressions</p>
            <p className="text-sm font-semibold">{stats.impressions.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Link CTR</p>
            <p className="text-sm font-semibold">{ctr.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Last updated</p>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              {new Date(video.updated_at || video.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Two-column */}
        <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview" className="gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="review" className="gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Review
              </TabsTrigger>
              <TabsTrigger value="growth" className="gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Growth
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-0">
              <div className="rounded-xl border bg-card p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {src ? (
                    <video
                      ref={videoRef}
                      src={src || undefined}
                      controls
                      className="w-full sm:w-48 aspect-[9/16] rounded-lg bg-black object-contain shrink-0"
                    />
                  ) : (
                    <div className="w-full sm:w-48 aspect-[9/16] rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <VideoIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 space-y-3 min-w-0">
                    {video.description && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{video.description}</p>
                    )}
                    <div className="space-y-2.5">
                      <MetricBar
                        icon={<Eye className="w-3.5 h-3.5" />}
                        label="Impressions"
                        value={stats.impressions.toLocaleString()}
                        pct={Math.min(100, (stats.impressions / 10000) * 100)}
                      />
                      <MetricBar
                        icon={<MousePointer className="w-3.5 h-3.5" />}
                        label="Link clicks"
                        value={stats.clicks.toLocaleString()}
                        pct={Math.min(100, ctr * 10)}
                      />
                      <MetricBar
                        icon={<ShoppingCart className="w-3.5 h-3.5" />}
                        label="Purchases"
                        value={stats.purchases.toLocaleString()}
                        pct={Math.min(100, (stats.purchases / 50) * 100)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {video.admin_feedback && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <p className="text-xs font-semibold text-primary mb-1">Feedback from your admin</p>
                  <p className="text-sm text-foreground/80">{video.admin_feedback}</p>
                  <FeedbackStickers stickerUrls={video.admin_feedback_stickers} />
                </div>
              )}

              {cleanRejection && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <p className="text-xs font-semibold text-warning mb-1">Why this needs changes</p>
                  <p className="text-sm text-foreground/80">{cleanRejection}</p>
                  <FeedbackStickers textWithStickers={video.rejection_reason} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="review" className="mt-0">
              <ReviewBreakdown review={review} notes={notes} onSeek={seekTo} />
            </TabsContent>

            <TabsContent value="growth" className="mt-0">
              <GrowthTracker />
            </TabsContent>
          </Tabs>

          {/* Notes rail */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/40">
                <p className="text-sm font-semibold">Review notes</p>
              </div>
              <div className="p-3 space-y-2 max-h-[320px] overflow-y-auto">
                {notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    No timestamped notes on this video yet.
                  </p>
                ) : (
                  notes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => seekTo(n.timestamp_seconds)}
                      className="w-full text-left rounded-lg border p-2.5 hover:bg-muted transition-colors"
                    >
                      <span className="inline-block rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary mb-1">
                        {Math.floor(n.timestamp_seconds / 60)}:
                        {String(Math.floor(n.timestamp_seconds % 60)).padStart(2, "0")}
                      </span>
                      <p className="text-xs">{n.note}</p>
                    </button>
                  ))
                )}
              </div>
            </div>

            <VideoReviewThread videoId={video.id} videoTitle={video.title} />
          </div>
        </div>
      </div>
    </CreatorLayout>
  );
}

function MetricBar({
  icon,
  label,
  value,
  pct,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-semibold">{value}</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}
