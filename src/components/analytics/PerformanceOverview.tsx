import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, MousePointer, Eye, ShoppingCart, Percent } from "lucide-react";

interface PerformanceData {
  date: string;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  spend: number;
}

interface MetricVisibility {
  impressions: boolean;
  link_clicks: boolean;
  link_ctr: boolean;
  conversions: boolean;
}

interface PerformanceOverviewProps {
  data: PerformanceData[];
  timeFilter: string;
  approvedVideoCount?: number;
  metricVisibility?: MetricVisibility;
}

export function PerformanceOverview({
  data,
  timeFilter,
  approvedVideoCount = 0,
  metricVisibility = { impressions: true, link_clicks: true, link_ctr: false, conversions: true },
}: PerformanceOverviewProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    const groupedData: Record<string, PerformanceData> = {};

    data.forEach((item) => {
      const date = new Date(item.date);
      let key: string;

      if (timeFilter === "7" || timeFilter === "30") {
        key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else {
        key = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      }

      if (!groupedData[key]) {
        groupedData[key] = {
          date: key,
          impressions: 0,
          clicks: 0,
          purchases: 0,
          revenue: 0,
          spend: 0,
        };
      }

      groupedData[key].impressions += item.impressions;
      groupedData[key].clicks += item.clicks;
      groupedData[key].purchases += item.purchases;
      groupedData[key].revenue += item.revenue;
      groupedData[key].spend += item.spend;
    });

    return Object.values(groupedData);
  }, [data, timeFilter]);

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  // Calculate totals
  const totals = useMemo(() => {
    const t = data.reduce(
      (acc, item) => ({
        impressions: acc.impressions + item.impressions,
        clicks: acc.clicks + item.clicks,
        purchases: acc.purchases + item.purchases,
      }),
      { impressions: 0, clicks: 0, purchases: 0 }
    );
    return {
      ...t,
      ctr: t.impressions > 0 ? ((t.clicks / t.impressions) * 100) : 0,
    };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Video className="w-12 h-12 mb-4" />
          <p>No performance data available yet</p>
        </CardContent>
      </Card>
    );
  }

  // Build stat cards based on visibility
  const statCards = [];
  if (metricVisibility.impressions) {
    statCards.push({ icon: Eye, value: formatNumber(totals.impressions), label: "Impressions", color: "text-blue-500", bg: "bg-blue-500/10" });
  }
  if (metricVisibility.link_clicks) {
    statCards.push({ icon: MousePointer, value: formatNumber(totals.clicks), label: "Link Clicks", color: "text-indigo-500", bg: "bg-indigo-500/10" });
  }
  if (metricVisibility.link_ctr) {
    statCards.push({ icon: Percent, value: `${totals.ctr.toFixed(1)}%`, label: "Link CTR", color: "text-purple-500", bg: "bg-purple-500/10" });
  }
  if (metricVisibility.conversions) {
    statCards.push({ icon: ShoppingCart, value: formatNumber(totals.purchases), label: "Sales", color: "text-green-500", bg: "bg-green-500/10" });
  }
  statCards.push({ icon: Video, value: approvedVideoCount.toString(), label: "Approved Videos", color: "text-amber-500", bg: "bg-amber-500/10" });

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className={`grid grid-cols-2 md:grid-cols-${Math.min(statCards.length, 5)} gap-4`}>
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <Tabs defaultValue="engagement" className="w-full">
        <TabsList>
          {metricVisibility.impressions && <TabsTrigger value="engagement">Engagement</TabsTrigger>}
          {metricVisibility.conversions && <TabsTrigger value="sales">Sales</TabsTrigger>}
        </TabsList>

        {metricVisibility.impressions && (
          <TabsContent value="engagement" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Engagement Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => formatNumber(v)} />
                      <Tooltip
                        formatter={(value: number, name: string) => [formatNumber(value), name === "impressions" ? "Impressions" : "Clicks"]}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      />
                      <Area type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={2} fill="url(#colorImpressions)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {metricVisibility.conversions && (
          <TabsContent value="sales" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => [value, "Sales"]}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      />
                      <Area type="monotone" dataKey="purchases" stroke="#22c55e" strokeWidth={2} fill="url(#colorSales)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
