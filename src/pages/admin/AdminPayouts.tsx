import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { batchFetchAll } from "@/lib/batch-fetch";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DollarSign, Search, CheckCircle, Clock, XCircle, Loader2, AlertCircle, Calculator, Award, Zap, Download, TrendingUp, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { exportToCSV, formatCurrencyForExport, formatDateForExport } from "@/lib/export";

interface PayoutWithCreator {
  id: string;
  creator_id: string;
  amount: number;
  payout_type: string;
  status: "pending" | "approved" | "paid" | "rejected";
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  stripe_transfer_id: string | null;
  creator: {
    full_name: string;
    email: string;
    stripe_onboarding_complete: boolean;
  } | null;
}

interface PayoutCalculationResult {
  creatorId: string;
  creatorName: string;
  approvedVideosCount: number;
  eligibleForGuarantee: boolean;
  guaranteeAmount: number;
  status: "pending_approval" | "skipped" | "already_exists";
  reason?: string;
}

interface CalculationSummary {
  month: string;
  summary: {
    creatorsProcessed: number;
    pendingApprovals: number;
    eligible: number;
    skipped: number;
    alreadyExists: number;
  };
  results: PayoutCalculationResult[];
}

interface BulkPayoutResult {
  payout_id: string;
  creator_name: string;
  amount: number;
  success: boolean;
  error?: string;
  transfer_id?: string;
}

interface BulkPayoutSummary {
  message: string;
  processed: number;
  successful: number;
  failed: number;
  total_amount?: number;
  results: BulkPayoutResult[];
}

interface AccruedCommission {
  creator_id: string;
  full_name: string;
  commission_percentage: number;
  week_revenue: number;
  accrued_commission: number;
  stripe_onboarding_complete: boolean;
  payout_method: string;
  paypal_email: string | null;
}

