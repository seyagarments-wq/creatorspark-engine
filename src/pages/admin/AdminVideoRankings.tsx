import { useState, useMemo } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { batchFetchAll } from "@/lib/batch-fetch";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoMetricsDialog } from "@/components/video/VideoMetricsDialog";
import { CopyableVideoId } from "@/components/video/CopyableVideoId";
import { exportToCSV } from "@/lib/export";
import { getVideoUrl } from "@/lib/storage";
import {
  Search,
  Download,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  MousePointer,
  ShoppingCart,
  DollarSign,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SortKey = "roas" | "ctr" | "purchases" | "spend" | "revenue" | "impressions" | "clicks";
type SortDir = "asc" | "desc";
type TimeRange = 7 | 30 | 90 | "all";

interface VideoRanking {
  id: string;
  title: string;
  unique_video_id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  creator_name: string;
  creator_avatar: string | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  purchases: number;
  roas: number;
  ctr: number;
}

export default function AdminVideoRankings() {
  const [timeRange, setTimeRange] = useState<TimeRange>(30);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("roas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedVideo, setSelectedVideo] = useState<VideoRanking | null>(null);

  const startDate = useMemo(() => {
    if (timeRange === "all") return null;
    const d = new Date();
    d.setDate(d.getDate() - timeRange);
    return d.toISOString().split("T")[0];
  }, [timeRange]);

  const { data: rankings, isLoading } = useQuery({
    queryKey: ["admin-video-rankings", startDate],
    queryFn: async () => {
      // Fetch approved videos with creator info
      const { data: videos, error: vErr } = await supabase
        .from("videos")
        .select("id, title, unique_video_id, video_url, thumbnail_url, creator_id")
        .eq("status", "approved");
      if (vErr) throw vErr;
      if (!videos?.length) return [];

      // Fetch creator profiles
      const creatorIds = [...new Set(videos.map((v) => v.creator_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", creatorIds);
      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      // Fetch performance data (may exceed 1000 rows)
      const perfData = await batchFetchAll((from, to) => {
        let q = supabase
          .from("performance_data")
          .select("video_id, spend, revenue, impressions, clicks, purchases");
        if (startDate) {
          q = q.gte("metric_date", startDate);
        }
        return q.range(from, to);
      });

      // Aggregate per video
      const aggMap = new Map<string, { spend: number; revenue: number; impressions: number; clicks: number; purchases: number }>();
      for (const row of perfData || []) {
        const existing = aggMap.get(row.video_id) || { spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0 };
        existing.spend += Number(row.spend || 0);
        existing.revenue += Number(row.revenue || 0);
        existing.impressions += Number(row.impressions || 0);
        existing.clicks += Number(row.clicks || 0);
        existing.purchases += Number(row.purchases || 0);
        aggMap.set(row.video_id, existing);
      }

      return videos.map((v) => {
        const perf = aggMap.get(v.id) || { spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0 };
        const profile = profileMap.get(v.creator_id);
        return {
          id: v.id,
          title: v.title,
          unique_video_id: v.unique_video_id,
          video_url: v.video_url,
          thumbnail_url: v.thumbnail_url,
          creator_name: profile?.full_name || "Unknown",
          creator_avatar: profile?.avatar_url || null,
          ...perf,
          roas: perf.spend > 0 ? perf.revenue / perf.spend : 0,
          ctr: perf.impressions > 0 ? (perf.clicks / perf.impressions) * 100 : 0,
        } as VideoRanking;
      });
    },
  });

  const filtered = useMemo(() => {
    if (!rankings) return [];
    let list = rankings;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.creator_name.toLowerCase().includes(q) ||
          v.unique_video_id.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [rankings, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/50" />;
    return sortDir === "desc" ? <ArrowDown className="w-3.5 h-3.5 text-primary" /> : <ArrowUp className="w-3.5 h-3.5 text-primary" />;
  };

  const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
  const fmtNum = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  };

  const roasColor = (r: number) => (r >= 2 ? "text-green-500" : r >= 1 ? "text-amber-500" : "text-destructive");
  const avgCtr = useMemo(() => {
    if (!filtered.length) return 0;
    return filtered.reduce((s, v) => s + v.ctr, 0) / filtered.length;
  }, [filtered]);

  const handleExport = () => {
    if (!filtered.length) return;
    exportToCSV(
      filtered.map((v) => ({
        video_id: v.unique_video_id,
        title: v.title,
        creator: v.creator_name,
        spend: v.spend.toFixed(2),
        revenue: v.revenue.toFixed(2),
        roas: v.roas.toFixed(2),
        ctr: v.ctr.toFixed(2),
        impressions: v.impressions,
        clicks: v.clicks,
        purchases: v.purchases,
      })),
      "video-rankings"
    );
  };

  const timeRanges: { label: string; value: TimeRange }[] = [
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
    { label: "All", value: "all" },
  ];

  // Summary stats
  const totals = useMemo(() => {
    if (!filtered.length) return { spend: 0, revenue: 0, purchases: 0, roas: 0 };
    const spend = filtered.reduce((s, v) => s + v.spend, 0);
    const revenue = filtered.reduce((s, v) => s + v.revenue, 0);
    const purchases = filtered.reduce((s, v) => s + v.purchases, 0);
    return { spend, revenue, purchases, roas: spend > 0 ? revenue / spend : 0 };
  }, [filtered]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Video Rankings</h1>
            <p className="text-sm text-muted-foreground">
              All approved videos ranked by ad performance
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Total Spend</span>
            </div>
            <p className="text-xl font-bold">{fmt(totals.spend)}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Total Revenue</span>
            </div>
            <p className="text-xl font-bold">{fmt(totals.revenue)}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Avg ROAS</span>
            </div>
            <p className={cn("text-xl font-bold", roasColor(totals.roas))}>{totals.roas.toFixed(2)}x</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Total Purchases</span>
            </div>
            <p className="text-xl font-bold">{fmtNum(totals.purchases)}</p>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, creator, or V-ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
            {timeRanges.map((t) => (
              <Button
                key={t.label}
                variant={timeRange === t.value ? "default" : "ghost"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setTimeRange(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">#</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground min-w-[250px]">Video</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Creator</th>
                  <th className="py-3 px-4 text-right cursor-pointer select-none" onClick={() => toggleSort("roas")}>
                    <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">ROAS <SortIcon col="roas" /></span>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer select-none" onClick={() => toggleSort("ctr")}>
                    <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">CTR <SortIcon col="ctr" /></span>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer select-none" onClick={() => toggleSort("purchases")}>
                    <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">Purchases <SortIcon col="purchases" /></span>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer select-none" onClick={() => toggleSort("spend")}>
                    <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">Spend <SortIcon col="spend" /></span>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer select-none" onClick={() => toggleSort("revenue")}>
                    <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">Revenue <SortIcon col="revenue" /></span>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer select-none" onClick={() => toggleSort("impressions")}>
                    <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">Impr. <SortIcon col="impressions" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-3 px-4"><Skeleton className="h-4 w-6" /></td>
                        <td className="py-3 px-4"><Skeleton className="h-10 w-48" /></td>
                        <td className="py-3 px-4"><Skeleton className="h-6 w-24" /></td>
                        <td className="py-3 px-4"><Skeleton className="h-4 w-12 ml-auto" /></td>
                        <td className="py-3 px-4"><Skeleton className="h-4 w-12 ml-auto" /></td>
                        <td className="py-3 px-4"><Skeleton className="h-4 w-12 ml-auto" /></td>
                        <td className="py-3 px-4"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        <td className="py-3 px-4"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        <td className="py-3 px-4"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      </tr>
                    ))
                  : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-muted-foreground">
                          {search ? "No videos match your search" : "No approved videos with performance data"}
                        </td>
                      </tr>
                    )
                  : filtered.map((v, i) => (
                      <tr
                        key={v.id}
                        className="border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => setSelectedVideo(v)}
                      >
                        <td className="py-3 px-4 text-muted-foreground font-medium">{i + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-8 rounded-md bg-muted overflow-hidden flex-shrink-0">
                              {v.thumbnail_url ? (
                                <img src={getVideoUrl(v.thumbnail_url)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate max-w-[180px]">{v.title}</p>
                              <CopyableVideoId videoId={v.unique_video_id} />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={v.creator_avatar || undefined} />
                              <AvatarFallback className="text-[10px]">{v.creator_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm truncate max-w-[100px]">{v.creator_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={cn("font-semibold", roasColor(v.roas))}>{v.roas.toFixed(2)}x</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={cn("font-medium", v.ctr > avgCtr ? "text-green-500" : "text-foreground")}>
                            {v.ctr.toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">{v.purchases}</td>
                        <td className="py-3 px-4 text-right font-medium">{fmt(v.spend)}</td>
                        <td className="py-3 px-4 text-right font-medium">{fmt(v.revenue)}</td>
                        <td className="py-3 px-4 text-right text-muted-foreground">{fmtNum(v.impressions)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Count */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            Showing {filtered.length} video{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Drill-down dialog */}
      <VideoMetricsDialog
        open={!!selectedVideo}
        onOpenChange={(open) => !open && setSelectedVideo(null)}
        videoId={selectedVideo?.id || null}
        videoUrl={selectedVideo?.video_url || null}
        title={selectedVideo?.title}
        uniqueVideoId={selectedVideo?.unique_video_id}
      />
    </AdminLayout>
  );
}
