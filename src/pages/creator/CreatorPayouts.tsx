import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/hooks/use-settings";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { PayoutCelebration } from "@/components/PayoutCelebration";
import { playSoundEffect } from "@/hooks/use-sound-effects";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign,
  ExternalLink,
  Wallet,
  Loader2,
  CreditCard,
  CalendarDays,
  Video,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { nextPayoutDate } from "../../../supabase/functions/_shared/payout-math";

interface PayoutRow {
  id: string;
  amount: number;
  status: string;
  payout_type: string;
  created_at: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
}

interface PayProfile {
  first_video_at: string | null;
  payout_cycle_days: number;
  payout_method: string;
  paypal_email: string | null;
}

const PAYOUT_TYPE_LABELS: Record<string, string> = {
  video_pay: "Video pay",
  bonus: "Bonus",
  bounty: "Bounty",
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** "Sep 15, 2026". Dates from payout-math are UTC midnight, so those format in UTC. */
const formatDay = (value: string | Date, utc = false) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(utc ? { timeZone: "UTC" } : {}),
  });

/** A `YYYY-MM-DD` date column, formatted without a timezone shift. */
const formatDateOnly = (ymd: string) => formatDay(`${ymd}T00:00:00Z`, true);

/** Marks payouts paid in the last 48 hours as celebrated, once per session. True when any were new. */
function markNewlyPaid(rows: PayoutRow[]): boolean {
  const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
  let hasNew = false;
  rows
    .filter((p) => p.status === "paid" && new Date(p.paid_at ?? p.created_at).getTime() > twoDaysAgo)
    .forEach((p) => {
      const key = `payout_celebrated_${p.id}`;
      try {
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          hasNew = true;
        }
      } catch {
        /* ignore */
      }
    });
  return hasNew;
}

