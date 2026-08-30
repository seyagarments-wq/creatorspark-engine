import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { VideoMetricsDialog } from "@/components/video/VideoMetricsDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/layout/AdminLayout";
import { getVideoUrl, getAvatarUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  ShieldCheck,
} from "lucide-react";
import { MentorCreatorAssignment } from "@/components/admin/MentorCreatorAssignment";
import { formatDistanceToNow } from "date-fns";

type TimeRange = "1d" | "yesterday" | "7d" | "30d" | "all";
type SortBy = "revenue" | "orders" | "recent";

interface CreatorData {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  commission_percentage: number;
  created_at: string;
  status: string;
  is_mentor: boolean;
}

interface VideoWithPerf {
  id: string;
  video_url: string | null;
  title: string;
  unique_video_id: string;
  thumbnail_url: string | null;
  status: string;
  meta_status: string | null;
  created_at: string;
  revenue: number;
  purchases: number;
  commission: number;
}

export default function AdminCreatorProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [videos, setVideos] = useState<VideoWithPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [sortBy, setSortBy] = useState<SortBy>("revenue");

  useEffect(() => {
    if (id) fetchCreatorData();
  }, [id, timeRange]);

  async function fetchCreatorData() {
    setLoading(true);
    try {
      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, commission_percentage, created_at, status, is_mentor")
        .eq("id", id!)
        .single();

      if (profileError) throw profileError;
      setCreator(profile);

      // Fetch all videos for this creator
      const { data: creatorVideos, error: videosError } = await supabase
        .from("videos")
        .select("id, title, unique_video_id, thumbnail_url, video_url, status, meta_status, created_at")
        .eq("creator_id", id!)
        .order("created_at", { ascending: false });

      if (videosError) throw videosError;
      if (!creatorVideos || creatorVideos.length === 0) {
        setVideos([]);
        setLoading(false);
        return;
      }

      // Fetch performance data for these videos
      const videoIds = creatorVideos.map((v) => v.id);
      let perfQuery = supabase
        .from("performance_data")
        .select("video_id, revenue, purchases, commission_rate_at_time, metric_date")
        .in("video_id", videoIds);

      if (timeRange !== "all") {
        const now = new Date();
        if (timeRange === "yesterday") {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const y = yesterday.getFullYear();
          const m = String(yesterday.getMonth() + 1).padStart(2, "0");
          const d = String(yesterday.getDate()).padStart(2, "0");
          const dateStr = `${y}-${m}-${d}`;
          perfQuery = perfQuery.gte("metric_date", dateStr).lte("metric_date", dateStr);
        } else {
          const cutoff = new Date(now);
          if (timeRange !== "1d") {
            const days = timeRange === "7d" ? 7 : 30;
            cutoff.setDate(cutoff.getDate() - days);
          }
          const y = cutoff.getFullYear();
          const m = String(cutoff.getMonth() + 1).padStart(2, "0");
          const d = String(cutoff.getDate()).padStart(2, "0");
          perfQuery = perfQuery.gte("metric_date", `${y}-${m}-${d}`);
        }
      }

      const { data: perfData } = await perfQuery;

      // Aggregate per video
      const perfMap = new Map<string, { revenue: number; purchases: number; commissionRate: number }>();
      (perfData || []).forEach((row) => {
        const existing = perfMap.get(row.video_id) || { revenue: 0, purchases: 0, commissionRate: 0 };
        existing.revenue += Number(row.revenue || 0);
        existing.purchases += Number(row.purchases || 0);
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
        };
      });

      setVideos(videosWithPerf);
    } catch (error) {
      console.error("Error fetching creator data:", error);
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
      }),
      { revenue: 0, purchases: 0, commission: 0 }
    );
  }, [videos]);

  const statusCounts = useMemo(() => {
    return {
      total: videos.length,
      pending: videos.filter((v) => v.status === "pending").length,
      approved: videos.filter((v) => v.status === "approved").length,
      rejected: videos.filter((v) => v.status === "rejected").length,
    };
  }, [videos]);

  const [previewVideo, setPreviewVideo] = useState<{ id: string; url: string | null; title: string; uniqueVideoId: string } | null>(null);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

  const timeRangeLabel = (tr: TimeRange) => {
    switch (tr) {
      case "1d": return "Today";
      case "yesterday": return "Yesterday";
      case "7d": return "Last 7 Days";
      case "30d": return "Last 30 Days";
      case "all": return "All Time";
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!creator) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Creator not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/creators")}>
            Back to Creators
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Back button + Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/creators")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {creator.avatar_url && <AvatarImage src={getAvatarUrl(creator.avatar_url) || undefined} alt={creator.full_name} />}
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {creator.full_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">{creator.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              Creator since {new Date(creator.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{creator.commission_percentage}% commission</Badge>
              <Badge className={creator.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>
                {creator.status}
              </Badge>
              {creator.is_mentor && (
                <Badge className="bg-primary/10 text-primary">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  Mentor
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Mentor Toggle */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <div>
                  <Label className="text-sm font-medium">Mentor Status</Label>
                  <p className="text-xs text-muted-foreground">Allow this creator to review rejected videos across all cohorts</p>
                </div>
              </div>
              <Switch
                checked={creator.is_mentor}
                onCheckedChange={async (checked) => {
                  // Prevent double-firing by checking current state
                  if (checked === creator.is_mentor) return;
                  
                  const { error } = await supabase
                    .from("profiles")
                    .update({ is_mentor: checked })
                    .eq("id", creator.id);
                  if (!error) {
                    setCreator({ ...creator, is_mentor: checked });
                    if (checked) {
                      // Send personal congrats email to the mentor
                      supabase.functions.invoke("notify-mentor-promoted", {
                        body: { mentor_profile_id: creator.id },
                      }).catch(e => console.error("Failed to send mentor promotion email:", e));
                      // Announce to cohort
                      supabase.functions.invoke("announce-mentor-promotion", {
                        body: { mentor_profile_id: creator.id },
                      }).catch(e => console.error("Failed to announce promotion:", e));
                      toast({
                        title: "Mentor Promoted! 🛡️",
                        description: `${creator.full_name} is now a mentor. Their cohort has been notified.`,
                      });
                    } else {
                      toast({
                        title: "Mentor Status Removed",
                        description: `${creator.full_name} is no longer a mentor.`,
                      });
                    }
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Mentor Creator Assignment */}
        <MentorCreatorAssignment creatorId={creator.id} creatorName={creator.full_name} />

        {/* Time range filter */}
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{timeRangeLabel(timeRange)}</span>
        </div>

        {/* Hero Stats */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-success/10">
                  <DollarSign className="w-4 h-4 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Revenue Generated</p>
                  <p className="text-xl font-bold">{formatCurrency(totals.revenue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Earnings (Commission)</p>
                  <p className="text-xl font-bold">{formatCurrency(totals.commission)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-warning/10">
                  <ShoppingCart className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Orders (Sales)</p>
                  <p className="text-xl font-bold">{totals.purchases}</p>
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
            <Clock className="w-4 h-4 text-warning" />
            <span className="font-medium">{statusCounts.pending}</span>
            <span className="text-muted-foreground">Pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-success" />
            <span className="font-medium">{statusCounts.approved}</span>
            <span className="text-muted-foreground">Approved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-destructive" />
            <span className="font-medium">{statusCounts.rejected}</span>
            <span className="text-muted-foreground">Rejected</span>
          </div>
        </div>

        {/* Sort + Video List */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Submission History</h2>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Top Revenue</SelectItem>
              <SelectItem value="orders">Most Orders</SelectItem>
              <SelectItem value="recent">Most Recent</SelectItem>
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
                onClick={() => setPreviewVideo({ id: video.id, url: video.video_url, title: video.title, uniqueVideoId: video.unique_video_id })}
                className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-secondary/20 transition-colors cursor-pointer"
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{video.title}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">{video.unique_video_id}</p>
                    {video.meta_status && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${
                          video.meta_status === "live"
                            ? "border-success/30 text-success bg-success/10"
                            : video.meta_status === "paused"
                            ? "border-warning/30 text-warning bg-warning/10"
                            : ""
                        }`}
                      >
                        {video.meta_status}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-sm">
                  <div className="text-right hidden sm:block">
                    <p className="flex items-center gap-1 text-xs">
                      <ShoppingCart className="w-3 h-3" /> {video.purchases}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-success">{formatCurrency(video.revenue)}</p>
                    <p className="text-[10px] text-muted-foreground">revenue</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-medium">{formatCurrency(video.commission)}</p>
                    <p className="text-[10px] text-muted-foreground">earnings</p>
                  </div>
                  <p className="text-xs text-muted-foreground hidden md:block w-20 text-right">
                    {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <VideoMetricsDialog
          open={!!previewVideo}
          onOpenChange={(open) => !open && setPreviewVideo(null)}
          videoId={previewVideo?.id || null}
          videoUrl={previewVideo?.url || null}
          title={previewVideo?.title}
          uniqueVideoId={previewVideo?.uniqueVideoId}
        />
      </div>
    </AdminLayout>
  );
}
