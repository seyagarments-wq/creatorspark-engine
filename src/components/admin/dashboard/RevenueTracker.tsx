import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { batchFetchAll } from "@/lib/batch-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, ArrowUpRight, ArrowDownRight, Banknote } from "lucide-react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

interface FinancialData {
  totalRevenue: number;
  monthRevenue: number;
  totalCommissionsOwed: number;
  totalPaid: number;
  pendingPayouts: number;
  pendingPayoutCount: number;
}

export function RevenueTracker() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  const debouncedFetch = useDebouncedCallback(() => fetchFinancials(), 500);

  useEffect(() => {
    fetchFinancials();

    const channel = supabase
      .channel("revenue-tracker")
      .on("postgres_changes", { event: "*", schema: "public", table: "performance_data" }, () => debouncedFetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "payouts" }, () => debouncedFetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchFinancials() {
    try {
      const [rpcRes, payoutsData] = await Promise.all([
        supabase.rpc("get_revenue_summary"),
        batchFetchAll((from, to) =>
          supabase.from("payouts").select("amount, status").range(from, to)
        ),
      ]);

      const summary = rpcRes.data?.[0] ?? { total_revenue: 0, total_commissions: 0, month_revenue: 0 };
      const totalRevenue = Number(summary.total_revenue) || 0;
      const totalCommissions = Number(summary.total_commissions) || 0;
      const monthRevenue = Number(summary.month_revenue) || 0;

      let totalPaid = 0, pendingPayouts = 0, pendingPayoutCount = 0;
      (payoutsData || []).forEach((p: any) => {
        const amt = Number(p.amount) || 0;
        if (p.status === "paid") totalPaid += amt;
        if (p.status === "pending") {
          pendingPayouts += amt;
          pendingPayoutCount++;
        }
      });

      setData({
        totalRevenue,
        monthRevenue,
        totalCommissionsOwed: Math.max(0, totalCommissions - totalPaid),
        totalPaid,
        pendingPayouts,
        pendingPayoutCount,
      });

    } catch (err) {
      console.error("Error fetching financials:", err);
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  if (loading) {
    return (
      <Card>
        <CardHeader className="p-3 md:p-6 pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Revenue & Commissions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="p-3 md:p-6 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Revenue & Commissions
          </CardTitle>
          <Badge variant="outline" className="text-[10px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 md:space-y-3 p-3 md:p-6">
        {/* Revenue highlight */}
        <div className="p-2.5 md:p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-500" />
            <span className="text-[10px] md:text-xs text-muted-foreground">Total Revenue (All Time)</span>
          </div>
          <p className="text-xl md:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(data.totalRevenue)}</p>
          {data.monthRevenue < data.totalRevenue && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(data.monthRevenue)} last 30d</p>
          )}
        </div>

        {/* Financial breakdown */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Banknote className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground">Paid Out</span>
            </div>
            <p className="text-sm font-bold">{fmt(data.totalPaid)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] text-muted-foreground">Owed</span>
            </div>
            <p className="text-sm font-bold">{fmt(data.totalCommissionsOwed)}</p>
          </div>
        </div>

        {data.pendingPayoutCount > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <ArrowDownRight className="w-4 h-4 text-amber-500" />
            <span className="text-xs">
              <strong>{data.pendingPayoutCount}</strong> pending payout{data.pendingPayoutCount !== 1 ? "s" : ""} ({fmt(data.pendingPayouts)})
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
