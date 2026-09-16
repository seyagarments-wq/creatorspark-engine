import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { functionErrorMessage } from "@/lib/function-error";
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
import {
  DollarSign,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  AlertCircle,
  Download,
  HandCoins,
  Eye,
  CalendarClock,
  Zap,
  Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { exportToCSV, formatCurrencyForExport, formatDateForExport } from "@/lib/export";

type PayoutStatus = "pending" | "approved" | "paid" | "rejected";

interface PayoutCreator {
  full_name: string;
  email: string;
  stripe_onboarding_complete: boolean | null;
  payout_method: string | null;
  paypal_email: string | null;
}

interface PayoutWithCreator {
  id: string;
  creator_id: string;
  amount: number;
  payout_type: string;
  status: PayoutStatus;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  stripe_transfer_id: string | null;
  paypal_batch_id: string | null;
  period_start: string | null;
  period_end: string | null;
  video_count: number | null;
  creator: PayoutCreator | null;
}

/** One row of `payout-cycle` output (mirrors open_due_payouts in SQL). */
interface CycleRow {
  creator_id: string;
  creator_name: string;
  period_start: string;
  period_end: string;
  video_count: number;
  video_pay: number;
  attributed_revenue: number;
  bonus_rate: number;
  bonus_pay: number;
  action: "would open" | "opened" | "nothing to pay" | string;
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

interface DueGroup {
  creatorId: string;
  creator: PayoutCreator | null;
  rows: PayoutWithCreator[];
  total: number;
}

interface Rail {
  label: "Stripe" | "PayPal";
  ready: boolean;
  detail: string;
}

const TYPE_LABELS: Record<string, string> = {
  video_pay: "Video pay",
  bonus: "Bonus",
  bounty: "Bounty",
};

const typeLabel = (type: string) => TYPE_LABELS[type] ?? type;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

const sumAmounts = (rows: PayoutWithCreator[]) => rows.reduce((sum, p) => sum + Number(p.amount), 0);

const isUnpaid = (p: PayoutWithCreator) => p.status === "pending" || p.status === "approved";

function formatPeriod(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const s = parseISO(start);
  const e = parseISO(end);
  const startPattern = s.getFullYear() === e.getFullYear() ? "MMM d" : "MMM d, yyyy";
  return `${format(s, startPattern)} to ${format(e, "MMM d, yyyy")}`;
}

function railFor(creator: PayoutCreator | null): Rail {
  if (creator?.payout_method === "paypal") {
    return {
      label: "PayPal",
      ready: !!creator.paypal_email,
      detail: creator.paypal_email || "No PayPal email on file",
    };
  }
  return {
    label: "Stripe",
    ready: !!creator?.stripe_onboarding_complete,
    detail: creator?.stripe_onboarding_complete ? "Connected" : "Stripe not connected",
  };
}

function RailBadge({ rail }: { rail: Rail }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 ${rail.ready ? "text-success border-success/30" : "text-destructive border-destructive/30"}`}
    >
      {rail.ready ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {rail.label} {rail.ready ? "ready" : "not set up"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
    pending: { variant: "secondary", icon: Clock },
    approved: { variant: "outline", icon: CheckCircle },
    paid: { variant: "default", icon: CheckCircle },
    rejected: { variant: "destructive", icon: XCircle },
  };
  const { variant, icon: Icon } = config[status] || config.pending;
  return (
    <Badge variant={variant} className="gap-1 capitalize">
      <Icon className="w-3 h-3" />
      {status}
    </Badge>
  );
}

function CycleActionBadge({ action }: { action: string }) {
  if (action === "opened") return <Badge className="gap-1"><CheckCircle className="w-3 h-3" />Opened</Badge>;
  if (action === "would open") return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />Would open</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Nothing to pay</Badge>;
}

export default function AdminPayouts() {
  const [payouts, setPayouts] = useState<PayoutWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [stats, setStats] = useState({
    unpaid: 0,
    unpaidAmount: 0,
    paidThisMonth: 0,
    totalPaid: 0,
  });
  const [processingPayoutId, setProcessingPayoutId] = useState<string | null>(null);
  const [processingBulk, setProcessingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkPayoutSummary | null>(null);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewRows, setPreviewRows] = useState<CycleRow[] | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [openingCycle, setOpeningCycle] = useState(false);
  const [markingManual, setMarkingManual] = useState(false);
  const [manualPayoutId, setManualPayoutId] = useState<string | null>(null);

  useEffect(() => {
    fetchPayouts();
  }, []);

  async function fetchPayouts() {
    try {
      const data = await batchFetchAll((from, to) =>
        supabase
          .from("payouts")
          .select(`
            *,
            creator:creator_id(full_name, email, stripe_onboarding_complete, payout_method, paypal_email)
          `)
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      const rows = (data || []) as unknown as PayoutWithCreator[];
      setPayouts(rows);

      const unpaid = rows.filter(isUnpaid);
      const paid = rows.filter((p) => p.status === "paid");
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      setStats({
        unpaid: unpaid.length,
        unpaidAmount: sumAmounts(unpaid),
        paidThisMonth: sumAmounts(paid.filter((p) => p.paid_at && new Date(p.paid_at) >= monthStart)),
        totalPaid: sumAmounts(paid),
      });
    } catch (error) {
      console.error("Error fetching payouts:", error);
      toast.error("Failed to load payouts");
    } finally {
      setLoading(false);
    }
  }

  async function updatePayoutStatus(id: string, status: PayoutStatus) {
    try {
      const { error } = await supabase.from("payouts").update({ status }).eq("id", id);
      if (error) throw error;
      toast.success(`Payout ${status}`);
      fetchPayouts();
    } catch (error) {
      console.error("Error updating payout:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update payout");
    }
  }

  async function processPayout(payout: PayoutWithCreator) {
    const rail = railFor(payout.creator);
    const name = payout.creator?.full_name || "This creator";
    if (!rail.ready) {
      toast.error(`${name} has not finished ${rail.label} setup yet.`);
      return;
    }

    setProcessingPayoutId(payout.id);
    try {
      const { data, error } = await supabase.functions.invoke("process-payout", {
        body: { payout_id: payout.id },
      });
      if (error || data?.error) throw new Error(data?.error || (await functionErrorMessage(error, "Payout failed")));
      toast.success(`Paid ${formatCurrency(Number(payout.amount))} to ${name} via ${rail.label}`);
      await fetchPayouts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payout failed");
    } finally {
      setProcessingPayoutId(null);
    }
  }

  async function processBulkPayouts() {
    setProcessingBulk(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-bulk-payouts", { body: {} });
      if (error || data?.error) throw new Error(data?.error || (await functionErrorMessage(error, "Bulk pay failed")));

      const summary = data as BulkPayoutSummary;
      setBulkResult(summary);
      setShowBulkDialog(true);
      if (summary.processed === 0) {
        toast.info("Nothing ready to pay right now");
      } else if (summary.failed > 0) {
        toast.warning(`${summary.failed} of ${summary.processed} payouts failed`);
      } else {
        toast.success(
          `Paid ${summary.successful} payout${summary.successful === 1 ? "" : "s"} totalling ${formatCurrency(summary.total_amount || 0)}`
        );
      }
      await fetchPayouts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk pay failed");
    } finally {
      setProcessingBulk(false);
    }
  }

  async function previewNextRun() {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("payout-cycle", { body: { dryRun: true } });
      if (error || data?.error) throw new Error(data?.error || (await functionErrorMessage(error, "Preview failed")));
      setPreviewRows((data?.rows as CycleRow[]) || []);
      setShowPreviewDialog(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function openDuePayouts() {
    setOpeningCycle(true);
    try {
      const { data, error } = await supabase.functions.invoke("payout-cycle", { body: { dryRun: false } });
      if (error || data?.error) throw new Error(data?.error || (await functionErrorMessage(error, "Could not open payouts")));
      const rows = (data?.rows as CycleRow[]) || [];
      const opened = rows.filter((r) => r.action === "opened").length;
      if (opened > 0) {
        toast.success(`Opened ${opened} pay period${opened === 1 ? "" : "s"}. Review them under Due now.`);
      } else {
        toast.info("No completed pay periods to open.");
      }
      await fetchPayouts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open payouts");
    } finally {
      setOpeningCycle(false);
    }
  }

  async function markManualPaid() {
    if (!manualPayoutId) return;
    setMarkingManual(true);
    try {
      const { error } = await supabase
        .from("payouts")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          notes: "Paid outside the app. Marked paid manually by an admin.",
        })
        .eq("id", manualPayoutId);
      if (error) throw error;
      toast.success("Payout marked as paid");
      setManualPayoutId(null);
      fetchPayouts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update payout");
    } finally {
      setMarkingManual(false);
    }
  }

  function exportPayouts() {
    const exportData = payouts.map((p) => ({
      creator: p.creator?.full_name || "Unknown",
      email: p.creator?.email || "",
      type: typeLabel(p.payout_type),
      period: formatPeriod(p.period_start, p.period_end) || "",
      videos: p.video_count ?? "",
      amount: formatCurrencyForExport(Number(p.amount)),
      status: p.status,
      date: formatDateForExport(p.created_at),
      paid_date: p.paid_at ? formatDateForExport(p.paid_at) : "",
      reference: p.stripe_transfer_id || p.paypal_batch_id || "",
    }));
    exportToCSV(exportData, "payouts_export", [
      { key: "creator", header: "Creator" },
      { key: "email", header: "Email" },
      { key: "type", header: "Type" },
      { key: "period", header: "Period" },
      { key: "videos", header: "Videos" },
      { key: "amount", header: "Amount" },
      { key: "status", header: "Status" },
      { key: "date", header: "Created Date" },
      { key: "paid_date", header: "Paid Date" },
      { key: "reference", header: "Reference" },
    ]);
    toast.success("Payout report downloaded as CSV");
  }

  // Due now: anything unpaid whose pay period has closed (bounties have no period and are due at once).
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const dueRows = payouts.filter((p) => isUnpaid(p) && (!p.period_end || p.period_end < todayStr));
  const dueTotal = sumAmounts(dueRows);
  const dueGroups: DueGroup[] = Array.from(
    dueRows
      .reduce((map, p) => {
        const group = map.get(p.creator_id) ?? { creatorId: p.creator_id, creator: p.creator, rows: [], total: 0 };
        group.rows.push(p);
        group.total += Number(p.amount);
        map.set(p.creator_id, group);
        return map;
      }, new Map<string, DueGroup>())
      .values()
  ).sort((a, b) => b.total - a.total);

  const readyForBulk = payouts.filter((p) => isUnpaid(p) && railFor(p.creator).ready).length;

  const filteredPayouts = payouts.filter((payout) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      payout.creator?.full_name?.toLowerCase().includes(q) ||
      payout.creator?.email?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || payout.status === statusFilter;
    const matchesType = typeFilter === "all" || payout.payout_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const renderRowActions = (payout: PayoutWithCreator, compact: boolean) => {
    if (!isUnpaid(payout)) return null;
    const rail = railFor(payout.creator);
    const busy = processingPayoutId === payout.id;
    const size = compact ? "h-7 text-xs" : "";
    const icon = compact ? "w-3 h-3" : "w-4 h-4";
    return (
      <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "justify-end"}`}>
        <Button size="sm" className={size} onClick={() => processPayout(payout)} disabled={busy || !rail.ready} title={rail.ready ? `Pay via ${rail.label}` : rail.detail}>
          {busy ? <Loader2 className={`${icon} animate-spin mr-1`} /> : <DollarSign className={`${icon} mr-1`} />}
          Pay
        </Button>
        {payout.status === "pending" && (
          <Button size="sm" variant="outline" className={size} onClick={() => updatePayoutStatus(payout.id, "approved")}>
            Approve
          </Button>
        )}
        <Button size="sm" variant="outline" className={size} onClick={() => updatePayoutStatus(payout.id, "rejected")}>
          Reject
        </Button>
        <Button size="sm" variant="ghost" className={size} onClick={() => setManualPayoutId(payout.id)} title="Mark as paid outside the app">
          <HandCoins className={`${icon} mr-1`} />
          Manual
        </Button>
      </div>
    );
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-48 bg-muted/50 rounded-xl animate-pulse" />
          <div className="h-96 bg-muted/50 rounded-xl animate-pulse" />
        </div>
      </AdminLayout>
    );
  }

  const manualPayout = manualPayoutId ? payouts.find((p) => p.id === manualPayoutId) : null;

  return (
    <AdminLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Payouts</h1>
              <p className="text-sm text-muted-foreground">Review what is due, then press Pay. Nothing pays on its own.</p>
            </div>
            <Button variant="outline" size="sm" onClick={exportPayouts} className="shrink-0">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Export CSV</span>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="outline" size="sm" onClick={previewNextRun} disabled={previewing}>
              {previewing ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
              Preview next run
            </Button>
            <Button variant="outline" size="sm" onClick={openDuePayouts} disabled={openingCycle}>
              {openingCycle ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CalendarClock className="w-4 h-4 mr-1.5" />}
              Open due payouts now
            </Button>
            <Button
              size="sm"
              className="col-span-2 sm:col-span-1"
              onClick={processBulkPayouts}
              disabled={processingBulk || readyForBulk === 0}
            >
              {processingBulk ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Zap className="w-4 h-4 mr-1.5" />}
              Pay all ready ({readyForBulk})
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 rounded-lg bg-warning/10">
                  <Clock className="w-4 h-4 md:w-5 md:h-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Unpaid</p>
                  <p className="text-lg md:text-2xl font-bold">{stats.unpaid}</p>
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
                  <p className="text-xs md:text-sm text-muted-foreground">Unpaid $</p>
                  <p className="text-lg md:text-2xl font-bold">{formatCurrency(stats.unpaidAmount)}</p>
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
                  <p className="text-xs md:text-sm text-muted-foreground">Paid this month</p>
                  <p className="text-lg md:text-2xl font-bold">{formatCurrency(stats.paidThisMonth)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 rounded-lg bg-success/10">
                  <Banknote className="w-4 h-4 md:w-5 md:h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Total paid</p>
                  <p className="text-lg md:text-2xl font-bold">{formatCurrency(stats.totalPaid)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Due now */}
        <Card className={dueGroups.length > 0 ? "border-primary/40" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Due now</CardTitle>
                <CardDescription>
                  Pay cycles that have closed, grouped by creator. Each line is one payout.
                </CardDescription>
              </div>
              {dueRows.length > 0 && (
                <Badge variant="secondary" className="shrink-0">
                  {dueRows.length} line{dueRows.length === 1 ? "" : "s"}, {formatCurrency(dueTotal)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dueGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nothing is due. A creator's period opens the day after their 28-day cycle ends.
                Use Preview next run to see what is coming.
              </p>
            ) : (
              dueGroups.map((group) => {
                const rail = railFor(group.creator);
                return (
                  <div key={group.creatorId} className="rounded-lg border p-3 space-y-2 bg-background">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{group.creator?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">{group.creator?.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <RailBadge rail={rail} />
                        <span className="font-bold text-sm">{formatCurrency(group.total)}</span>
                      </div>
                    </div>

                    <div className="divide-y">
                      {group.rows.map((p) => {
                        const period = formatPeriod(p.period_start, p.period_end);
                        const busy = processingPayoutId === p.id;
                        return (
                          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{typeLabel(p.payout_type)}</span>
                                <StatusBadge status={p.status} />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {period ?? `Opened ${format(new Date(p.created_at), "MMM d, yyyy")}`}
                                {p.payout_type === "video_pay" && p.video_count != null && (
                                  <>, {p.video_count} video{p.video_count === 1 ? "" : "s"}</>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                              <span className="font-semibold text-sm">{formatCurrency(Number(p.amount))}</span>
                              <Button
                                size="sm"
                                className="h-8"
                                onClick={() => processPayout(p)}
                                disabled={busy || !rail.ready}
                                title={rail.ready ? `Pay via ${rail.label}` : rail.detail}
                              >
                                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <DollarSign className="w-4 h-4 mr-1" />}
                                Pay
                              </Button>
                              <Button size="sm" variant="outline" className="h-8" onClick={() => updatePayoutStatus(p.id, "rejected")}>
                                Reject
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {!rail.ready && (
                      <p className="text-xs text-destructive">
                        {rail.detail}. Pay stays off until they finish setup. If you paid another way, mark it manually in the table below.
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

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
                <CardTitle className="text-base">Monthly payouts</CardTitle>
                <CardDescription>Paid amounts over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-40">
                  {monthlyData.map((m) => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-medium text-foreground">
                        {m.total > 0 ? formatCurrency(m.total) : ""}
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

        {/* All payouts */}
        <Card>
          <CardHeader>
            <CardTitle>All payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by creator..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:flex">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="sm:w-36">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="video_pay">Video pay</SelectItem>
                    <SelectItem value="bonus">Bonus</SelectItem>
                    <SelectItem value="bounty">Bounty</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="sm:w-36">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredPayouts.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No payouts found</p>
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {filteredPayouts.map((payout) => {
                    const period = formatPeriod(payout.period_start, payout.period_end);
                    return (
                      <div key={payout.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{payout.creator?.full_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground truncate">{payout.creator?.email}</p>
                          </div>
                          <p className="font-bold shrink-0">{formatCurrency(Number(payout.amount))}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{typeLabel(payout.payout_type)}</span>
                          <StatusBadge status={payout.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {period ?? format(new Date(payout.created_at), "MMM d, yyyy")}
                          {payout.payout_type === "video_pay" && payout.video_count != null && (
                            <>, {payout.video_count} video{payout.video_count === 1 ? "" : "s"}</>
                          )}
                        </p>
                        {isUnpaid(payout) && (
                          <div className="pt-2 border-t">{renderRowActions(payout, true)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Creator</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayouts.map((payout) => {
                        const period = formatPeriod(payout.period_start, payout.period_end);
                        return (
                          <TableRow key={payout.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{payout.creator?.full_name || "Unknown"}</p>
                                <p className="text-sm text-muted-foreground">{payout.creator?.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>{typeLabel(payout.payout_type)}</TableCell>
                            <TableCell className="text-sm">
                              {period ? (
                                <div>
                                  <p>{period}</p>
                                  {payout.payout_type === "video_pay" && payout.video_count != null && (
                                    <p className="text-xs text-muted-foreground">
                                      {payout.video_count} video{payout.video_count === 1 ? "" : "s"}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No period</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{formatCurrency(Number(payout.amount))}</TableCell>
                            <TableCell><StatusBadge status={payout.status} /></TableCell>
                            <TableCell>{format(new Date(payout.paid_at || payout.created_at), "MMM d, yyyy")}</TableCell>
                            <TableCell className="text-right">{renderRowActions(payout, false)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview next run */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Next run preview</DialogTitle>
            <DialogDescription>
              What the daily cycle would open if it ran now. Nothing has been written.
            </DialogDescription>
          </DialogHeader>

          {previewRows && previewRows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No completed periods are waiting. Every creator is inside their current cycle.
            </p>
          )}

          {previewRows && previewRows.length > 0 && (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {previewRows.map((r, i) => (
                  <div key={`${r.creator_id}-${r.period_start}-${i}`} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{r.creator_name}</p>
                        <p className="text-xs text-muted-foreground">{formatPeriod(r.period_start, r.period_end)}</p>
                      </div>
                      <CycleActionBadge action={r.action} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground">Videos</span>
                      <span className="text-right font-medium">{r.video_count}</span>
                      <span className="text-muted-foreground">Video pay</span>
                      <span className="text-right font-medium">{formatCurrency(Number(r.video_pay))}</span>
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="text-right font-medium">{formatCurrency(Number(r.attributed_revenue))}</span>
                      <span className="text-muted-foreground">Rate</span>
                      <span className="text-right font-medium">{Number(r.bonus_rate)}%</span>
                      <span className="text-muted-foreground">Bonus</span>
                      <span className="text-right font-medium">{formatCurrency(Number(r.bonus_pay))}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creator</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Videos</TableHead>
                      <TableHead className="text-right">Video pay</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Bonus</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((r, i) => (
                      <TableRow key={`${r.creator_id}-${r.period_start}-${i}`}>
                        <TableCell className="font-medium">{r.creator_name}</TableCell>
                        <TableCell className="text-sm">{formatPeriod(r.period_start, r.period_end)}</TableCell>
                        <TableCell className="text-right">{r.video_count}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(r.video_pay))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(r.attributed_revenue))}</TableCell>
                        <TableCell className="text-right">{Number(r.bonus_rate)}%</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(r.bonus_pay))}</TableCell>
                        <TableCell><CycleActionBadge action={r.action} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <Button onClick={() => setShowPreviewDialog(false)} className="w-full">
            Close
          </Button>
        </DialogContent>
      </Dialog>

      {/* Bulk pay results */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk pay results</DialogTitle>
            <DialogDescription>{bulkResult?.message}</DialogDescription>
          </DialogHeader>

          {bulkResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{bulkResult.processed}</p>
                  <p className="text-xs text-muted-foreground">Processed</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{bulkResult.successful}</p>
                  <p className="text-xs text-muted-foreground">Paid</p>
                </div>
                <div className={`rounded-lg p-3 text-center ${bulkResult.failed > 0 ? "bg-destructive/10" : "bg-muted"}`}>
                  <p className={`text-2xl font-bold ${bulkResult.failed > 0 ? "text-destructive" : ""}`}>
                    {bulkResult.failed}
                  </p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>

              {!!bulkResult.total_amount && bulkResult.total_amount > 0 && (
                <div className="bg-primary/10 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-primary">{formatCurrency(bulkResult.total_amount)}</p>
                  <p className="text-sm text-muted-foreground">Total sent</p>
                </div>
              )}

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
                          <TableCell className="text-right font-medium">{formatCurrency(r.amount)}</TableCell>
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
                                <span className="text-xs text-muted-foreground max-w-[200px] truncate">{r.error}</span>
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

      {/* Mark paid manually */}
      <AlertDialog open={!!manualPayoutId} onOpenChange={(open) => !open && setManualPayoutId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as paid manually</AlertDialogTitle>
            <AlertDialogDescription>
              {manualPayout ? (
                <>
                  This records the <strong>{formatCurrency(Number(manualPayout.amount))}</strong>{" "}
                  {typeLabel(manualPayout.payout_type).toLowerCase()} payout for{" "}
                  <strong>{manualPayout.creator?.full_name}</strong> as paid outside the app. No money moves and no email is sent.
                  {manualPayout.payout_type === "video_pay" && " Its videos are marked paid in the ledger."}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markingManual}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={markingManual}
              onClick={(e) => {
                e.preventDefault();
                markManualPaid();
              }}
            >
              {markingManual ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <HandCoins className="w-4 h-4 mr-2" />}
              Mark paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