function StatTile({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: string; accent?: boolean }) {
  return (
    <Card className="border-border/50 shadow-soft">
      <CardContent className="p-3 md:p-4">
        <div className={`inline-flex p-1.5 rounded-lg mb-2 ${accent ? "bg-primary/10" : "bg-secondary"}`}>
          <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <p className={`text-xl md:text-2xl font-semibold tabular-nums truncate ${accent ? "text-primary" : ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export default function CreatorPayouts() {
  const { profileId } = useAuth();
  const { settings } = useSettings();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PayProfile | null>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [earned, setEarned] = useState(0);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [openingStripe, setOpeningStripe] = useState(false);
  const [showPayoutCelebration, setShowPayoutCelebration] = useState(false);

  const fetchEverything = useCallback(async () => {
    if (!profileId) return;
    try {
      const [profileRes, ledgerRes, payoutsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_video_at, payout_cycle_days, payout_method, paypal_email")
          .eq("id", profileId)
          .single(),
        supabase
          .from("video_earnings")
          .select("amount, status")
          .eq("creator_id", profileId)
          .in("status", ["accrued", "paid"]),
        supabase
          .from("payouts")
          .select("id, amount, status, payout_type, created_at, paid_at, period_start, period_end")
          .eq("creator_id", profileId)
          .order("created_at", { ascending: false }),
      ]);

      if (profileRes.data) setProfile(profileRes.data);

      const ledger = ledgerRes.data || [];
      setApprovedCount(ledger.length);
      setEarned(ledger.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));

      const rows: PayoutRow[] = (payoutsRes.data || []).map((p) => ({
        ...p,
        amount: Number(p.amount) || 0,
      }));
      setPayouts(rows);
      if (markNewlyPaid(rows)) {
        playSoundEffect("cha-ching");
        setShowPayoutCelebration(true);
      }
    } catch (error) {
      console.error("Error loading payouts:", error);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  const checkStripeStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-connect-status");
      if (error) throw error;
      setStripeConnected(data?.payouts_enabled || false);
    } catch (error) {
      console.error("Error checking Stripe status:", error);
      setStripeConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchEverything();
    checkStripeStatus();
  }, [fetchEverything, checkStripeStatus]);

  async function handleOpenStripeDashboard() {
    setOpeningStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-express-dashboard");
      if (error) throw error;

      if (data?.url) {
        if (data?.onboarding_required) {
          toast({
            title: "Complete Payout Setup",
            description: "Please complete your Stripe account setup to receive payouts.",
          });
        }
        window.open(data.url, "_blank");
      } else if (data?.error) {
        toast({ title: "Cannot open Stripe", description: data.error, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error opening Stripe dashboard:", error);
      const errorMessage = error instanceof Error && error.message ? error.message : "Failed to open Stripe dashboard. Please try again.";
      toast({ title: "Stripe Dashboard", description: errorMessage, variant: "destructive" });
    } finally {
      setOpeningStripe(false);
    }
  }

  const paidToDate = payouts.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const pending = payouts
    .filter((p) => p.status === "pending" || p.status === "approved")
    .reduce((sum, p) => sum + p.amount, 0);

  const perVideo = settings.pay_rates.per_video;
  const cycleDays = profile?.payout_cycle_days || 28;
  const cycleLabel = cycleDays % 7 === 0 ? `${cycleDays / 7} weeks` : `${cycleDays} days`;
  const nextPayment = profile?.first_video_at
    ? nextPayoutDate(new Date(profile.first_video_at), cycleDays, new Date())
    : null;

  const usesPaypal = profile?.payout_method === "paypal";

  let methodDescription: string;
  let methodAction: React.ReactNode = null;
  if (usesPaypal) {
    if (profile?.paypal_email) {
      methodDescription = `PayPal: ${profile.paypal_email}`;
      methodAction = (
        <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" asChild>
          <Link to="/creator/profile">Change</Link>
        </Button>
      );
    } else {
      methodDescription = "Add your PayPal email to get paid.";
      methodAction = (
        <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" asChild>
          <Link to="/creator/profile">Add PayPal</Link>
        </Button>
      );
    }
  } else if (stripeConnected === null) {
    methodDescription = "Checking your Stripe account...";
  } else if (stripeConnected) {
    methodDescription = "Stripe connected";
    methodAction = (
      <Button
        variant="ghost"
        size="sm"
        className="text-primary h-8 text-xs shrink-0"
        onClick={handleOpenStripeDashboard}
        disabled={openingStripe}
      >
        {openingStripe ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ExternalLink className="w-3 h-3 mr-1" />}
        View in Stripe
      </Button>
    );
  } else {
    methodDescription = "Connect Stripe or add PayPal to get paid.";
    methodAction = (
      <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" asChild>
        <Link to="/creator/profile">Set up</Link>
      </Button>
    );
  }

  return (
    <CreatorLayout>
      <PayoutCelebration show={showPayoutCelebration} onComplete={() => setShowPayoutCelebration(false)} />
      <div className="space-y-5 animate-fade-in">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Payouts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {formatCurrency(perVideo).replace(/\.00$/, "")} per approved video, credited when it is approved. Paid out every {cycleLabel} from your first approved video.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Video} label="Approved videos" value={approvedCount.toLocaleString("en-US")} />
              <StatTile icon={DollarSign} label="Earned" value={formatCurrency(earned)} accent />
              <StatTile icon={CheckCircle2} label="Paid to date" value={formatCurrency(paidToDate)} />
              <StatTile icon={Wallet} label="Pending" value={formatCurrency(pending)} />
            </div>

            <Card className="border-border/50 shadow-soft">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-primary/10 shrink-0">
                  <CalendarDays className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Next payment date</p>
                  {nextPayment ? (
                    <p className="text-lg font-semibold">{formatDay(nextPayment, true)}</p>
                  ) : (
                    <p className="text-sm font-medium">Your first payment date is set when your first video is approved.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-soft">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-secondary shrink-0">
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Payout method</p>
                      <p className="text-xs text-muted-foreground truncate">{methodDescription}</p>
                    </div>
                  </div>
                  {methodAction}
                </div>
              </CardContent>
            </Card>

            <div>
              <h2 className="font-semibold text-sm md:text-base mb-2 md:mb-3">Payout history</h2>
              {payouts.length === 0 ? (
                <div className="bg-card rounded-xl border p-6 md:p-8 text-center">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-muted mx-auto mb-2 md:mb-3 flex items-center justify-center">
                    <Wallet className="w-5 h-5 md:w-6 md:h-6 text-muted-foreground" />
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground">No payouts yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {payouts.map((payout) => {
                    const isPaid = payout.status === "paid";
                    const isOpen = payout.status === "pending" || payout.status === "approved";
                    const label = PAYOUT_TYPE_LABELS[payout.payout_type] ?? payout.payout_type.replace(/_/g, " ");
                    const detail =
                      payout.period_start && payout.period_end
                        ? `${formatDateOnly(payout.period_start)} to ${formatDateOnly(payout.period_end)}`
                        : formatDay(payout.paid_at ?? payout.created_at);
                    return (
                      <div
                        key={payout.id}
                        className="bg-card rounded-lg md:rounded-xl border p-3 md:p-4 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 ${
                              isPaid ? "bg-success/10 text-success" : isOpen ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm md:text-base tabular-nums">{formatCurrency(payout.amount)}</p>
                            <p className="text-[11px] md:text-xs text-muted-foreground truncate">
                              {label} <span className="mx-1">·</span> {detail}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] md:text-xs capitalize shrink-0 ${
                            isPaid
                              ? "bg-success/10 text-success border-success/20"
                              : isOpen
                              ? "bg-warning/10 text-warning border-warning/20"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {payout.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </CreatorLayout>
  );
}
