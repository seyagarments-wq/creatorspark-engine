import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { batchFetchAll } from "@/lib/batch-fetch";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { getVideoUrl, getAvatarUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Video,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  MessageSquare,
  Eye,
  FileText,
} from "lucide-react";
import { VideoMetricsDialog } from "@/components/video/VideoMetricsDialog";
import { VideoCommentThread } from "@/components/video/VideoCommentThread";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type TimeRange = "7d" | "30d" | "all";
type SortBy = "revenue" | "orders" | "recent";

const GUARANTEE_THRESHOLD = 35;

interface CreatorData {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  commission_percentage: number;
  created_at: string;
  user_id: string;
}

interface VideoWithPerf {
  id: string;
  video_url: string | null;
  title: string;
  unique_video_id: string;
  thumbnail_url: string | null;
  status: string;
  created_at: string;
  bounty_id: string | null;
  revenue: number;
  purchases: number;
  commission: number;
  impressions: number;
  clicks: number;
  spend: number;
}

export default function MenteeProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profileId } = useAuth();
  const { toast } = useToast();
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [videos, setVideos] = useState<VideoWithPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  // Video preview
  const [previewVideo, setPreviewVideo] = useState<{
    id: string;
    url: string | null;
    title: string;
    uniqueVideoId: string;
  } | null>(null);

  // Comment thread
  const [commentVideoId, setCommentVideoId] = useState<string | null>(null);
  const [commentVideoTitle, setCommentVideoTitle] = useState<string>("");

  useEffect(() => {
    if (id && profileId) fetchData();
  }, [id, profileId, timeRange]);

  async function fetchData() {
    setLoading(true);
    try {
      // Verify this creator is actually assigned to the mentor
      const { data: assignment } = await supabase
        .from("mentor_creator_assignments")
        .select("id")
        .eq("mentor_id", profileId!)
        .eq("creator_id", id!)
        .eq("status", "active")
        .maybeSingle();

      if (!assignment) {
        toast({ title: "Access denied", description: "This creator is not assigned to you.", variant: "destructive" });
        navigate("/creator/mentees");
        return;
      }

      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, commission_percentage, created_at, user_id")
        .eq("id", id!)
        .single();

      if (profileError) throw profileError;
      setCreator(profile);

      // Fetch videos
      const creatorVideos = await batchFetchAll((from, to) =>
        supabase
          .from("videos")
          .select("id, title, unique_video_id, thumbnail_url, video_url, status, created_at, bounty_id")
          .eq("creator_id", id!)
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      if (!creatorVideos?.length) {
        setVideos([]);
        setLoading(false);
        return;
      }

      // Fetch performance data
      const videoIds = creatorVideos.map((v) => v.id);
      let perfQuery = supabase
        .from("performance_data")
        .select("video_id, revenue, purchases, commission_rate_at_time, metric_date, impressions, clicks, spend")
        .in("video_id", videoIds);

      if (timeRange !== "all") {
        const days = timeRange === "7d" ? 7 : 30;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const y = cutoff.getFullYear();
        const m = String(cutoff.getMonth() + 1).padStart(2, "0");
        const d = String(cutoff.getDate()).padStart(2, "0");
        perfQuery = perfQuery.gte("metric_date", `${y}-${m}-${d}`);
      }

      const { data: perfData } = await perfQuery;

      const perfMap = new Map<string, { revenue: number; purchases: number; commissionRate: number; impressions: number; clicks: number; spend: number }>();
      (perfData || []).forEach((row) => {
        const existing = perfMap.get(row.video_id) || { revenue: 0, purchases: 0, commissionRate: 0, impressions: 0, clicks: 0, spend: 0 };
        existing.revenue += Number(row.revenue || 0);
        existing.purchases += Number(row.purchases || 0);
        existing.impressions += Number(row.impressions || 0);
        existing.clicks += Number(row.clicks || 0);
        existing.spend += Number(row.spend || 0);
        if (row.commission_rate_at_time) existing.commissionRate = Number(row.commission_rate_at_time);
        perfMap.set(row.video_id, existing);
      });

      const videosWithPerf: VideoWithPerf[] = creatorVideos.map((v) => {
        const perf = perfMap.get(v.id);
        const commissionRate = perf?.commissionRate || profile.commission_percentage || 10;
        const revenue = perf?.revenue || 0;
        return {
          ...v,
          revenue,
          purchases: perf?.purchases || 0,
          commission: revenue * (commissionRate / 100),
          impressions: perf?.impressions || 0,
          clicks: perf?.clicks || 0,
          spend: perf?.spend || 0,
        };
      });

      setVideos(videosWithPerf);
    } catch (error: any) {
      console.error("Error fetching mentee data:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const sortedVideos = useMemo(() => {
    const sorted = [...videos];
    if (sortBy === "revenue") sorted.sort((a, b) => b.revenue - a.revenue);
    else if (sortBy === "orders") sorted.sort((a, b) => b.purchases - a.purchases);
    else sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return sorted;
  }, [videos, sortBy]);

  const totals = useMemo(() => {
    return videos.reduce(
      (acc, v) => ({
        revenue: acc.revenue + v.revenue,
        purchases: acc.purchases + v.purchases,
        commission: acc.commission + v.commission,
        impressions: acc.impressions + v.impressions,
        clicks: acc.clicks + v.clicks,
        spend: acc.spend + v.spend,
      }),
      { revenue: 0, purchases: 0, commission: 0, impressions: 0, clicks: 0, spend: 0 }
    );
  }, [videos]);

  const statusCounts = useMemo(() => ({
    total: videos.length,
    pending: videos.filter((v) => v.status === "pending").length,
    approved: videos.filter((v) => v.status === "approved").length,
    rejected: videos.filter((v) => v.status === "rejected").length,
  }), [videos]);

  // Guarantee progress (approved non-bounty this month)
  const approvedThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return videos.filter(
      (v) => v.status === "approved" && !v.bounty_id && new Date(v.created_at) >= monthStart
    ).length;
  }, [videos]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

  async function handleMessage() {
    if (!creator) return;
    try {
      const myUserId = (await supabase.auth.getUser()).data.user?.id;
      if (!myUserId) return;

      const { data: existing } = await supabase
        .from("direct_messages")
        .select("id")
        .or(
          `and(participant1_id.eq.${myUserId},participant2_id.eq.${creator.user_id}),and(participant1_id.eq.${creator.user_id},participant2_id.eq.${myUserId})`
        )
        .maybeSingle();

      if (existing) {
        navigate("/creator/chat");
      } else {
        const { error } = await supabase.from("direct_messages").insert({
          participant1_id: myUserId,
          participant2_id: creator.user_id,
        });
        if (error) throw error;
        navigate("/creator/chat");
      }
    } catch (err: any) {
      toast({ title: "Could not open chat", description: err.message, variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <CreatorLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </CreatorLayout>
    );
  }

  if (!creator) {
    return (
      <CreatorLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Creator not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/creator/mentees")}>
            Back to Mentees
          </Button>
        </div>
      </CreatorLayout>
    );
  }

  const progressPct = Math.min((approvedThisMonth / GUARANTEE_THRESHOLD) * 100, 100);

  return (
    <CreatorLayout>
      <div className="space-y-6">
        {/* Back + Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/creator/mentees")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Mentees
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              {creator.avatar_url && (
                <AvatarImage src={getAvatarUrl(creator.avatar_url) || undefined} alt={creator.full_name} />
              )}
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {creator.full_name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-bold">{creator.full_name}</h1>
              <p className="text-sm text-muted-foreground">{creator.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Joined {new Date(creator.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/creator/mentees/${id}/plan`)}>
              <FileText className="w-4 h-4 mr-2" />
              Plan
            </Button>
            <Button variant="outline" size="sm" onClick={handleMessage}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Message
            </Button>
          </div>
        </div>

        {/* Guarantee Progress */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground font-medium">Monthly Guarantee Progress</span>
              <span className="font-semibold">{approvedThisMonth}/{GUARANTEE_THRESHOLD} approved</span>
            </div>
            <Progress value={progressPct} className="h-3" />
          </CardContent>
        </Card>

        {/* Time filter + Stats */}
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-lg font-bold">{formatCurrency(totals.revenue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <DollarSign className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Earnings</p>
                  <p className="text-lg font-bold">{formatCurrency(totals.commission)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <ShoppingCart className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Orders</p>
                  <p className="text-lg font-bold">{totals.purchases}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Eye className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Impressions</p>
                  <p className="text-lg font-bold">{totals.impressions.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Video Status Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <Video className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{statusCounts.total}</span>
            <span className="text-muted-foreground">Total</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="font-medium">{statusCounts.pending}</span>
            <span className="text-muted-foreground">Pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="font-medium">{statusCounts.approved}</span>
            <span className="text-muted-foreground">Approved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-destructive" />
            <span className="font-medium">{statusCounts.rejected}</span>
            <span className="text-muted-foreground">Rejected</span>
          </div>
        </div>

        {/* Sort + Video list */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Videos</h2>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="revenue">Top Revenue</SelectItem>
              <SelectItem value="orders">Most Orders</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {sortedVideos.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No videos submitted yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sortedVideos.map((video) => (
              <div
                key={video.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-secondary/20 transition-colors"
              >
                {/* Clickable thumbnail + title for video preview */}
                <div
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                  onClick={() =>
                    setPreviewVideo({
                      id: video.id,
                      url: video.video_url,
                      title: video.title,
                      uniqueVideoId: video.unique_video_id,
                    })
                  }
                >
                  {video.thumbnail_url ? (
                    <img
                      src={getVideoUrl(video.thumbnail_url) || undefined}
                      alt={video.title}
                      className="w-16 h-10 object-cover rounded shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-10 bg-muted rounded flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{video.title}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{video.unique_video_id}</p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${
                          video.status === "approved"
                            ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                            : video.status === "rejected"
                            ? "border-destructive/30 text-destructive bg-destructive/10"
                            : "border-amber-500/30 text-amber-500 bg-amber-500/10"
                        }`}
                      >
                        {video.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Stats + comment button */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-medium text-emerald-500">{formatCurrency(video.revenue)}</p>
                    <p className="text-[10px] text-muted-foreground">revenue</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-xs font-medium">{formatCurrency(video.commission)}</p>
                    <p className="text-[10px] text-muted-foreground">earnings</p>
                  </div>
                  <p className="text-xs text-muted-foreground hidden lg:block w-20 text-right">
                    {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCommentVideoId(video.id);
                      setCommentVideoTitle(video.title);
                    }}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Video preview dialog */}
        <VideoMetricsDialog
          open={!!previewVideo}
          onOpenChange={(open) => !open && setPreviewVideo(null)}
          videoId={previewVideo?.id || null}
          videoUrl={previewVideo?.url || null}
          title={previewVideo?.title}
          uniqueVideoId={previewVideo?.uniqueVideoId}
        />

        {/* Comment thread side panel */}
        <VideoCommentThread
          videoId={commentVideoId}
          videoTitle={commentVideoTitle}
          isAdmin={false}
          open={!!commentVideoId}
          onOpenChange={(open) => {
            if (!open) {
              setCommentVideoId(null);
              setCommentVideoTitle("");
            }
          }}
        />
      </div>
    </CreatorLayout>
  );
}