export default function AdminPayouts() {
  const [payouts, setPayouts] = useState<PayoutWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [stats, setStats] = useState({
    pending: 0,
    pendingAmount: 0,
    paidThisMonth: 0,
  });
  const [processingPayoutId, setProcessingPayoutId] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState<CalculationSummary | null>(null);
  const [showCalculationDialog, setShowCalculationDialog] = useState(false);
  const [processingBulk, setProcessingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkPayoutSummary | null>(null);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [accruedCommissions, setAccruedCommissions] = useState<AccruedCommission[]>([]);
  const [weekDates, setWeekDates] = useState<{ start: string; end: string } | null>(null);
  const [payingCreatorId, setPayingCreatorId] = useState<string | null>(null);
  const [manualPayCreator, setManualPayCreator] = useState<AccruedCommission | null>(null);
  const [markingManual, setMarkingManual] = useState(false);
  const [manualPayoutId, setManualPayoutId] = useState<string | null>(null);
  useEffect(() => {
    fetchPayouts();
    fetchAccruedCommissions();
  }, []);

  async function fetchPayouts() {
    try {
      const data = await batchFetchAll((from, to) =>
        supabase
          .from("payouts")
          .select(`
            *,
            creator:creator_id(full_name, email, stripe_onboarding_complete)
          `)
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      const payoutsData = (data || []).map((p: any) => ({
        ...p,
        creator: p.creator,
      }));

      setPayouts(payoutsData);

      // Calculate stats
      const pending = payoutsData.filter((p) => p.status === "pending");
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      const paidThisMonth = payoutsData
        .filter((p) => p.status === "paid" && p.paid_at && new Date(p.paid_at) >= thisMonth)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      setStats({
        pending: pending.length,
        pendingAmount: pending.reduce((sum, p) => sum + Number(p.amount), 0),
        paidThisMonth,
      });
    } catch (error) {
      console.error("Error fetching payouts:", error);
      toast.error("Failed to load payouts");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAccruedCommissions() {
    try {
      // Get payout threshold from settings
      const { data: thresholdSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "payout_threshold")
        .single();
      
      const minimumPayout = (thresholdSetting?.value as any)?.minimum ?? 50;

      // Get all creators with their Stripe info
      const { data: creators } = await supabase
        .from("profiles")
        .select("id, full_name, commission_percentage, stripe_account_id, stripe_onboarding_complete, user_id, payout_method, paypal_email");

      if (!creators) return;

      // Filter to only creators
      const creatorProfiles = [];
      for (const profile of creators) {
        const { data: roleCheck } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.user_id)
          .eq("role", "creator")
          .single();
        
        if (roleCheck) {
          creatorProfiles.push(profile);
        }
      }

      const accrued: AccruedCommission[] = [];

      for (const creator of creatorProfiles) {
        // Get approved videos
        const { data: videos } = await supabase
          .from("videos")
          .select("id")
          .eq("creator_id", creator.id)
          .eq("status", "approved");

        if (!videos || videos.length === 0) continue;

        const videoIds = videos.map(v => v.id);

        // Get the effective date of the last paid commission payout for this creator
        const { data: lastPayout } = await supabase
          .from("payouts")
          .select("paid_at, created_at")
          .eq("creator_id", creator.id)
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

        // Get ALL unpaid performance data (cumulative since last payout)
        const perfData = await batchFetchAll((from, to) => {
          let q = supabase
            .from("performance_data")
            .select("revenue, commission_rate_at_time")
            .in("video_id", videoIds);
          if (lastPayoutDate) {
            q = q.gt("metric_date", lastPayoutDate);
          }
          return q.range(from, to);
        });

        // Calculate commission using stored daily rates
        const defaultRate = creator.commission_percentage || 10;
        let totalRevenue = 0;
        let totalCommission = 0;
        
        (perfData || []).forEach((row) => {
          const rev = parseFloat((row.revenue as any) || "0");
          const rate = row.commission_rate_at_time ?? defaultRate;
          totalRevenue += rev;
          totalCommission += rev * (rate / 100);
        });

        const roundedCommission = Math.round(totalCommission * 100) / 100;

        // Show all creators with accrued commissions
        if (roundedCommission > 0) {
          accrued.push({
            creator_id: creator.id,
            full_name: creator.full_name,
            commission_percentage: defaultRate,
            week_revenue: totalRevenue,
            accrued_commission: roundedCommission,
            stripe_onboarding_complete: creator.stripe_onboarding_complete || false,
            payout_method: (creator as any).payout_method || "stripe",
            paypal_email: (creator as any).paypal_email || null,
          });
        }
      }

      setAccruedCommissions(accrued.sort((a, b) => b.accrued_commission - a.accrued_commission));
      
      // Set week dates to show "Cumulative" instead of a specific week
      setWeekDates({
        start: "Cumulative",
        end: "(since last payout)",
      });
    } catch (error) {
      console.error("Error fetching accrued commissions:", error);
    }
  }

  async function updatePayoutStatus(id: string, status: string) {
    try {
      const { error } = await supabase.from("payouts").update({ status: status as any }).eq("id", id);

      if (error) throw error;
      toast.success(`Payout ${status}`);
      fetchPayouts();
    } catch (error) {
      console.error("Error updating payout:", error);
      toast.error("Failed to update payout");
    }
  }

  async function processStripePayout(payoutId: string) {
    const targetPayout = payouts.find(p => p.id === payoutId);
    
    if (targetPayout && !targetPayout.creator?.stripe_onboarding_complete) {
      toast.error("This creator hasn't connected Stripe yet.");
      return;
    }

    // Optimistic: update UI instantly
    setPayouts(prev => prev.map(p => p.id === payoutId ? { ...p, status: "paid" as const, paid_at: new Date().toISOString() } : p));
    toast.success(`Processing payout for ${targetPayout?.creator?.full_name}...`);

    // Background: call edge function
    supabase.functions.invoke("process-payout", {
      body: { payout_id: payoutId },
    }).then(({ data, error }) => {
      if (error || data?.error) {
        // Revert on failure
        setPayouts(prev => prev.map(p => p.id === payoutId ? { ...p, status: "pending" as const, paid_at: null } : p));
        toast.error(data?.error || error?.message || "Payout failed — reverted");
      } else {
        toast.success(`Payout confirmed! Transfer: ${data.transfer_id}`);
      }
    });
  }

  async function calculateMonthlyPayouts() {
    setCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke("calculate-monthly-payouts", {
        body: {},
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCalculationResult(data);
      setShowCalculationDialog(true);
      toast.success(`Calculated payouts for ${data.summary.creatorsProcessed} creators`);
      fetchPayouts();
    } catch (error: any) {
      console.error("Error calculating payouts:", error);
      toast.error(error.message || "Failed to calculate monthly payouts");
    } finally {
      setCalculating(false);
    }
  }

  async function processBulkPayouts() {
    // Optimistic: mark all pending as paid instantly
    const pendingCount = payouts.filter(p => p.status === "pending").length;
    const originalPayouts = [...payouts];
    setPayouts(prev => prev.map(p => p.status === "pending" ? { ...p, status: "paid" as const, paid_at: new Date().toISOString() } : p));
    toast.success(`Processing ${pendingCount} payouts in background...`);

    // Background: call edge function (now handles ALL pending including commissions)
    supabase.functions.invoke("process-bulk-payouts", {
      body: { include_commissions: true },
    }).then(({ data, error }) => {
      if (error || data?.error) {
        setPayouts(originalPayouts);
        toast.error(data?.error || error?.message || "Bulk processing failed — reverted");
      } else {
        setBulkResult(data);
        setShowBulkDialog(true);
        if (data.successful > 0) {
          toast.success(`✅ Paid ${data.successful} payouts totaling $${data.total_amount?.toFixed(2) || 0}`);
        } else if (data.processed === 0) {
          toast.info("No pending payouts to process");
          setPayouts(originalPayouts);
        } else {
          toast.warning(`${data.failed} payouts failed`);
        }
        fetchPayouts();
      }
    });
  }

  async function payAccruedCommission(creatorId: string, creatorName: string, payoutMethod: string) {
    // Optimistic: remove from accrued list instantly
    const creatorEntry = accruedCommissions.find(c => c.creator_id === creatorId);
    setAccruedCommissions(prev => prev.filter(c => c.creator_id !== creatorId));
    
    const functionName = payoutMethod === "paypal" ? "pay-paypal-commission" : "pay-accrued-commission";
    const methodLabel = payoutMethod === "paypal" ? "PayPal" : "Stripe";
    toast.success(`Processing ${methodLabel} commission for ${creatorName}...`);

    // Background: call appropriate edge function
    supabase.functions.invoke(functionName, {
      body: { creator_id: creatorId },
    }).then(({ data, error }) => {
      if (error || data?.error) {
        // Revert on failure
        if (creatorEntry) {
          setAccruedCommissions(prev => [...prev, creatorEntry].sort((a, b) => b.accrued_commission - a.accrued_commission));
        }
        toast.error(data?.error || error?.message || `${methodLabel} commission payout failed — reverted`);
      } else {
        toast.success(`Paid $${data.amount?.toFixed(2)} to ${creatorName} via ${methodLabel}`);
        fetchPayouts(); // refresh payout history in background
      }
    });
  }

  async function markManualPayment(creator: AccruedCommission) {
    setMarkingManual(true);
    try {
      // Duplicate-protection: re-check if a paid commission was just recorded
      const { data: recentPaid } = await supabase
        .from("payouts")
        .select("id, paid_at, created_at")
        .eq("creator_id", creator.creator_id)
        .eq("payout_type", "commission")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (recentPaid) {
        const boundary = new Date(recentPaid.paid_at ?? recentPaid.created_at);
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        if (boundary > twoMinutesAgo) {
          toast.error("A payment was just recorded for this creator. Please refresh and verify before adding another.");
          setManualPayCreator(null);
          setMarkingManual(false);
          fetchAccruedCommissions();
          return;
        }
      }

      const { error } = await supabase.from("payouts").insert({
        creator_id: creator.creator_id,
        amount: creator.accrued_commission,
        payout_type: "commission",
        status: "paid" as any,
        paid_at: new Date().toISOString(),
        notes: "Manual payment - paid outside Stripe",
      });

      if (error) throw error;

      toast.success(`Marked $${creator.accrued_commission.toFixed(2)} as manually paid for ${creator.full_name}`);
      setManualPayCreator(null);
      fetchPayouts();
      fetchAccruedCommissions();

      // Send payout notification email to creator
      try {
        const { data: creatorProfile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", creator.creator_id)
          .single();

        if (creatorProfile?.user_id) {
          supabase.functions.invoke("send-notification-email", {
            body: {
              user_id: creatorProfile.user_id,
              title: "SURVEY SAYS... you're getting paid! 💰",
              message: `The board has spoken — and your bank account is about to feel the love.\n\nYou've been matched with a payout of <strong>$${creator.accrued_commission.toFixed(2)}</strong>.\n\nSince you're outside the US, this one's coming to you via PayPal. Just drop a message to one of the admins in your DMs so they can get it processed for you.\n\nThat's not a guess. That's real money, earned by your content doing the work while you sleep.\n\nKeep playing. Keep posting. The show rewards those who stay in the game. 🎯`,
              notification_type: "payout",
              link: "/creator/payouts",
              button_text: "View Your Payout",
            },
          });
        }
      } catch (emailErr) {
        console.error("Failed to send manual payout email:", emailErr);
      }
    } catch (error: any) {
      console.error("Error marking manual payment:", error);
      toast.error(error.message || "Failed to record manual payment");
    } finally {
      setMarkingManual(false);
    }
  }

  // Count payouts eligible for bulk processing
  const eligibleForBulkProcess = payouts.filter(
    (p) => p.status === "pending" && p.creator?.stripe_onboarding_complete
  ).length;

  const filteredPayouts = payouts.filter((payout) => {
    const matchesSearch =
      payout.creator?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payout.creator?.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || payout.status === statusFilter;
    const matchesType = typeFilter === "all" || payout.payout_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
      pending: { variant: "secondary", icon: Clock },
      approved: { variant: "outline", icon: CheckCircle },
      paid: { variant: "default", icon: CheckCircle },
      rejected: { variant: "destructive", icon: XCircle },
    };
    const { variant, icon: Icon } = config[status] || config.pending;
    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  const getTypeBadge = (type: string) => {
    const isAutomatic = type === "commission";
    const typeLabels: Record<string, string> = {
      commission: "Commission",
      bounty: "Bounty",
      challenge: "Challenge",
      guarantee: "Guarantee",
    };
    return (
      <div className="flex items-center gap-1.5">
        <span className="capitalize">{typeLabels[type] || type}</span>
        {isAutomatic && (
          <span className="text-[10px] px-1.5 py-0.5 bg-success/10 text-success rounded-full font-medium">
            Auto
          </span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-96 bg-muted/50 rounded-xl animate-pulse" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Payouts</h1>
              <p className="text-sm text-muted-foreground">Manage creator payments</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={() => {
                const exportData = payouts.map((p) => ({
                  creator: p.creator?.full_name || "Unknown",
                  email: p.creator?.email || "",
                  type: p.payout_type,
                  amount: formatCurrencyForExport(Number(p.amount)),
                  status: p.status,
                  date: formatDateForExport(p.created_at),
                  paid_date: p.paid_at ? formatDateForExport(p.paid_at) : "",
                }));
                exportToCSV(exportData, "payouts_export", [
                  { key: "creator", header: "Creator" },
                  { key: "email", header: "Email" },
                  { key: "type", header: "Type" },
                  { key: "amount", header: "Amount" },
                  { key: "status", header: "Status" },
                  { key: "date", header: "Created Date" },
                  { key: "paid_date", header: "Paid Date" },
                ]);
                toast.success("Payout report downloaded as CSV");
              }}
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Mobile Action Buttons */}
          <div className="flex gap-2 md:hidden">
            <Button 
              onClick={calculateMonthlyPayouts} 
              disabled={calculating} 
              variant="outline"
              size="sm"
              className="flex-1"
            >
              {calculating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Calculator className="w-4 h-4" />
              )}
              <span className="ml-1.5">Calculate</span>
            </Button>
            <Button 
              onClick={processBulkPayouts} 
              disabled={processingBulk || stats.pending === 0}
              size="sm"
              className="flex-1"
            >
              {processingBulk ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              <span className="ml-1.5">Process ({stats.pending})</span>
            </Button>
          </div>

          {/* Desktop Action Buttons */}
          <div className="hidden md:flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const exportData = payouts.map((p) => ({
                  creator: p.creator?.full_name || "Unknown",
                  email: p.creator?.email || "",
                  type: p.payout_type,
                  amount: formatCurrencyForExport(Number(p.amount)),
                  status: p.status,
                  date: formatDateForExport(p.created_at),
                  paid_date: p.paid_at ? formatDateForExport(p.paid_at) : "",
                }));
                exportToCSV(exportData, "payouts_export", [
                  { key: "creator", header: "Creator" },
                  { key: "email", header: "Email" },
                  { key: "type", header: "Type" },
                  { key: "amount", header: "Amount" },
                  { key: "status", header: "Status" },
                  { key: "date", header: "Created Date" },
                  { key: "paid_date", header: "Paid Date" },
                ]);
                toast.success("Payout report downloaded as CSV");
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={calculateMonthlyPayouts} disabled={calculating} variant="outline">
              {calculating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Calculator className="w-4 h-4 mr-2" />
              )}
              Calculate Payouts
            </Button>
            <Button 
              onClick={processBulkPayouts} 
              disabled={processingBulk || stats.pending === 0}
            >
              {processingBulk ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Process All Pending ({stats.pending})
            </Button>
          </div>
        </div>

        {/* Payout Structure Info */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-success mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-success">Monthly Commissions</p>
                  <p className="text-muted-foreground">
                    Paid on the 1st of each month. <strong>Eligibility requires</strong> hitting Tue/Thu/Sat upload days with 4+ approved videos. Miss more than 3 days → commission forfeited (no rollover).
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-warning mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-warning">Requires Approval</p>
                  <p className="text-muted-foreground">
                    <strong>Bounties & Challenges</strong> — Created as pending when qualified. Use "Process All Pending" to pay.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Award className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Monthly Guarantees</p>
                  <p className="text-muted-foreground">
                    <strong>$500 guaranteed</strong> for 35+ approved videos/month. Calculated on the 1st, then bulk processed.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 rounded-lg bg-warning/10">
                  <Clock className="w-4 h-4 md:w-5 md:h-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Pending</p>
                  <p className="text-lg md:text-2xl font-bold">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 rounded-lg bg-primary/10">
                  <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Pending $</p>
                  <p className="text-lg md:text-2xl font-bold">{formatCurrency(stats.pendingAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 rounded-lg bg-success/10">
                  <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Paid (Month)</p>
                  <p className="text-lg md:text-2xl font-bold">{formatCurrency(stats.paidThisMonth)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 rounded-lg bg-success/10">
                  <Zap className="w-4 h-4 md:w-5 md:h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Auto-Paid</p>
                  <p className="text-lg md:text-2xl font-bold">
                    {payouts.filter(p => p.status === "paid" && p.payout_type === "commission").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Accrued Commissions */}
        {accruedCommissions.length > 0 && (
          <Card className="border-dashed border-primary/50 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base">Accrued Commissions</CardTitle>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {accruedCommissions.filter(c => c.accrued_commission >= 50).length} ready to pay
                </Badge>
              </div>
              <CardDescription>
                Cumulative unpaid commissions {weekDates?.end ? weekDates.end : ""}.
                Balances ≥ $50 will auto-pay on Sunday at 6:00 AM UTC.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile view */}
              <div className="md:hidden space-y-3">
                {accruedCommissions.map((creator) => (
                  <div key={creator.creator_id} className="border rounded-lg p-3 bg-background">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">{creator.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {creator.commission_percentage}% commission rate
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${creator.accrued_commission >= 50 ? 'text-success' : 'text-warning'}`}>
                          {formatCurrency(creator.accrued_commission)}
                        </p>
                        {creator.accrued_commission >= 50 && (creator.stripe_onboarding_complete || creator.payout_method === "paypal") ? (
                          <Button 
                            size="sm" 
                            className="h-6 text-[10px] mt-1 px-2"
                            onClick={() => payAccruedCommission(creator.creator_id, creator.full_name, creator.payout_method)}
                            disabled={payingCreatorId === creator.creator_id}
                          >
                            {payingCreatorId === creator.creator_id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <DollarSign className="w-3 h-3" />
                                Pay Now
                              </>
                            )}
                          </Button>
                        ) : null}
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-6 text-[10px] mt-1 px-2"
                          onClick={() => setManualPayCreator(creator)}
                        >
                          <HandCoins className="w-3 h-3" />
                          Manual
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Revenue: {formatCurrency(creator.week_revenue)}
                      </span>
                      {!creator.stripe_onboarding_complete && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <AlertCircle className="w-3 h-3" />
                          No Stripe
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${creator.accrued_commission >= 50 ? 'bg-success' : 'bg-warning'}`}
                          style={{ width: `${Math.min((creator.accrued_commission / 50) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Desktop view */}
              <div className="hidden md:block rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creator</TableHead>
                      <TableHead>Week Revenue</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Accrued</TableHead>
                      <TableHead>Progress to $50</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accruedCommissions.map((creator) => (
                      <TableRow key={creator.creator_id}>
                        <TableCell className="font-medium">{creator.full_name}</TableCell>
                        <TableCell>{formatCurrency(creator.week_revenue)}</TableCell>
                        <TableCell>{creator.commission_percentage}%</TableCell>
                        <TableCell className={`font-bold ${creator.accrued_commission >= 50 ? 'text-success' : 'text-warning'}`}>
                          {formatCurrency(creator.accrued_commission)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-32">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${creator.accrued_commission >= 50 ? 'bg-success' : 'bg-warning'}`}
                                style={{ width: `${Math.min((creator.accrued_commission / 50) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-10">
                              {creator.accrued_commission >= 50 ? '✓' : `${Math.round((creator.accrued_commission / 50) * 100)}%`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {creator.payout_method === "paypal" && creator.paypal_email ? (
                            <Badge className="gap-1 bg-blue-500 text-white">
                              <DollarSign className="w-3 h-3" />
                              PayPal
                            </Badge>
                          ) : creator.accrued_commission >= 50 && creator.stripe_onboarding_complete ? (
                            <Badge className="gap-1 bg-success text-success-foreground">
                              <Zap className="w-3 h-3" />
                              Ready
                            </Badge>
                          ) : creator.stripe_onboarding_complete ? (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <CheckCircle className="w-3 h-3" />
                              Stripe OK
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                              <AlertCircle className="w-3 h-3" />
                              No Stripe
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {creator.accrued_commission >= 50 && (creator.stripe_onboarding_complete || creator.payout_method === "paypal") ? (
                              <Button 
                                size="sm" 
                                onClick={() => payAccruedCommission(creator.creator_id, creator.full_name, creator.payout_method)}
                                disabled={payingCreatorId === creator.creator_id}
                              >
                                {payingCreatorId === creator.creator_id ? (
                                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                ) : (
                                  <DollarSign className="w-4 h-4 mr-1" />
                                )}
                                Pay Now
                              </Button>
                            ) : null}
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setManualPayCreator(creator)}
                            >
                              <HandCoins className="w-4 h-4 mr-1" />
                              Mark Manual
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <p className="text-xs text-muted-foreground mt-3">
                💡 Commissions are automatically paid every Sunday at 6:00 AM UTC for balances ≥ $50
              </p>
            </CardContent>
          </Card>
        )}

        {/* Monthly Payout Chart */}
        {(() => {
          const now = new Date();
          const monthlyData: { month: string; total: number }[] = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const total = payouts
              .filter((p) => p.status === "paid" && p.paid_at)
              .filter((p) => {
                const pd = new Date(p.paid_at!);
                return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
              })
              .reduce((sum, p) => sum + Number(p.amount), 0);
            monthlyData.push({ month: d.toLocaleString("en-US", { month: "short" }), total });
          }
          const maxTotal = Math.max(...monthlyData.map((m) => m.total), 1);

          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Monthly Payouts</CardTitle>
                <CardDescription>Paid amounts over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-40">
                  {monthlyData.map((m) => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-medium text-foreground">
                        {m.total > 0 ? formatCurrency(m.total) : "—"}
                      </span>
                      <div
                        className="w-full rounded-t-md bg-primary/80 transition-all min-h-[4px]"
                        style={{ height: `${Math.max((m.total / maxTotal) * 100, 3)}%` }}
                      />
                      <span className="text-[10px] text-muted-foreground">{m.month}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>All Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by creator..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="bounty">Bounty</SelectItem>
                  <SelectItem value="challenge">Challenge</SelectItem>
                  <SelectItem value="guarantee">Guarantee</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredPayouts.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No payouts found</p>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {filteredPayouts.map((payout) => (
                    <div key={payout.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{payout.creator?.full_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{payout.creator?.email}</p>
                        </div>
                        <p className="font-bold">{formatCurrency(Number(payout.amount))}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getTypeBadge(payout.payout_type)}
                        </div>
                        {getStatusBadge(payout.status)}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(payout.created_at), "MMM d, yyyy")}
                        </span>
                        {payout.status === "pending" && (
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs" onClick={() => updatePayoutStatus(payout.id, "approved")}>
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updatePayoutStatus(payout.id, "rejected")}>
                              Reject
                            </Button>
                          </div>
                        )}
                        {payout.status === "approved" && (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex gap-1">
                              <Button 
                                size="sm" 
                                className="h-7 text-xs"
                                onClick={() => processStripePayout(payout.id)}
                                disabled={processingPayoutId === payout.id}
                              >
                                {processingPayoutId === payout.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <DollarSign className="w-3 h-3 mr-1" />
                                )}
                                {payout.creator?.stripe_onboarding_complete ? "Pay" : "Retry"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setManualPayoutId(payout.id)}
                              >
                                <HandCoins className="w-3 h-3 mr-1" />
                                Manual
                              </Button>
                            </div>
                            {!payout.creator?.stripe_onboarding_complete && (
                              <span className="text-[10px] text-destructive">No Stripe yet</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Creator</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayouts.map((payout) => (
                        <TableRow key={payout.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{payout.creator?.full_name || "Unknown"}</p>
                              <p className="text-sm text-muted-foreground">{payout.creator?.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>{getTypeBadge(payout.payout_type)}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(Number(payout.amount))}</TableCell>
                          <TableCell>{getStatusBadge(payout.status)}</TableCell>
                          <TableCell>{format(new Date(payout.created_at), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-right">
                            {payout.status === "pending" && (
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" onClick={() => updatePayoutStatus(payout.id, "approved")}>
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updatePayoutStatus(payout.id, "rejected")}
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                            {payout.status === "approved" && (
                              <div className="flex items-center gap-2 justify-end">
                                <Button 
                                  size="sm" 
                                  onClick={() => processStripePayout(payout.id)}
                                  disabled={processingPayoutId === payout.id}
                                >
                                  {processingPayoutId === payout.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                  ) : (
                                    <DollarSign className="w-4 h-4 mr-1" />
                                  )}
                                  {payout.creator?.stripe_onboarding_complete ? "Pay via Stripe" : "Retry Payment"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setManualPayoutId(payout.id)}
                                >
                                  <HandCoins className="w-4 h-4 mr-1" />
                                  Mark Manual
                                </Button>
                                {!payout.creator?.stripe_onboarding_complete && (
                                  <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                                    <AlertCircle className="w-3 h-3" />
                                    No Stripe
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calculation Results Dialog */}
      <Dialog open={showCalculationDialog} onOpenChange={setShowCalculationDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Monthly Payout Calculation</DialogTitle>
            <DialogDescription>
              {calculationResult?.month} - Results for all creators
            </DialogDescription>
          </DialogHeader>
          
          {calculationResult && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{calculationResult.summary.creatorsProcessed}</p>
                  <p className="text-xs text-muted-foreground">Creators</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{calculationResult.summary.eligible}</p>
                  <p className="text-xs text-muted-foreground">$500 Eligible</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{calculationResult.summary.pendingApprovals}</p>
                  <p className="text-xs text-muted-foreground">Pending Approval</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{calculationResult.summary.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
              </div>

              {/* Creator Breakdown */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creator</TableHead>
                      <TableHead className="text-center">Videos</TableHead>
                      <TableHead className="text-right">Guarantee</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(calculationResult.results || []).map((p) => (
                      <TableRow key={p.creatorId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {p.creatorName}
                            {p.eligibleForGuarantee && (
                              <Badge variant="secondary" className="text-xs">
                                <Award className="w-3 h-3 mr-1" />
                                Eligible
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={p.approvedVideosCount >= 35 ? "text-primary font-medium" : ""}>
                            {p.approvedVideosCount}
                          </span>
                          <span className="text-muted-foreground">/35</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {(p.guaranteeAmount ?? 0) > 0 ? formatCurrency(p.guaranteeAmount) : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {p.status === "pending_approval" ? (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="w-3 h-3" />
                              Pending
                            </Badge>
                          ) : p.status === "already_exists" ? (
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Exists
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <XCircle className="w-3 h-3" />
                              Skipped
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                          {p.reason || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button onClick={() => setShowCalculationDialog(false)} className="w-full">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Payout Results Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Payout Results</DialogTitle>
            <DialogDescription>
              {bulkResult?.message}
            </DialogDescription>
          </DialogHeader>
          
          {bulkResult && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{bulkResult.processed}</p>
                  <p className="text-xs text-muted-foreground">Processed</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{bulkResult.successful}</p>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </div>
                <div className={`rounded-lg p-3 text-center ${bulkResult.failed > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                  <p className={`text-2xl font-bold ${bulkResult.failed > 0 ? 'text-destructive' : ''}`}>
                    {bulkResult.failed}
                  </p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>

              {bulkResult.total_amount && bulkResult.total_amount > 0 && (
                <div className="bg-primary/10 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-primary">
                    {formatCurrency(bulkResult.total_amount)}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Transferred</p>
                </div>
              )}

              {/* Results Breakdown */}
              {bulkResult.results.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Creator</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bulkResult.results.map((r) => (
                        <TableRow key={r.payout_id}>
                          <TableCell>{r.creator_name}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(r.amount)}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.success ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Paid
                              </Badge>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <Badge variant="destructive" className="gap-1">
                                  <XCircle className="w-3 h-3" />
                                  Failed
                                </Badge>
                                <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                                  {r.error}
                                </span>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <Button onClick={() => setShowBulkDialog(false)} className="w-full">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Manual Payment Confirmation Dialog */}
      <AlertDialog open={!!manualPayCreator} onOpenChange={(open) => !open && setManualPayCreator(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Manually Paid</AlertDialogTitle>
            <AlertDialogDescription>
              This will record a payment of <strong>{manualPayCreator ? `$${manualPayCreator.accrued_commission.toFixed(2)}` : ""}</strong> for <strong>{manualPayCreator?.full_name}</strong> as paid outside of Stripe (e.g., Venmo, wire transfer, cash).
              <br /><br />
              Future commission calculations will only count revenue earned <strong>after this point</strong>, preventing double-counting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markingManual}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={markingManual}
              onClick={(e) => {
                e.preventDefault();
                if (manualPayCreator) markManualPayment(manualPayCreator);
              }}
            >
              {markingManual ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <HandCoins className="w-4 h-4 mr-2" />
              )}
              Confirm Manual Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Mark History Payout as Manual Dialog */}
      <AlertDialog open={!!manualPayoutId} onOpenChange={(open) => !open && setManualPayoutId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Payout as Manually Paid</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const p = payouts.find(p => p.id === manualPayoutId);
                return p ? (
                  <>
                    This will mark the <strong>{formatCurrency(Number(p.amount))}</strong> {p.payout_type} payout for <strong>{p.creator?.full_name}</strong> as paid outside of Stripe.
                  </>
                ) : null;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markingManual}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={markingManual}
              onClick={async (e) => {
                e.preventDefault();
                if (!manualPayoutId) return;
                setMarkingManual(true);
                try {
                  const { error } = await supabase
                    .from("payouts")
                    .update({
                      status: "paid" as any,
                      paid_at: new Date().toISOString(),
                      notes: "Manual payment - paid outside Stripe",
                    })
                    .eq("id", manualPayoutId);
                  if (error) throw error;
                  toast.success("Payout marked as manually paid");
                  setManualPayoutId(null);
                  fetchPayouts();
                } catch (err: any) {
                  toast.error(err.message || "Failed to update payout");
                } finally {
                  setMarkingManual(false);
                }
              }}
            >
              {markingManual ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <HandCoins className="w-4 h-4 mr-2" />
              )}
              Confirm Manual Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
