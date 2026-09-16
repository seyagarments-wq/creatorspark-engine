import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/hooks/use-settings";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Percent, CalendarDays, TrendingUp } from "lucide-react";
import {
  bonusBandFor,
  bonusPay,
  bonusRate,
  currentPeriod,
  nextBand,
  type PayPeriod,
} from "../../../supabase/functions/_shared/payout-math";

const formatCurrency = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** UTC-midnight Date to `YYYY-MM-DD`, matching performance_data.metric_date. */
const toYmd = (d: Date) => d.toISOString().slice(0, 10);

const formatUtcDay = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function CreatorBonus() {
  const { profileId } = useAuth();
  const { settings } = useSettings();

  const [loading, setLoading] = useState(true);
  const [hasCycle, setHasCycle] = useState(false);
  const [period, setPeriod] = useState<PayPeriod | null>(null);
  const [revenue, setRevenue] = useState(0);

  const fetchBonus = useCallback(async () => {
    if (!profileId) return;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_video_at, payout_cycle_days")
        .eq("id", profileId)
        .single();

      if (!profile?.first_video_at) {
        setHasCycle(false);
        return;
      }

      const current = currentPeriod(new Date(profile.first_video_at), profile.payout_cycle_days || 28, new Date());
      setPeriod(current);
      setHasCycle(true);

      const { data: videos } = await supabase.from("videos").select("id").eq("creator_id", profileId);
      const videoIds = (videos || []).map((v) => v.id);
      if (videoIds.length === 0) {
        setRevenue(0);
        return;
      }

      // Attributed revenue: every performance row for any of their videos dated inside the cycle.
      let total = 0;
      for (let i = 0; i < videoIds.length; i += 100) {
        const { data } = await supabase
          .from("performance_data")
          .select("revenue")
          .in("video_id", videoIds.slice(i, i + 100))
          .gte("metric_date", toYmd(current.start))
          .lte("metric_date", toYmd(current.end));
        total += (data || []).reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
      }
      setRevenue(total);
    } catch (error) {
      console.error("Error loading bonus:", error);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    fetchBonus();
  }, [fetchBonus]);

  const bands = settings.pay_rates.bonus_bands;
  const rate = bonusRate(revenue, bands);
  const bonus = bonusPay(revenue, bands);
  const band = bonusBandFor(revenue, bands);
  const next = nextBand(revenue, bands);
  const progress = next
    ? Math.min(100, Math.max(0, ((revenue - band.min) / (next.band.min - band.min)) * 100))
    : 100;

  return (
    <CreatorLayout>
      <div className="max-w-xl mx-auto space-y-4 animate-fade-in">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Bonus</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A percentage of the revenue your videos bring in during each pay cycle. The rate applies to the whole amount.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hasCycle || !period ? (
          <Card className="border-border/50 shadow-soft">
            <CardContent className="p-5">
              <p className="text-sm font-medium">Your first bonus cycle starts when your first video is approved.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-border/50 shadow-soft">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-secondary shrink-0">
                  <CalendarDays className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">This cycle</p>
                  <p className="text-sm md:text-base font-semibold">
                    {formatUtcDay(period.start)} to {formatUtcDay(period.end)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-soft">
              <CardContent className="p-4 md:p-5">
                <div className="inline-flex p-1.5 rounded-lg bg-secondary mb-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl md:text-4xl font-semibold tabular-nums">{formatCurrency(revenue)}</p>
                <p className="text-xs text-muted-foreground">Attributed revenue this cycle</p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="border-border/50 shadow-soft">
                <CardContent className="p-3 md:p-4">
                  <div className="inline-flex p-1.5 rounded-lg bg-primary/10 mb-2">
                    <Percent className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-xl md:text-2xl font-semibold tabular-nums">{rate}%</p>
                  <p className="text-xs text-muted-foreground">Rate right now</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 shadow-soft">
                <CardContent className="p-3 md:p-4">
                  <div className="inline-flex p-1.5 rounded-lg bg-primary/10 mb-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-xl md:text-2xl font-semibold tabular-nums text-primary truncate">{formatCurrency(bonus)}</p>
                  <p className="text-xs text-muted-foreground">Bonus so far</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/50 shadow-soft">
              <CardContent className="p-4 space-y-3">
                {next ? (
                  <>
                    <p className="text-sm">
                      <span className="font-semibold tabular-nums">{formatCurrency(next.remaining)}</span> more in revenue this cycle
                      reaches <span className="font-semibold">{next.band.rate}%</span>.
                    </p>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                      <span>{formatCurrency(band.min)}</span>
                      <span>{formatCurrency(next.band.min)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-medium">You are at the top band.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </CreatorLayout>
  );
}
