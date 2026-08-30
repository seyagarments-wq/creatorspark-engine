import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { VideoPreviewDialog } from "@/components/video/VideoPreviewDialog";
import { Eye, ShoppingCart, MousePointer, Percent, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

interface MetricVisibility {
  impressions: boolean;
  link_clicks: boolean;
  link_ctr: boolean;
  conversions: boolean;
}

interface VideoPerformanceTableProps {
  videos: VideoPerformanceData[];
  metricVisibility?: MetricVisibility;
  averages?: { impressions: number; clicks: number; ctr: number; purchases: number };
}

export function VideoPerformanceTable({
  videos,
  metricVisibility = { impressions: true, link_clicks: true, link_ctr: false, conversions: true },
  averages,
}: VideoPerformanceTableProps) {
  const [previewVideo, setPreviewVideo] = useState<VideoPerformanceData | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-amber-500/10 text-amber-600 border-0 gap-1 font-bold"><Trophy className="w-3 h-3" />#1</Badge>;
    if (rank === 2) return <Badge className="bg-slate-400/10 text-slate-500 border-0 gap-1 font-bold">#2</Badge>;
    if (rank === 3) return <Badge className="bg-orange-400/10 text-orange-500 border-0 gap-1 font-bold">#3</Badge>;
    return <Badge variant="outline" className="text-muted-foreground border-0 font-medium">#{rank}</Badge>;
  };

  if (videos.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg">Video Rankings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left p-3 font-medium w-8">Rank</th>
                  <th className="text-left p-3 font-medium">Video</th>
                  {metricVisibility.impressions && (
                    <th className="text-right p-3 font-medium hidden md:table-cell">
                      <span className="flex items-center justify-end gap-1"><Eye className="w-3 h-3" /> Views</span>
                    </th>
                  )}
                  {metricVisibility.link_clicks && (
                    <th className="text-right p-3 font-medium hidden md:table-cell">
                      <span className="flex items-center justify-end gap-1"><MousePointer className="w-3 h-3" /> Clicks</span>
                    </th>
                  )}
                  {metricVisibility.link_ctr && (
                    <th className="text-right p-3 font-medium hidden md:table-cell">
                      <span className="flex items-center justify-end gap-1"><Percent className="w-3 h-3" /> CTR</span>
                    </th>
                  )}
                  {metricVisibility.conversions && (
                    <th className="text-right p-3 font-medium">
                      <span className="flex items-center justify-end gap-1"><ShoppingCart className="w-3 h-3" /> Sales</span>
                    </th>
                  )}
                  <th className="w-8 p-3"></th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video, index) => {
                  const rank = index + 1;
                  const ctr = video.impressions > 0 ? ((video.clicks / video.impressions) * 100) : 0;
                  const isExpanded = expandedId === video.id;

                  return (
                    <Collapsible key={video.id} open={isExpanded} onOpenChange={(open) => setExpandedId(open ? video.id : null)} asChild>
                      <>
                        <tr className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="p-2 md:p-3 text-center">{getRankBadge(rank)}</td>
                          <td className="p-2 md:p-3">
                            <div className="flex items-center gap-2 md:gap-3">
                              <div
                                className="cursor-pointer"
                                onClick={() => setPreviewVideo(video)}
                              >
                                <VideoThumbnail
                                  thumbnailUrl={video.thumbnail_url}
                                  videoUrl={video.video_url}
                                  title={video.title}
                                  size="sm"
                                  showPlayButton={false}
                                  showStatus={false}
                                  className="w-10 shrink-0"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs md:text-sm font-medium truncate max-w-[120px] md:max-w-[200px]">
                                  {video.title}
                                </p>
                                <p className="text-[10px] md:text-xs text-muted-foreground">
                                  {video.unique_video_id}
                                </p>
                                {/* Mobile-only stats */}
                                <div className="flex items-center gap-2 mt-1 md:hidden text-[10px] text-muted-foreground">
                                  {metricVisibility.impressions && <span>{formatNumber(video.impressions)} views</span>}
                                  {metricVisibility.impressions && metricVisibility.link_clicks && <span>•</span>}
                                  {metricVisibility.link_clicks && <span>{formatNumber(video.clicks)} clicks</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          {metricVisibility.impressions && (
                            <td className="p-3 text-right text-sm hidden md:table-cell">{formatNumber(video.impressions)}</td>
                          )}
                          {metricVisibility.link_clicks && (
                            <td className="p-3 text-right text-sm hidden md:table-cell">{formatNumber(video.clicks)}</td>
                          )}
                          {metricVisibility.link_ctr && (
                            <td className="p-3 text-right text-sm hidden md:table-cell">{ctr.toFixed(1)}%</td>
                          )}
                          {metricVisibility.conversions && (
                            <td className="p-2 md:p-3 text-right text-sm">{video.purchases}</td>
                          )}
                          <td className="p-2 md:p-3">
                            <CollapsibleTrigger asChild>
                              <button className="p-1 rounded hover:bg-muted transition-colors">
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                              </button>
                            </CollapsibleTrigger>
                          </td>
                        </tr>
                        <CollapsibleContent asChild>
                          <tr>
                            <td colSpan={7} className="p-0">
                              <VideoExpandedDetail
                                video={video}
                                ctr={ctr}
                                averages={averages}
                                metricVisibility={metricVisibility}
                              />
                            </td>
                          </tr>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <VideoPreviewDialog
        open={!!previewVideo}
        onOpenChange={(open) => !open && setPreviewVideo(null)}
        videoUrl={previewVideo?.video_url || null}
        title={previewVideo?.title}
      />
    </>
  );
}

function VideoExpandedDetail({
  video,
  ctr,
  averages,
  metricVisibility,
}: {
  video: VideoPerformanceData;
  ctr: number;
  averages?: { impressions: number; clicks: number; ctr: number; purchases: number };
  metricVisibility: MetricVisibility;
}) {
  const dailyData = video.dailyData || [];

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  const ComparisonStat = ({ label, value, avg, format = "number" }: { label: string; value: number; avg?: number; format?: "number" | "percent" }) => {
    const diff = avg && avg > 0 ? ((value - avg) / avg) * 100 : 0;
    const isAbove = diff > 0;
    return (
      <div className="text-center">
        <p className="text-lg font-bold">
          {format === "percent" ? `${value.toFixed(1)}%` : formatNumber(value)}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {avg !== undefined && avg > 0 && (
          <p className={cn("text-[10px] font-medium mt-0.5", isAbove ? "text-green-500" : "text-red-500")}>
            {isAbove ? "+" : ""}{diff.toFixed(0)}% vs avg
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-muted/30 border-t p-4 space-y-4">
      {/* Stat comparison cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metricVisibility.impressions && (
          <ComparisonStat label="Impressions" value={video.impressions} avg={averages?.impressions} />
        )}
        {metricVisibility.link_clicks && (
          <ComparisonStat label="Clicks" value={video.clicks} avg={averages?.clicks} />
        )}
        {metricVisibility.link_ctr && (
          <ComparisonStat label="CTR" value={ctr} avg={averages?.ctr} format="percent" />
        )}
        {metricVisibility.conversions && (
          <ComparisonStat label="Sales" value={video.purchases} avg={averages?.purchases} />
        )}
      </div>

      {/* Daily trend sparkline */}
      {dailyData.length > 1 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Daily Impressions Trend</p>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id={`spark-${video.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <Tooltip
                  formatter={(value: number) => [formatNumber(value), "Impressions"]}
                  labelFormatter={(label) => new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                />
                <Area type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={1.5} fill={`url(#spark-${video.id})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
