import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { batchFetchAll } from "@/lib/batch-fetch";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { PerformanceOverview } from "@/components/analytics/PerformanceOverview";
import { VideoPerformanceTable } from "@/components/analytics/VideoPerformanceTable";
import { useSettings } from "@/hooks/use-settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";

interface PerformanceDataPoint {
  date: string;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  spend: number;
}

interface DailyData {
  date: string;
  impressions: number;
  clicks: number;
  purchases: number;
}

interface VideoPerformanceData {
  id: string;
  title: string;
  video_url: string | null;
  thumbnail_url: string | null;
  unique_video_id: string;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  spend: number;
  roas: number;
  dailyData?: DailyData[];
}

export default function CreatorAnalytics() {
  const { profileId } = useAuth();
  const { settings } = useSettings();
  const [timeFilter, setTimeFilter] = useState("30");
  const [performanceData, setPerformanceData] = useState<PerformanceDataPoint[]>([]);
  const [videoPerformance, setVideoPerformance] = useState<VideoPerformanceData[]>([]);
  const [loading, setLoading] = useState(true);

  const metricVisibility = settings.analytics.creator_metrics;

  useEffect(() => {
    if (profileId) {
      fetchPerformanceData();
    }
  }, [profileId, timeFilter]);

  async function fetchPerformanceData() {
    try {
      setLoading(true);

      const daysAgo = parseInt(timeFilter);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      startDate.setHours(0, 0, 0, 0);

      const videos = await batchFetchAll((from, to) =>
        supabase
          .from("videos")
          .select(`
            id, title, video_url, thumbnail_url, unique_video_id,
            performance_data(impressions, clicks, purchases, revenue, spend, recorded_at, metric_date)
          `)
          .eq("creator_id", profileId)
          .eq("status", "approved")
          .range(from, to)
      );

      if (!videos || videos.length === 0) {
        setPerformanceData([]);
        setVideoPerformance([]);
        return;
      }

      const videoStats: VideoPerformanceData[] = videos.map((video: any) => {
        const perfData = (video.performance_data || []).filter(
          (pd: any) => pd.metric_date && new Date(pd.metric_date) >= startDate
        );

        const impressions = perfData.reduce((sum: number, pd: any) => sum + (pd.impressions || 0), 0);
        const clicks = perfData.reduce((sum: number, pd: any) => sum + (pd.clicks || 0), 0);
        const purchases = perfData.reduce((sum: number, pd: any) => sum + (pd.purchases || 0), 0);
        const revenue = perfData.reduce((sum: number, pd: any) => sum + (parseFloat(pd.revenue) || 0), 0);
        const spend = perfData.reduce((sum: number, pd: any) => sum + (parseFloat(pd.spend) || 0), 0);
        const roas = spend > 0 ? revenue / spend : 0;

        // Build daily data for sparkline
        const dailyMap: Record<string, DailyData> = {};
        perfData.forEach((pd: any) => {
          const d = pd.metric_date as string;
          if (!dailyMap[d]) dailyMap[d] = { date: d, impressions: 0, clicks: 0, purchases: 0 };
          dailyMap[d].impressions += pd.impressions || 0;
          dailyMap[d].clicks += pd.clicks || 0;
          dailyMap[d].purchases += pd.purchases || 0;
        });
        const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

        return {
          id: video.id, title: video.title, video_url: video.video_url,
          thumbnail_url: video.thumbnail_url, unique_video_id: video.unique_video_id,
          impressions, clicks, purchases, revenue, spend, roas, dailyData,
        };
      });

      const sortedVideoStats = videoStats
        .filter((v) => v.impressions > 0 || v.purchases > 0)
        .sort((a, b) => b.impressions - a.impressions);

      setVideoPerformance(sortedVideoStats);

      // Chart daily aggregation
      const dailyData: Record<string, PerformanceDataPoint> = {};
      videos.forEach((video: any) => {
        (video.performance_data || []).forEach((pd: any) => {
          const dateKey = pd.metric_date as string | undefined;
          if (!dateKey || new Date(dateKey) < startDate) return;
          if (!dailyData[dateKey]) {
            dailyData[dateKey] = { date: dateKey, impressions: 0, clicks: 0, purchases: 0, revenue: 0, spend: 0 };
          }
          dailyData[dateKey].impressions += pd.impressions || 0;
          dailyData[dateKey].clicks += pd.clicks || 0;
          dailyData[dateKey].purchases += pd.purchases || 0;
          dailyData[dateKey].revenue += parseFloat(pd.revenue) || 0;
          dailyData[dateKey].spend += parseFloat(pd.spend) || 0;
        });
      });

      setPerformanceData(
        Object.values(dailyData).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      );
    } catch (error) {
      console.error("Error fetching performance data:", error);
    } finally {
      setLoading(false);
    }
  }

  // Calculate averages for comparison
  const averages = videoPerformance.length > 0
    ? {
        impressions: videoPerformance.reduce((s, v) => s + v.impressions, 0) / videoPerformance.length,
        clicks: videoPerformance.reduce((s, v) => s + v.clicks, 0) / videoPerformance.length,
        ctr: (() => {
          const totalImp = videoPerformance.reduce((s, v) => s + v.impressions, 0);
          const totalClk = videoPerformance.reduce((s, v) => s + v.clicks, 0);
          return totalImp > 0 ? (totalClk / totalImp) * 100 : 0;
        })(),
        purchases: videoPerformance.reduce((s, v) => s + v.purchases, 0) / videoPerformance.length,
      }
    : undefined;

  return (
    <CreatorLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold">Analytics</h1>
            <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
              Track your video engagement and reach
            </p>
          </div>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-24 md:w-40 h-8 md:h-10 text-xs md:text-sm">
              <SelectValue placeholder="Time period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Days</SelectItem>
              <SelectItem value="30">30 Days</SelectItem>
              <SelectItem value="90">90 Days</SelectItem>
              <SelectItem value="365">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 md:h-24" />)}
            </div>
            <Skeleton className="h-48 md:h-80" />
            <Skeleton className="h-64" />
          </div>
        ) : performanceData.length === 0 && videoPerformance.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 md:py-16 text-muted-foreground">
            <BarChart3 className="w-12 h-12 md:w-16 md:h-16 mb-3 md:mb-4" />
            <h3 className="text-base md:text-lg font-medium mb-2">No analytics data yet</h3>
            <p className="text-center max-w-md text-xs md:text-base px-4">
              Once your approved videos start running as ads, you'll see detailed
              performance metrics here including impressions, clicks, and sales.
            </p>
          </div>
        ) : (
          <>
            <PerformanceOverview
              data={performanceData}
              timeFilter={timeFilter}
              approvedVideoCount={videoPerformance.length}
              metricVisibility={metricVisibility}
            />
            <VideoPerformanceTable
              videos={videoPerformance}
              metricVisibility={metricVisibility}
              averages={averages}
            />
          </>
        )}
      </div>
    </CreatorLayout>
  );
}
