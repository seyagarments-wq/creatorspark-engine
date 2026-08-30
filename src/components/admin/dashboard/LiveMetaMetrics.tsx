import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, Eye, Target, Loader2 } from "lucide-react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

interface MetaMetrics {
  spend: number;
  revenue: number;
  impressions: number;
  roas: number;
}

export function LiveMetaMetrics() {
  const [metrics, setMetrics] = useState<MetaMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const debouncedFetch = useDebouncedCallback(() => fetchMetrics(), 500);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(() => fetchMetrics(), 60000);
    const channel = supabase
      .channel("live-meta-metrics")
      .on("postgres_changes", { event: "*", schema: "public", table: "performance_data" }, () => debouncedFetch())
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  function toLocalDateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async function fetchMetrics() {
    try {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startStr = toLocalDateStr(firstOfMonth);

      const { data: perfData } = await supabase
        .from("performance_data")
        .select("impressions, spend, revenue, metric_date")
        .gte("metric_date", startStr);

      let spend = 0, revenue = 0, impressions = 0;
      (perfData || []).forEach((row) => {
        spend += Number(row.spend) || 0;
        revenue += Number(row.revenue) || 0;
        impressions += Number(row.impressions) || 0;
      });

      setMetrics({
        spend,
        revenue,
        impressions,
        roas: spend > 0 ? revenue / spend : 0,
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching meta metrics:", err);
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const fmtNum = (n: number) =>
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  const monthLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  const cards = [
    { label: "Ad Spend", value: fmt(metrics.spend), icon: DollarSign, color: "text-rose-500", bg: "bg-rose-500/10" },
    { label: "Revenue", value: fmt(metrics.revenue), icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    {
      label: "ROAS",
      value: `${metrics.roas.toFixed(2)}x`,
      icon: Target,
      color: metrics.roas >= 1 ? "text-emerald-500" : "text-amber-500",
      bg: metrics.roas >= 1 ? "bg-emerald-500/10" : "bg-amber-500/10",
    },
    { label: "Impressions", value: fmtNum(metrics.impressions), icon: Eye, color: "text-blue-500", bg: "bg-blue-500/10" },
  ];

  return (
    <div className="space-y-2 w-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Meta Ad Performance · {monthLabel}
        </h2>
        <Badge variant="outline" className="text-[10px] gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live · {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Badge>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="border-border/50">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
                <div className={`p-1 md:p-1.5 rounded-lg ${c.bg}`}>
                  <c.icon className={`w-3 h-3 md:w-3.5 md:h-3.5 ${c.color}`} />
                </div>
                <span className="text-[10px] md:text-xs text-muted-foreground">{c.label}</span>
              </div>
              <p className="text-base md:text-xl font-bold tracking-tight truncate">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
