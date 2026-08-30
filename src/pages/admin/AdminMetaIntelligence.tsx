import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { getVideoUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { HookScoreBadge } from "@/components/admin/HookScoreBadge";
import { VideoPreviewDialog } from "@/components/video/VideoPreviewDialog";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Brain,
  Upload,
  Loader2,
  Zap,
  Video,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Eye,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  BarChart3,
  RefreshCw,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  
  Info,
  Settings2,
  Minus,
} from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";

interface VideoForExport {
  id: string;
  title: string;
  unique_video_id: string;
  creator_name: string;
  hook_score: number | null;
  hook_analysis: string | null;
  meta_status: string | null;
  status: string;
  thumbnail_url: string | null;
}

interface PerformanceMetrics {
  total_revenue: number;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_purchases: number;
  overall_roas: number;
}

interface VideoWithPerformance {
  id: string;
  title: string;
  unique_video_id: string;
  creator_name: string;
  revenue: number;
  spend: number;
  impressions: number;
  purchases: number;
  roas: number;
  hook_score: number | null;
  meta_status: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
}

function getVideoDisplayName(creatorName: string, uniqueVideoId: string): string {
  const firstName = creatorName.split(" ")[0] || creatorName;
  const seqMatch = uniqueVideoId.match(/-(\d+)$/);
  const seq = seqMatch ? seqMatch[1] : uniqueVideoId;
  return `${firstName} #${seq}`;
}

interface SyncStatus {
  lastSync: string | null;
  synced: number;
  errors: number;
  isConnected: boolean;
}
interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

type TimeRange = "1d" | "7d" | "30d" | "all";


interface SparklinePoint {
  date: string;
  value: number;
}

interface MetricDelta {
  revenue: number;
  roas: number;
  aov: number;
  conversions: number;
}

interface SparklineData {
  revenue: SparklinePoint[];
  roas: SparklinePoint[];
  aov: SparklinePoint[];
  conversions: SparklinePoint[];
}

function calculatePercentageChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const delta = ((current - previous) / previous) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

