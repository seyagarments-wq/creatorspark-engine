import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Loader2,
  BarChart3,
  DollarSign,
  ShoppingCart,
  Eye,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DigestData {
  summary: {
    total_revenue: number;
    total_spend: number;
    total_purchases: number;
    total_impressions: number;
    total_clicks: number;
    overall_roas: number;
    overall_ctr: number;
    active_videos: number;
  };
  week_over_week: {
    revenue_change: number;
    sales_change: number;
    roas_change: number;
  };
  top_performers: {
    by_roas: Array<{ id: string; title: string; creator: string; roas: number; revenue: number }>;
    by_revenue: Array<{ id: string; title: string; creator: string; revenue: number; purchases: number }>;
    by_sales: Array<{ id: string; title: string; creator: string; purchases: number }>;
  };
  underperformers: Array<{ id: string; title: string; creator: string; roas: number; spend: number }>;
  ai_insights: {
    headline: string;
    key_insights: string[];
    recommendations: string[];
    sentiment: "positive" | "neutral" | "negative";
  };
}

interface Digest {
  id: string;
  week_start: string;
  week_end: string;
  digest_data: DigestData;
  created_at: string;
}

export function PerformanceDigestCard() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchLatestDigest();
  }, []);

  async function fetchLatestDigest() {
    try {
      const { data, error } = await supabase
        .from("performance_digests")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setDigest({
          ...data,
          digest_data: data.digest_data as unknown as DigestData,
        });
      }
    } catch (error) {
      console.error("Error fetching digest:", error);
    } finally {
      setLoading(false);
    }
  }

  async function generateDigest() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-performance-digest");
      
      if (error) throw error;
      
      toast({
        title: "Digest Generated",
        description: "Weekly performance digest has been updated",
      });
      
      fetchLatestDigest();
    } catch (error: any) {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate digest",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

  const formatNumber = (value: number) => 
    new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-3 h-3 text-success" />;
    if (change < 0) return <TrendingDown className="w-3 h-3 text-destructive" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "positive": return "bg-success/10 text-success border-success/30";
      case "negative": return "bg-destructive/10 text-destructive border-destructive/30";
      default: return "bg-muted text-muted-foreground border-muted";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!digest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Weekly Performance Digest
          </CardTitle>
          <CardDescription>AI-powered weekly summary of Meta Ads performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No digest generated yet</p>
            <Button onClick={generateDigest} disabled={generating}>
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Generate First Digest
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { summary, week_over_week, top_performers, underperformers, ai_insights } = digest.digest_data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Weekly Performance Digest
            </CardTitle>
            <CardDescription>
              {new Date(digest.week_start).toLocaleDateString()} - {new Date(digest.week_end).toLocaleDateString()}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={generateDigest} disabled={generating}>
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Limited Data Warning */}
        {summary.active_videos < 5 && summary.active_videos > 0 && (
          <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Limited data: only {summary.active_videos} video{summary.active_videos !== 1 ? "s" : ""} — insights may not be representative
          </div>
        )}

        {/* AI Headline */}
        <div className={`p-4 rounded-lg border ${getSentimentColor(ai_insights.sentiment)}`}>
          <p className="font-medium">{ai_insights.headline}</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="w-3 h-3" />
              Revenue
            </div>
            <div className="text-xl font-bold">{formatCurrency(summary.total_revenue)}</div>
            <div className="flex items-center gap-1 text-xs">
              {getChangeIcon(week_over_week.revenue_change)}
              <span className={week_over_week.revenue_change >= 0 ? "text-success" : "text-destructive"}>
                {week_over_week.revenue_change >= 0 ? "+" : ""}{week_over_week.revenue_change.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShoppingCart className="w-3 h-3" />
              Sales
            </div>
            <div className="text-xl font-bold">{summary.total_purchases}</div>
            <div className="flex items-center gap-1 text-xs">
              {getChangeIcon(week_over_week.sales_change)}
              <span className={week_over_week.sales_change >= 0 ? "text-success" : "text-destructive"}>
                {week_over_week.sales_change >= 0 ? "+" : ""}{week_over_week.sales_change.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3" />
              ROAS
            </div>
            <div className="text-xl font-bold">{summary.overall_roas.toFixed(2)}x</div>
            <div className="flex items-center gap-1 text-xs">
              {getChangeIcon(week_over_week.roas_change)}
              <span className={week_over_week.roas_change >= 0 ? "text-success" : "text-destructive"}>
                {week_over_week.roas_change >= 0 ? "+" : ""}{week_over_week.roas_change.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="w-3 h-3" />
              Impressions
            </div>
            <div className="text-xl font-bold">{formatNumber(summary.total_impressions)}</div>
            <div className="text-xs text-muted-foreground">
              {summary.overall_ctr.toFixed(2)}% CTR
            </div>
          </div>
        </div>

        {/* AI Insights */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-warning" />
            Key Insights
          </h4>
          <ul className="space-y-2">
            {ai_insights.key_insights.map((insight, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-primary">•</span>
                {insight}
              </li>
            ))}
          </ul>
        </div>

        {/* Recommendations */}
        <div className="space-y-3">
          <h4 className="font-medium">Recommendations</h4>
          <div className="flex flex-wrap gap-2">
            {ai_insights.recommendations.map((rec, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {rec}
              </Badge>
            ))}
          </div>
        </div>

        {/* Top Performer */}
        {top_performers.by_roas.length > 0 && (
          <div className="p-3 bg-success/5 border border-success/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-success" />
              <span className="text-sm font-medium">Top Performer This Week</span>
            </div>
            <p className="text-sm">
              <span className="font-medium">{top_performers.by_roas[0].title}</span>
              <span className="text-muted-foreground"> by {top_performers.by_roas[0].creator}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {top_performers.by_roas[0].roas.toFixed(2)}x ROAS • {formatCurrency(top_performers.by_roas[0].revenue)} revenue
            </p>
          </div>
        )}

        {/* Underperformers Warning */}
        {underperformers.length > 0 && (
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm font-medium">{underperformers.length} Videos Need Attention</span>
            </div>
            <p className="text-xs text-muted-foreground">
              These videos are spending budget but returning less than 1x ROAS
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
