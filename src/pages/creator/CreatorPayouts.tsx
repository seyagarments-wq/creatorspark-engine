import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { PayoutCelebration } from "@/components/PayoutCelebration";

import { playSoundEffect } from "@/hooks/use-sound-effects";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  TrendingUp,
  ExternalLink,
  Wallet,
  Loader2,
  CreditCard,
  CalendarDays,
  Target,
  Pencil,
  Check,
} from "lucide-react";
import { EarningsChart } from "@/components/creator/EarningsChart";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface PayoutData {
  id: string;
  amount: number;
  status: string;
  payout_type: string;
  created_at: string;
}

interface PayoutStats {
  totalEarnings: number;
  totalPayouts: number;
  pendingAmount: number;
}

interface DailyCommission {
  date: string;
  revenue: number;
  commission: number;
}

export default function CreatorPayouts() {
  const { profileId } = useAuth();
  const { toast } = useToast();
  const [timeFilter, setTimeFilter] = useState("30");
  const [payouts, setPayouts] = useState<PayoutData[]>([]);
  const [stats, setStats] = useState<PayoutStats>({
    totalEarnings: 0,
    totalPayouts: 0,
    pendingAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [openingStripe, setOpeningStripe] = useState(false);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [dailyCommissions, setDailyCommissions] = useState<DailyCommission[]>([]);
  const [commissionRate, setCommissionRate] = useState(10);
  const [showPayoutCelebration, setShowPayoutCelebration] = useState(false);

  // Earnings goal tracker
  const goalKey = profileId ? `earnings_goal_${profileId}` : null;
  const [monthlyGoal, setMonthlyGoal] = useState<number>(() => {
    if (!goalKey) return 0;
    try { return parseFloat(localStorage.getItem(goalKey) || "0") || 0; } catch { return 0; }
  });
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  useEffect(() => {
    if (profileId) {
      fetchPayouts();
      fetchDailyCommissions();
      checkStripeStatus();
    }
  }, [profileId, timeFilter]);

  async function checkStripeStatus() {
    try {
      const { data, error } = await supabase.functions.invoke("check-connect-status");
      if (error) throw error;
      setStripeConnected(data?.payouts_enabled || false);
    } catch (error) {
      console.error("Error checking Stripe status:", error);
      setStripeConnected(false);
    }
  }

  async function fetchDailyCommissions() {
    try {
      // Get profile for commission rate
      const { data: profile } = await supabase
        .from("profiles")
        .select("commission_percentage")
        .eq("id", profileId)
        .single();

      const rate = profile?.commission_percentage || 10;
      setCommissionRate(rate);

      // Get all approved videos for this creator
      const { data: videos } = await supabase
        .from("videos")
        .select("id")
        .eq("creator_id", profileId)
        .eq("status", "approved");

      if (!videos || videos.length === 0) {
        setDailyCommissions([]);
        return;
      }

      const videoIds = videos.map((v) => v.id);

      // Get the effective date of the last paid commission payout
      const { data: lastPayout } = await supabase
        .from("payouts")
        .select("paid_at, created_at")
        .eq("creator_id", profileId)
        .eq("payout_type", "commission")
        .eq("status", "paid")
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const effectivePaidAt = lastPayout?.paid_at ?? lastPayout?.created_at;
      const lastPayoutDate = effectivePaidAt
        ? new Date(effectivePaidAt).toISOString().split("T")[0]
        : null;

      // Fetch ALL unpaid performance data (cumulative since last payout)
      let query = supabase
        .from("performance_data")
        .select("metric_date, revenue, commission_rate_at_time")
        .in("video_id", videoIds);

      if (lastPayoutDate) {
        query = query.gt("metric_date", lastPayoutDate);
      }

      const { data: perfData } = await query;

      if (!perfData || perfData.length === 0) {
        setDailyCommissions([]);
        return;
      }

      // Aggregate by date using historical rates
      const byDate = new Map<string, { revenue: number; commission: number }>();
      perfData.forEach((row) => {
        const date = row.metric_date as string;
        const rev = parseFloat((row.revenue as any) || "0");
        const rowRate = row.commission_rate_at_time ?? rate;
        const existing = byDate.get(date) || { revenue: 0, commission: 0 };
        byDate.set(date, {
          revenue: existing.revenue + rev,
          commission: existing.commission + (rev * (rowRate / 100)),
        });
      });

      // Convert to array sorted desc
      const commissions: DailyCommission[] = Array.from(byDate.entries())
        .map(([date, data]) => ({
          date,
          revenue: data.revenue,
          commission: data.commission,
        }))
        .filter((c) => c.revenue > 0)
        .sort((a, b) => b.date.localeCompare(a.date));

      setDailyCommissions(commissions);
    } catch (error) {
      console.error("Error fetching daily commissions:", error);
    }
  }

  async function fetchPayouts() {
    try {
      let query = supabase
        .from("payouts")
        .select("*")
        .eq("creator_id", profileId)
        .order("created_at", { ascending: false });

      if (timeFilter !== "all") {
        const daysAgo = parseInt(timeFilter);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);
        query = query.gte("created_at", startDate.toISOString());
      }

      const { data } = await query;

      if (data) {
        setPayouts(data.map(p => ({
          ...p,
          amount: parseFloat(p.amount as any),
        })));

        // Calculate stats
        const paidPayouts = data.filter((p) => p.status === "paid");
        const pendingPayouts = data.filter((p) => p.status === "pending");

        setStats({
          totalEarnings: data.reduce((sum, p) => sum + parseFloat(p.amount as any), 0),
          totalPayouts: paidPayouts.length,
          pendingAmount: pendingPayouts.reduce((sum, p) => sum + parseFloat(p.amount as any), 0),
        });

        // 💸 Celebrate recent paid payouts (within 48h) — once per session per payout
        const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
        const recentPaid = paidPayouts.filter(
          (p) => new Date(p.created_at).getTime() > twoDaysAgo
        );
        let hasNew = false;
        recentPaid.forEach((p) => {
          const key = `payout_celebrated_${p.id}`;
          try {
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              hasNew = true;
            }
          } catch {/* ignore */}
        });
        if (hasNew) {
          playSoundEffect("cha-ching");
          setShowPayoutCelebration(true);
        }
      }
    } catch (error) {
      console.error("Error fetching payouts:", error);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getFilterLabel = () => {
    switch (timeFilter) {
      case "1": return "Today";
      case "7": return "7 Days";
      case "30": return "30 Days";
      case "90": return "90 Days";
      case "all": return "All Time";
      default: return "30 Days";
    }
  };

  async function handleOpenStripeDashboard() {
    setOpeningStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-express-dashboard");
      
      if (error) throw error;
      
      if (data?.url) {
        // If onboarding is required, show a toast to let them know
        if (data?.onboarding_required) {
          toast({
            title: "Complete Payout Setup",
            description: "Please complete your Stripe account setup to receive payouts.",
          });
        }
        window.open(data.url, "_blank");
      } else if (data?.error) {
        toast({
          title: "Cannot open Stripe",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error opening Stripe dashboard:", error);
      const errorMessage = error?.message || error?.context?.body?.error || "Failed to open Stripe dashboard. Please try again.";
      toast({
        title: "Stripe Dashboard",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setOpeningStripe(false);
    }
  }

  function saveGoal() {
    const val = parseFloat(goalInput);
    if (!isNaN(val) && val > 0 && goalKey) {
      try { localStorage.setItem(goalKey, String(val)); } catch {}
      setMonthlyGoal(val);
    }
    setEditingGoal(false);
  }

  const goalProgress = monthlyGoal > 0 ? Math.min((stats.totalEarnings / monthlyGoal) * 100, 100) : 0;

  return (
    <CreatorLayout>
      <PayoutCelebration
        show={showPayoutCelebration}
        onComplete={() => setShowPayoutCelebration(false)}
      />
      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold">Payouts</h1>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-32 h-9 text-sm bg-card border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Today</SelectItem>
              <SelectItem value="7">7 Days</SelectItem>
              <SelectItem value="30">30 Days</SelectItem>
              <SelectItem value="90">90 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Hero Stats Card */}
        <div className="bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground rounded-xl md:rounded-2xl p-4 md:p-6">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <span className="text-xs md:text-sm opacity-80">Total Earnings</span>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
            </div>
          </div>
          <p className="text-2xl md:text-4xl font-bold mb-3 md:mb-4">
            {formatCurrency(stats.totalEarnings)}
          </p>
          {/* Earnings goal progress inside hero */}
          {monthlyGoal > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1 text-xs opacity-80">
                <span>Goal: {formatCurrency(monthlyGoal)}</span>
                <span>{goalProgress.toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-700"
                  style={{ width: `${goalProgress}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex gap-3 md:gap-4 text-xs md:text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-white/60" />
              <span className="opacity-80">{stats.totalPayouts} paid</span>
            </div>
            {stats.pendingAmount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-warning" />
                <span className="opacity-80">{formatCurrency(stats.pendingAmount)} pending</span>
              </div>
            )}
          </div>
        </div>

        {/* Earnings Goal Tracker */}
        <div className="bg-card rounded-xl border p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Target className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Earnings Goal</p>
            {monthlyGoal > 0 ? (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(stats.totalEarnings)} of {formatCurrency(monthlyGoal)} ({goalProgress.toFixed(0)}%)
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Set a target to track your progress</p>
            )}
          </div>
          {editingGoal ? (
            <div className="flex items-center gap-2 shrink-0">
              <Input
                autoFocus
                type="number"
                placeholder="500"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveGoal(); if (e.key === "Escape") setEditingGoal(false); }}
                className="w-24 h-8 text-sm"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveGoal}>
                <Check className="w-4 h-4 text-success" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs gap-1 h-8 shrink-0"
              onClick={() => { setGoalInput(monthlyGoal > 0 ? String(monthlyGoal) : ""); setEditingGoal(true); }}
            >
              <Pencil className="w-3 h-3" />
              {monthlyGoal > 0 ? "Edit" : "Set Goal"}
            </Button>
          )}
        </div>

        {/* Chart - Desktop */}
        <div className="hidden md:block bg-card rounded-xl border p-5">
          <h3 className="font-semibold mb-4">{getFilterLabel()} Trend</h3>
          <EarningsChart payouts={payouts} timeFilter={timeFilter} />
        </div>

        {/* Commission Accrued */}
        {dailyCommissions.length > 0 && (
          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-sm md:text-base">Unpaid Commission</h2>
              </div>
              <Badge variant="secondary" className="text-[10px] md:text-xs">
                {commissionRate}% rate
              </Badge>
            </div>
            <p className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/30">
              Accumulates until you reach $50, then auto-pays on Sunday
            </p>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {dailyCommissions.slice(0, 14).map((day) => (
                <div
                  key={day.date}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-success/10 flex items-center justify-center text-success">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{formatDate(day.date)}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground">
                        {formatCurrency(day.revenue)} revenue
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold text-sm md:text-base text-success">
                    +{formatCurrency(day.commission)}
                  </p>
                </div>
              ))}
            </div>
            <div className="p-3 bg-muted/30 text-center border-t">
              <p className="text-xs text-muted-foreground mb-1">Total unpaid balance:</p>
              <p className={`font-bold ${dailyCommissions.reduce((s, d) => s + d.commission, 0) >= 50 ? 'text-success' : 'text-warning'}`}>
                {formatCurrency(dailyCommissions.reduce((s, d) => s + d.commission, 0))}
                {dailyCommissions.reduce((s, d) => s + d.commission, 0) < 50 && (
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    (${(50 - dailyCommissions.reduce((s, d) => s + d.commission, 0)).toFixed(2)} more to reach $50)
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Payout History */}
        <div>
          <div className="flex items-center justify-between mb-2 md:mb-3">
            <h2 className="font-semibold text-sm md:text-base">Recent Payouts</h2>
            {stripeConnected === false ? (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 md:h-8 text-[10px] md:text-xs gap-1"
                asChild
              >
                <Link to="/creator/profile">
                  <CreditCard className="w-3 h-3" />
                  <span className="hidden md:inline">Connect Payout Account</span>
                  <span className="md:hidden">Connect</span>
                </Link>
              </Button>
            ) : (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-primary h-7 md:h-8 text-[10px] md:text-xs"
                onClick={handleOpenStripeDashboard}
                disabled={openingStripe || stripeConnected === null}
              >
                {openingStripe ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <ExternalLink className="w-3 h-3 mr-1" />
                )}
                <span className="hidden md:inline">View in Stripe</span>
                <span className="md:hidden">Stripe</span>
              </Button>
            )}
          </div>

          {payouts.length === 0 ? (
            <div className="bg-card rounded-xl border p-6 md:p-8 text-center">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-muted mx-auto mb-2 md:mb-3 flex items-center justify-center">
                <Wallet className="w-5 h-5 md:w-6 md:h-6 text-muted-foreground" />
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">No payouts yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="bg-card rounded-lg md:rounded-xl border p-3 md:p-4 flex items-center justify-between hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${
                      payout.status === "paid" 
                        ? "bg-success/10 text-success" 
                        : "bg-warning/10 text-warning"
                    }`}>
                      <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm md:text-base">{formatCurrency(payout.amount)}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground capitalize">
                        {payout.payout_type} • {formatDate(payout.created_at)}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={`text-[10px] md:text-xs ${
                      payout.status === "paid"
                        ? "bg-success/10 text-success border-success/20"
                        : payout.status === "pending"
                        ? "bg-warning/10 text-warning border-warning/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                    variant="outline"
                  >
                    {payout.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </CreatorLayout>
  );
}