export default function AdminMetaIntelligence() {
  const [videos, setVideos] = useState<VideoForExport[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [exportResults, setExportResults] = useState<{
    exported: number;
    failed: number;
  } | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [topVideos, setTopVideos] = useState<VideoWithPerformance[]>([]);
  const [videoSparklines, setVideoSparklines] = useState<Map<string, SparklinePoint[]>>(new Map());
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [videoTrendKeys, setVideoTrendKeys] = useState<{ key: string; label: string; color: string; thumbnailUrl: string | null }[]>([]);
  const [trendVideoCount, setTrendVideoCount] = useState<number>(10);
  const [syncing, setSyncing] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSync: null,
    synced: 0,
    errors: 0,
    isConnected: false,
  });
  
  const [metricDeltas, setMetricDeltas] = useState<MetricDelta>({ revenue: 0, roas: 0, aov: 0, conversions: 0 });
  const [sparklineData, setSparklineData] = useState<SparklineData>({ revenue: [], roas: [], aov: [], conversions: [] });
  const [previousMetrics, setPreviousMetrics] = useState<{ revenue: number; roas: number; aov: number; conversions: number } | null>(null);
  const [showAllVideos, setShowAllVideos] = useState(false);
  
  const [showExportQueue, setShowExportQueue] = useState(false);
  const [selectedVideoForPreview, setSelectedVideoForPreview] = useState<VideoWithPerformance | null>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();

  useEffect(() => {
    fetchVideos();
    fetchSyncStatus();
  }, []);

  useEffect(() => {
    fetchPerformanceData();
  }, [timeRange, trendVideoCount]);

  useEffect(() => {
    setShowExportQueue(!isMobile);
  }, [isMobile]);

  async function fetchVideos() {
    try {
      const { data, error } = await supabase
        .from("videos")
        .select(`
          id,
          title,
          unique_video_id,
          hook_score,
          hook_analysis,
          meta_status,
          status,
          thumbnail_url,
          profiles:creator_id(full_name)
        `)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((v: any) => ({
        ...v,
        creator_name: v.profiles?.full_name || "Unknown",
      }));

      setVideos(formatted);
    } catch (error) {
      console.error("Error fetching videos:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSyncStatus() {
    try {
      const { data, error } = await supabase
        .from("meta_credentials")
        .select("status, updated_at")
        .limit(1)
        .single();

      if (data && !error) {
        setSyncStatus((prev) => ({
          ...prev,
          lastSync: data.updated_at,
          isConnected: data.status === "connected",
        }));
      }
    } catch (error) {
      console.error("Error fetching sync status:", error);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-sync-performance");

      if (error) throw error;

      setSyncStatus((prev) => ({
        ...prev,
        lastSync: new Date().toISOString(),
        synced: data?.synced || 0,
        errors: data?.errors || 0,
      }));

      toast({
        title: "Sync Complete",
        description: `Synced ${data?.synced || 0} videos. ${data?.errors ? `${data.errors} errors.` : ""}`,
      });

      fetchPerformanceData();
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync performance data",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  }

  function toLocalDateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async function fetchPerformanceData() {
    try {
      const now = new Date();
      const days = timeRange === "1d" ? 0 : timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 0;

      let dateFilter: string | null = null;
      if (timeRange !== "all") {
        const cutoff = new Date(now);
        if (days > 0) cutoff.setDate(cutoff.getDate() - days);
        dateFilter = toLocalDateStr(cutoff);
      }

      let prevDateStart: string | null = null;
      let prevDateEnd: string | null = null;
      if (timeRange !== "all") {
        const compareDays = days > 0 ? days : 1;
        const prevEnd = new Date(now);
        prevEnd.setDate(prevEnd.getDate() - compareDays);
        prevDateEnd = toLocalDateStr(prevEnd);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - compareDays);
        prevDateStart = toLocalDateStr(prevStart);
      }

      let query = supabase
        .from("performance_data")
        .select(`
          video_id,
          impressions,
          clicks,
          purchases,
          revenue,
          spend,
          metric_date,
          videos:video_id (
            id,
            title,
            unique_video_id,
            hook_score,
            meta_status,
            thumbnail_url,
            video_url,
            profiles:creator_id(full_name)
          )
        `)
        .order("metric_date", { ascending: true })
        .range(0, 4999);

      if (dateFilter) {
        query = query.gte("metric_date", dateFilter);
      }

      const { data: perfData, error: perfError } = await query;

      if (perfError) throw perfError;

      let prevTotals = { revenue: 0, spend: 0, purchases: 0 };
      if (prevDateStart && prevDateEnd) {
        const { data: prevData } = await supabase
          .from("performance_data")
          .select("revenue, spend, purchases")
          .gte("metric_date", prevDateStart)
          .lt("metric_date", prevDateEnd);

        if (prevData) {
          prevTotals = prevData.reduce(
            (acc, row) => ({
              revenue: acc.revenue + (row.revenue || 0),
              spend: acc.spend + (row.spend || 0),
              purchases: acc.purchases + (row.purchases || 0),
            }),
            { revenue: 0, spend: 0, purchases: 0 }
          );
        }
      }

      if (!perfData || perfData.length === 0) {
        setMetrics({
          total_revenue: 0, total_spend: 0, total_impressions: 0,
          total_clicks: 0, total_purchases: 0, overall_roas: 0,
        });
        setTopVideos([]);
        setVideoSparklines(new Map());
        setSparklineData({ revenue: [], roas: [], aov: [], conversions: [] });
        return;
      }

      const totals = perfData.reduce(
        (acc, row) => ({
          revenue: acc.revenue + (row.revenue || 0),
          spend: acc.spend + (row.spend || 0),
          impressions: acc.impressions + (row.impressions || 0),
          clicks: acc.clicks + (row.clicks || 0),
          purchases: acc.purchases + (row.purchases || 0),
        }),
        { revenue: 0, spend: 0, impressions: 0, clicks: 0, purchases: 0 }
      );

      const currentRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
      const currentAov = totals.purchases > 0 ? totals.revenue / totals.purchases : 0;
      const prevRoas = prevTotals.spend > 0 ? prevTotals.revenue / prevTotals.spend : 0;
      const prevAov = prevTotals.purchases > 0 ? prevTotals.revenue / prevTotals.purchases : 0;

      setMetrics({
        total_revenue: totals.revenue,
        total_spend: totals.spend,
        total_impressions: totals.impressions,
        total_clicks: totals.clicks,
        total_purchases: totals.purchases,
        overall_roas: currentRoas,
      });

      setPreviousMetrics({
        revenue: prevTotals.revenue,
        roas: prevRoas,
        aov: prevAov,
        conversions: prevTotals.purchases,
      });

      const dailyMap = new Map<string, { revenue: number; spend: number; purchases: number }>();
      perfData.forEach((row) => {
        if (!row.metric_date) return;
        const existing = dailyMap.get(row.metric_date) || { revenue: 0, spend: 0, purchases: 0 };
        existing.revenue += row.revenue || 0;
        existing.spend += row.spend || 0;
        existing.purchases += row.purchases || 0;
        dailyMap.set(row.metric_date, existing);
      });

      const sortedDailyDates = Array.from(dailyMap.keys()).sort();
      setSparklineData({
        revenue: sortedDailyDates.map(d => ({ date: d, value: dailyMap.get(d)!.revenue })),
        roas: sortedDailyDates.map(d => {
          const day = dailyMap.get(d)!;
          return { date: d, value: day.spend > 0 ? day.revenue / day.spend : 0 };
        }),
        aov: sortedDailyDates.map(d => {
          const day = dailyMap.get(d)!;
          return { date: d, value: day.purchases > 0 ? day.revenue / day.purchases : 0 };
        }),
        conversions: sortedDailyDates.map(d => ({ date: d, value: dailyMap.get(d)!.purchases })),
      });

      const videoAgg = new Map<string, { revenue: number; spend: number; impressions: number; purchases: number; video: any }>();
      perfData.forEach((row) => {
        if (!row.video_id) return;
        const existing = videoAgg.get(row.video_id);
        if (existing) {
          existing.revenue += row.revenue || 0;
          existing.spend += row.spend || 0;
          existing.impressions += row.impressions || 0;
          existing.purchases += row.purchases || 0;
        } else {
          videoAgg.set(row.video_id, {
            revenue: row.revenue || 0,
            spend: row.spend || 0,
            impressions: row.impressions || 0,
            purchases: row.purchases || 0,
            video: row.videos,
          });
        }
      });

      const videosWithRoas = Array.from(videoAgg.entries())
        .map(([videoId, agg]) => {
          const video = agg.video as any;
          return {
            id: videoId,
            title: video?.title || "Unknown",
            unique_video_id: video?.unique_video_id || "",
            creator_name: video?.profiles?.full_name || "Unknown",
            revenue: agg.revenue,
            spend: agg.spend,
            impressions: agg.impressions,
            purchases: agg.purchases,
            roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
            hook_score: video?.hook_score || null,
            meta_status: video?.meta_status || null,
            thumbnail_url: video?.thumbnail_url || null,
            video_url: video?.video_url || null,
          };
        })
        .sort((a, b) => b.revenue - a.revenue);

      setTopVideos(videosWithRoas);

      // Build per-video daily sparkline data
      const videoDaily = new Map<string, Map<string, number>>();
      perfData.forEach((row) => {
        if (!row.metric_date || !row.video_id) return;
        if (!videoDaily.has(row.video_id)) videoDaily.set(row.video_id, new Map());
        const vd = videoDaily.get(row.video_id)!;
        vd.set(row.metric_date, (vd.get(row.metric_date) || 0) + (row.revenue || 0));
      });

      const sparklinesMap = new Map<string, SparklinePoint[]>();
      videoDaily.forEach((dailyMap, videoId) => {
        const sorted = Array.from(dailyMap.entries())
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => a.date.localeCompare(b.date));
        sparklinesMap.set(videoId, sorted);
      });
      setVideoSparklines(sparklinesMap);

      // Build chart data for line chart with thumbnail dots
      const VIDEO_COLORS = [
        "hsl(142, 76%, 36%)", "hsl(217, 91%, 60%)", "hsl(280, 65%, 60%)",
        "hsl(25, 95%, 53%)", "hsl(340, 82%, 52%)", "hsl(180, 70%, 40%)",
        "hsl(45, 93%, 47%)", "hsl(330, 60%, 50%)", "hsl(200, 80%, 50%)",
        "hsl(120, 60%, 45%)",
      ];

      const trendVideos = videosWithRoas.slice(0, trendVideoCount);
      const allDates = new Set<string>();
      videoDaily.forEach((dailyMap) => dailyMap.forEach((_, date) => allDates.add(date)));
      const maxChartDays = timeRange === "1d" ? 1 : timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
      const sortedChartDates = Array.from(allDates).sort().slice(-maxChartDays);

      const trendKeys = trendVideos.map((v, i) => ({
        key: `video_${v.id.slice(0, 8)}`,
        label: getVideoDisplayName(v.creator_name, v.unique_video_id),
        color: VIDEO_COLORS[i % VIDEO_COLORS.length],
        thumbnailUrl: v.thumbnail_url,
      }));
      setVideoTrendKeys(trendKeys);

      const chartDataArr: ChartDataPoint[] = sortedChartDates.map((dateKey) => {
        const point: ChartDataPoint = {
          date: new Date(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        };
        trendVideos.forEach((v) => {
          const key = `video_${v.id.slice(0, 8)}`;
          point[key] = Math.round((videoDaily.get(v.id)?.get(dateKey) || 0) * 100) / 100;
        });
        return point;
      });
      setChartData(chartDataArr);
    } catch (error) {
      console.error("Error fetching performance data:", error);
    }
  }


  async function analyzeHook(videoId: string) {
    setAnalyzing(videoId);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-video-hook", {
        body: { videoId },
      });

      if (error) throw error;

      toast({
        title: "Hook Analyzed",
        description: `Score: ${data.hook_score}/100`,
      });

      fetchVideos();
    } catch (error: any) {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze hook",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(null);
    }
  }

  async function handleBulkExport() {
    if (selectedIds.size === 0) return;

    setBulkExporting(true);
    setExportResults(null);

    try {
      const { data, error } = await supabase.functions.invoke("bulk-export-meta", {
        body: { videoIds: Array.from(selectedIds) },
      });

      if (error) throw error;

      setExportResults({
        exported: data.exported || 0,
        failed: data.failed || 0,
      });

      toast({
        title: "Bulk Export Complete",
        description: `${data.exported} videos exported, ${data.failed} failed`,
      });

      setSelectedIds(new Set());
      fetchVideos();
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export videos",
        variant: "destructive",
      });
    } finally {
      setBulkExporting(false);
    }
  }

  const eligibleForExport = videos.filter(
    (v) => !v.meta_status || v.meta_status === "not_uploaded" || v.meta_status === "error"
  );

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAllEligible = () => {
    if (selectedIds.size === eligibleForExport.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleForExport.map((v) => v.id)));
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);

  // Sparkline mini-chart component
  const MiniSparkline = ({ data, color }: { data: SparklinePoint[]; color: string }) => (
    <div className="h-8 w-full mt-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1}
            fill={`url(#gradient-${color.replace(/[^a-z0-9]/gi, "")})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  // Percentage change badge - compact pill style
  const DeltaBadge = ({ current, previous }: { current: number; previous: number }) => {
    const changeStr = calculatePercentageChange(current, previous);
    const isPositive = current >= previous;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
        isPositive 
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
          : "bg-red-500/10 text-red-500 dark:text-red-400"
      }`}>
        {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
        {changeStr}
      </span>
    );
  };

  // Spike detection for trending badge
  function isVideoTrending(videoId: string): boolean {
    const dailyData = videoSparklines.get(videoId);
    if (!dailyData || dailyData.length < 3) return false;
    const lastDay = dailyData[dailyData.length - 1].value;
    const prevDays = dailyData.slice(0, -1);
    const avg = prevDays.reduce((s, d) => s + d.value, 0) / prevDays.length;
    return lastDay >= avg * 2 && lastDay > 5;
  }

  // Custom chart dot that renders video thumbnails
  const renderThumbnailDot = (thumbnailUrl: string | null, color: string) => {
    return (props: any) => {
      const { cx, cy, index } = props;
      if (index === undefined || cx === undefined || cy === undefined) return null;
      const interval = Math.max(1, Math.floor((chartData.length || 1) / 5));
      if (index % interval !== 0 && index !== (chartData.length - 1)) return null;
      const url = thumbnailUrl ? getVideoUrl(thumbnailUrl) : null;
      if (!url) {
        return <circle cx={cx} cy={cy} r={5} fill={color} stroke="hsl(var(--background))" strokeWidth={2} />;
      }
      return (
        <g>
          <defs>
            <clipPath id={`clip-${cx}-${cy}`}>
              <circle cx={cx} cy={cy} r={12} />
            </clipPath>
          </defs>
          <circle cx={cx} cy={cy} r={13} fill="hsl(var(--background))" />
          <circle cx={cx} cy={cy} r={12} fill={color} fillOpacity={0.2} />
          <image
            x={cx - 12}
            y={cy - 12}
            width={24}
            height={24}
            href={url}
            clipPath={`url(#clip-${cx}-${cy})`}
            style={{ objectFit: "cover" }}
          />
          <circle cx={cx} cy={cy} r={12} fill="none" stroke={color} strokeWidth={2.5} />
        </g>
      );
    };
  };

  // ROAS badge for table
  const getRoasBadge = (roas: number) => {
    if (roas >= 2) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="w-3 h-3" />
          {roas.toFixed(1)}x
        </span>
      );
    } else if (roas >= 1) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Minus className="w-3 h-3" />
          {roas.toFixed(1)}x
        </span>
      );
    } else if (roas > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 dark:text-red-400">
          <TrendingDown className="w-3 h-3" />
          {roas.toFixed(1)}x
        </span>
      );
    }
    return <span className="text-[11px] text-muted-foreground">--</span>;
  };

  const currentAov = metrics && metrics.total_purchases > 0 ? metrics.total_revenue / metrics.total_purchases : 0;

  // Time range pills
  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: "1d", label: "1D" },
    { value: "7d", label: "7D" },
    { value: "30d", label: "30D" },
    { value: "all", label: "All" },
  ];

  // Sorted videos for flat table (by revenue desc)
  const sortedTableVideos = [...topVideos].sort((a, b) => b.revenue - a.revenue);
  const displayedTableVideos = showAllVideos ? sortedTableVideos : sortedTableVideos.slice(0, 10);

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* ===== HEADER - Streamlined single row ===== */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <h1 className="text-lg md:text-xl font-bold">Meta Intelligence</h1>
            {syncStatus.isConnected ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>Meta not connected</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Time Range Pills */}
            <div className="inline-flex items-center rounded-lg border bg-secondary/30 p-0.5">
              {timeRangeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTimeRange(opt.value)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    timeRange === opt.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sync icon button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleManualSync}
                    disabled={syncing || !syncStatus.isConnected}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {syncStatus.lastSync 
                    ? `Last sync: ${new Date(syncStatus.lastSync).toLocaleString()}`
                    : "Sync performance data"
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Limited data warning */}
            {topVideos.length > 0 && topVideos.length < 5 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Limited data: only {topVideos.length} video{topVideos.length !== 1 ? "s" : ""}
                    with metrics
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* ===== STAT CARDS - 4x2 grid (Trybe-style 8 metrics) ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Meta Purchase Value (Revenue) */}
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Meta Purchase Value</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl md:text-2xl font-bold">{formatCurrency(metrics?.total_revenue || 0)}</p>
                {previousMetrics && (
                  <DeltaBadge current={metrics?.total_revenue || 0} previous={previousMetrics.revenue} />
                )}
              </div>
              <div className="mt-2 h-0.5 w-full rounded-full bg-emerald-500/20"><div className="h-full rounded-full bg-emerald-500" style={{ width: '100%' }} /></div>
            </CardContent>
          </Card>

          {/* Spend */}
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Spend</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl md:text-2xl font-bold">{formatCurrency(metrics?.total_spend || 0)}</p>
                <span className="text-[10px] text-muted-foreground">--</span>
              </div>
              <div className="mt-2 h-0.5 w-full rounded-full bg-blue-500/20"><div className="h-full rounded-full bg-blue-500" style={{ width: '100%' }} /></div>
            </CardContent>
          </Card>

          {/* ROAS */}
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">ROAS</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl md:text-2xl font-bold">{(metrics?.overall_roas || 0).toFixed(2)}x</p>
                {previousMetrics && (
                  <DeltaBadge current={metrics?.overall_roas || 0} previous={previousMetrics.roas} />
                )}
              </div>
              <div className="mt-2 h-0.5 w-full rounded-full bg-purple-500/20"><div className="h-full rounded-full bg-purple-500" style={{ width: '100%' }} /></div>
            </CardContent>
          </Card>

          {/* CPA */}
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">CPA</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl md:text-2xl font-bold">
                  {metrics && metrics.total_purchases > 0 
                    ? formatCurrency(metrics.total_spend / metrics.total_purchases) 
                    : "$0"}
                </p>
                <span className="text-[10px] text-muted-foreground">--</span>
              </div>
              <div className="mt-2 h-0.5 w-full rounded-full bg-orange-500/20"><div className="h-full rounded-full bg-orange-500" style={{ width: '100%' }} /></div>
            </CardContent>
          </Card>

          {/* AOV */}
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">AOV</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl md:text-2xl font-bold">{formatCurrency(currentAov)}</p>
                {previousMetrics && (
                  <DeltaBadge current={currentAov} previous={previousMetrics.aov} />
                )}
              </div>
              <div className="mt-2 h-0.5 w-full rounded-full bg-violet-500/20"><div className="h-full rounded-full bg-violet-500" style={{ width: '100%' }} /></div>
            </CardContent>
          </Card>

          {/* CPC All */}
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">CPC All</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl md:text-2xl font-bold">
                  {metrics && metrics.total_clicks > 0 
                    ? `$${(metrics.total_spend / metrics.total_clicks).toFixed(2)}`
                    : "$0.00"}
                </p>
                <span className="text-[10px] text-muted-foreground">--</span>
              </div>
              <div className="mt-2 h-0.5 w-full rounded-full bg-cyan-500/20"><div className="h-full rounded-full bg-cyan-500" style={{ width: '100%' }} /></div>
            </CardContent>
          </Card>

          {/* CPC Link */}
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">CPC Link</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl md:text-2xl font-bold">
                  {metrics && metrics.total_clicks > 0 
                    ? `$${(metrics.total_spend / metrics.total_clicks).toFixed(2)}`
                    : "$0.00"}
                </p>
                <span className="text-[10px] text-muted-foreground">--</span>
              </div>
              <div className="mt-2 h-0.5 w-full rounded-full bg-teal-500/20"><div className="h-full rounded-full bg-teal-500" style={{ width: '100%' }} /></div>
            </CardContent>
          </Card>

          {/* CPM */}
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">CPM</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl md:text-2xl font-bold">
                  {metrics && metrics.total_impressions > 0 
                    ? `$${((metrics.total_spend / metrics.total_impressions) * 1000).toFixed(2)}`
                    : "$0.00"}
                </p>
                <span className="text-[10px] text-muted-foreground">--</span>
              </div>
              <div className="mt-2 h-0.5 w-full rounded-full bg-pink-500/20"><div className="h-full rounded-full bg-pink-500" style={{ width: '100%' }} /></div>
            </CardContent>
          </Card>
        </div>

        {/* ===== TOP PERFORMING VIDEOS CHART ===== */}
        {chartData.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base md:text-lg font-bold">Top Performing Videos</h2>
                  <p className="text-xs text-muted-foreground">
                    {videoTrendKeys.length} video{videoTrendKeys.length !== 1 ? "s" : ""} · GMV Trends
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {videoTrendKeys.map((vk) => (
                      <span key={vk.key} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-border bg-secondary/50">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: vk.color }} />
                        {vk.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] md:h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: number, name: string) => {
                        const vk = videoTrendKeys.find(k => k.key === name);
                        return [formatCurrency(value), vk?.label || name];
                      }}
                    />
                    {videoTrendKeys.map((vk) => (
                      <Line
                        key={vk.key}
                        type="monotone"
                        dataKey={vk.key}
                        stroke={vk.color}
                        name={vk.key}
                        strokeWidth={2.5}
                        dot={renderThumbnailDot(vk.thumbnailUrl, vk.color)}
                        activeDot={{ r: 5, strokeWidth: 2 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No performance data yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Export videos to Meta and performance metrics will sync automatically
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== TOP VIDEOS TABLE - Flat, sorted by revenue ===== */}
        {sortedTableVideos.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base md:text-lg">Top Performing Videos</CardTitle>
                  <CardDescription className="text-xs">Ranked by revenue</CardDescription>
                </div>
                {sortedTableVideos.length > 10 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setShowAllVideos(!showAllVideos)}
                  >
                    {showAllVideos ? "Show less" : `View all (${sortedTableVideos.length})`}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
                      <th className="text-left p-3 font-medium w-8">#</th>
                      <th className="text-left p-3 font-medium">Video</th>
                      <th className="text-left p-3 font-medium">Creator</th>
                      <th className="text-right p-3 font-medium">Revenue</th>
                      <th className="text-right p-3 font-medium">ROAS</th>
                      <th className="text-right p-3 font-medium">Impressions</th>
                      <th className="text-right p-3 font-medium">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTableVideos.map((video, idx) => (
                      <tr 
                        key={video.id} 
                        className={`border-b last:border-0 transition-colors cursor-pointer ${
                          idx % 2 === 0 ? "bg-transparent" : "bg-muted/30"
                        } hover:bg-muted/50`}
                        onClick={() => setSelectedVideoForPreview(video)}
                      >
                        <td className="p-3 text-xs text-muted-foreground font-medium">{idx + 1}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <VideoThumbnail
                              thumbnailUrl={video.thumbnail_url}
                              videoUrl={video.video_url}
                              title={video.title}
                              size="sm"
                              showPlayButton={false}
                              showStatus={false}
                              className="w-10 shrink-0 rounded-md overflow-hidden"
                            />
                            <div className="min-w-0">
                              <span className="text-sm font-medium truncate max-w-[180px] block">{getVideoDisplayName(video.creator_name, video.unique_video_id)}</span>
                              <span className="text-[10px] text-muted-foreground">{video.unique_video_id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">{video.creator_name}</td>
                        <td className="p-3 text-right text-sm font-semibold">{formatCurrency(video.revenue)}</td>
                        <td className="p-3 text-right">{getRoasBadge(video.roas)}</td>
                        <td className="p-3 text-right text-sm text-muted-foreground">{formatNumber(video.impressions)}</td>
                        <td className="p-3 text-right text-sm">{video.purchases}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card layout */}
              <div className="md:hidden divide-y">
                {displayedTableVideos.map((video, idx) => (
                  <div key={video.id} className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => setSelectedVideoForPreview(video)}>
                    <span className="text-xs text-muted-foreground font-bold w-5 shrink-0">{idx + 1}</span>
                    <VideoThumbnail
                      thumbnailUrl={video.thumbnail_url}
                      videoUrl={video.video_url}
                      title={video.title}
                      size="sm"
                      showPlayButton={false}
                      showStatus={false}
                      className="w-10 shrink-0 rounded-md overflow-hidden"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{getVideoDisplayName(video.creator_name, video.unique_video_id)}</p>
                      <p className="text-[10px] text-muted-foreground">{video.unique_video_id}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-semibold">{formatCurrency(video.revenue)}</span>
                        <span className="text-[10px] text-muted-foreground">{formatNumber(video.impressions)} imp</span>
                        <span className="text-[10px] text-muted-foreground">{video.purchases} sales</span>
                      </div>
                    </div>
                    <div className="shrink-0">{getRoasBadge(video.roas)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}


        {/* ===== BULK EXPORT QUEUE - Collapsible ===== */}
        {isMobile ? (
          <Collapsible open={showExportQueue} onOpenChange={setShowExportQueue}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                {showExportQueue ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <Upload className="w-4 h-4" />
                Bulk Export Queue
                {selectedIds.size > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">{selectedIds.size}</Badge>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-2">
                <BulkExportSection
                  videos={videos}
                  loading={loading}
                  selectedIds={selectedIds}
                  eligibleForExport={eligibleForExport}
                  toggleSelect={toggleSelect}
                  selectAllEligible={selectAllEligible}
                  handleBulkExport={handleBulkExport}
                  bulkExporting={bulkExporting}
                  exportResults={exportResults}
                  analyzing={analyzing}
                  analyzeHook={analyzeHook}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <BulkExportSection
            videos={videos}
            loading={loading}
            selectedIds={selectedIds}
            eligibleForExport={eligibleForExport}
            toggleSelect={toggleSelect}
            selectAllEligible={selectAllEligible}
            handleBulkExport={handleBulkExport}
            bulkExporting={bulkExporting}
            exportResults={exportResults}
            analyzing={analyzing}
            analyzeHook={analyzeHook}
          />
        )}
      </div>

      <VideoPreviewDialog
        open={!!selectedVideoForPreview}
        onOpenChange={(open) => !open && setSelectedVideoForPreview(null)}
        videoUrl={selectedVideoForPreview?.video_url || null}
        title={selectedVideoForPreview ? getVideoDisplayName(selectedVideoForPreview.creator_name, selectedVideoForPreview.unique_video_id) : undefined}
      />
    </AdminLayout>
  );
}

// Extracted Bulk Export section as a component for reuse in collapsible/non-collapsible contexts
function BulkExportSection({
  videos,
  loading,
  selectedIds,
  eligibleForExport,
  toggleSelect,
  selectAllEligible,
  handleBulkExport,
  bulkExporting,
  exportResults,
  analyzing,
  analyzeHook,
}: {
  videos: VideoForExport[];
  loading: boolean;
  selectedIds: Set<string>;
  eligibleForExport: VideoForExport[];
  toggleSelect: (id: string) => void;
  selectAllEligible: () => void;
  handleBulkExport: () => void;
  bulkExporting: boolean;
  exportResults: { exported: number; failed: number } | null;
  analyzing: string | null;
  analyzeHook: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="w-4 h-4" />
              Bulk Export Queue
            </CardTitle>
            <CardDescription className="text-xs">
              Select approved videos to export to Meta Ads
            </CardDescription>
          </div>
          {selectedIds.size > 0 && (
            <Button
              onClick={handleBulkExport}
              disabled={bulkExporting}
              className="bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] w-full sm:w-auto"
              size="sm"
            >
              {bulkExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Export {selectedIds.size} Videos
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {exportResults && (
          <div className="mb-4 p-3 bg-secondary/50 rounded-lg flex items-center gap-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">{exportResults.exported} exported</span>
            </div>
            {exportResults.failed > 0 && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{exportResults.failed} failed</span>
              </div>
            )}
          </div>
        )}

        {eligibleForExport.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <Checkbox
              checked={selectedIds.size === eligibleForExport.length && eligibleForExport.length > 0}
              onCheckedChange={selectAllEligible}
            />
            <span className="text-xs text-muted-foreground">
              Select all eligible ({eligibleForExport.length})
            </span>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-6">
            <Video className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No approved videos yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-1.5">
              {videos.map((video) => {
                const isEligible =
                  !video.meta_status ||
                  video.meta_status === "not_uploaded" ||
                  video.meta_status === "error";

                return (
                  <div
                    key={video.id}
                    className={`p-2.5 rounded-lg border flex items-center gap-3 ${
                      selectedIds.has(video.id)
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    {isEligible && (
                      <Checkbox
                        checked={selectedIds.has(video.id)}
                        onCheckedChange={() => toggleSelect(video.id)}
                      />
                    )}

                    {video.thumbnail_url && (
                      <img
                        src={getVideoUrl(video.thumbnail_url) || undefined}
                        alt={video.title}
                        className="w-10 h-7 object-cover rounded"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{video.title}</span>
                        {video.hook_score !== null && (
                          <HookScoreBadge
                            score={video.hook_score}
                            analysis={video.hook_analysis}
                            size="sm"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="truncate">{video.unique_video_id}</span>
                        <span>•</span>
                        <span className="truncate">{video.creator_name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {video.meta_status === "uploaded" && (
                        <Badge variant="outline" className="bg-[hsl(217,91%,60%)]/10 text-[hsl(217,91%,60%)] border-[hsl(217,91%,60%)]/30 text-[10px] px-1.5 py-0.5">
                          <Zap className="w-3 h-3 mr-0.5" />
                          Meta
                        </Badge>
                      )}
                      {video.meta_status === "error" && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] px-1.5 py-0.5">
                          <AlertCircle className="w-3 h-3 mr-0.5" />
                          Error
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => analyzeHook(video.id)}
                        disabled={analyzing === video.id}
                      >
                        {analyzing === video.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Brain className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
