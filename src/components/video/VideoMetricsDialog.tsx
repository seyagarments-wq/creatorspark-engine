import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getVideoUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { X, Loader2, DollarSign, Eye, MousePointer, ShoppingCart, TrendingUp, BarChart3, Crosshair, Megaphone, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyableVideoId } from "@/components/video/CopyableVideoId";

interface VideoMetricsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string | null;
  videoUrl: string | null;
  title?: string;
  uniqueVideoId?: string;
}

interface AggregatedMetrics {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  purchases: number;
}

export function VideoMetricsDialog({
  open,
  onOpenChange,
  videoId,
  videoUrl,
  title,
  uniqueVideoId,
}: VideoMetricsDialogProps) {
  const { toast } = useToast();
  const fullVideoUrl = videoUrl ? getVideoUrl(videoUrl) : null;
  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && videoId) {
      fetchMetrics(videoId);
    } else if (!open) {
      setMetrics(null);
    }
  }, [open, videoId]);

  async function fetchMetrics(id: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("performance_data")
        .select("spend, revenue, impressions, clicks, purchases")
        .eq("video_id", id);

      if (error) throw error;

      const agg = (data || []).reduce(
        (acc, row) => ({
          spend: acc.spend + Number(row.spend || 0),
          revenue: acc.revenue + Number(row.revenue || 0),
          impressions: acc.impressions + Number(row.impressions || 0),
          clicks: acc.clicks + Number(row.clicks || 0),
          purchases: acc.purchases + Number(row.purchases || 0),
        }),
        { spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0 }
      );
      setMetrics(agg);
    } catch (err) {
      console.error("Error fetching video metrics:", err);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

  const formatNumber = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toLocaleString();
  };

  const roas = metrics && metrics.spend > 0 ? (metrics.revenue / metrics.spend) : 0;
  const cpa = metrics && metrics.purchases > 0 ? (metrics.spend / metrics.purchases) : 0;
  const cpm = metrics && metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0;
  const cpcLink = metrics && metrics.clicks > 0 ? (metrics.spend / metrics.clicks) : 0;
  const cpcAll = cpcLink; // same data source

  const metricCards = metrics
    ? [
        { label: "Spend", value: formatCurrency(metrics.spend), icon: DollarSign, color: "text-destructive" },
        { label: "ROAS", value: `${roas.toFixed(2)}x`, icon: TrendingUp, color: "text-success" },
        { label: "CPA", value: formatCurrency(cpa), icon: Crosshair, color: "text-primary" },
        { label: "CPM", value: formatCurrency(cpm), icon: Megaphone, color: "text-warning" },
        { label: "CPC Link", value: formatCurrency(cpcLink), icon: MousePointer, color: "text-primary" },
        { label: "CPC All", value: formatCurrency(cpcAll), icon: BarChart3, color: "text-muted-foreground" },
        { label: "Clicks", value: formatNumber(metrics.clicks), icon: MousePointer, color: "text-primary" },
        { label: "Conversions", value: metrics.purchases.toLocaleString(), icon: ShoppingCart, color: "text-success" },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <div className="relative bg-black">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-4 h-4" />
          </Button>

          {fullVideoUrl ? (
            <video
              src={fullVideoUrl}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[50vh] object-contain"
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              No video available
            </div>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* Title + ID */}
          {(title || uniqueVideoId) && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-semibold truncate">{title}</p>
                {uniqueVideoId && (
                  <CopyableVideoId videoId={uniqueVideoId} />
                )}
              </div>
              {fullVideoUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      toast({ title: "Downloading…" });
                      const res = await fetch(fullVideoUrl);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${uniqueVideoId || "video"}.mp4`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast({ title: "Download complete ✅" });
                    } catch {
                      toast({ title: "Download failed", variant: "destructive" });
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Save
                </Button>
              )}
            </div>
          )}

          {/* Metrics Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : metrics ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {metricCards.map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg border bg-secondary/30 p-3 text-center space-y-1"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                    <span className="text-[11px] text-muted-foreground font-medium">{m.label}</span>
                  </div>
                  <p className="text-base font-bold">{m.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No performance data yet
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
