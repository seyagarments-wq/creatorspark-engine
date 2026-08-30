import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CheckCircle2, AlertTriangle, Lock, ArrowRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

type Eligibility = {
  required_days: number;
  met_days: number;
  missed_days: number;
  status: string; // on_track | at_risk | locked
};

export function EligibilityStatusBanner() {
  const { profileId } = useAuth();
  const [row, setRow] = useState<Eligibility | null>(null);
  const [hasSchedule, setHasSchedule] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    let cancel = false;
    (async () => {
      // Confirm creator is in a cohort with a schedule
      const { data: members } = await supabase
        .from("creator_cohort_members")
        .select("cohort_id")
        .eq("creator_id", profileId);
      const cohortIds = (members ?? []).map((m) => m.cohort_id);
      if (cohortIds.length === 0) return;
      const { data: scheds } = await supabase
        .from("cohort_upload_schedules")
        .select("id")
        .in("cohort_id", cohortIds)
        .limit(1);
      if (cancel || !scheds?.length) return;
      setHasSchedule(true);

      // Current month start (UTC date)
      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
      const { data } = await supabase
        .from("creator_monthly_eligibility")
        .select("required_days, met_days, missed_days, status")
        .eq("creator_id", profileId)
        .eq("month", month)
        .maybeSingle();
      if (!cancel && data) setRow(data as Eligibility);
    })();
    return () => {
      cancel = true;
    };
  }, [profileId]);

  if (!hasSchedule) return null;

  const status = row?.status ?? "on_track";
  const met = row?.met_days ?? 0;
  const missed = row?.missed_days ?? 0;
  const required = row?.required_days ?? 12;

  const config =
    status === "locked"
      ? {
          icon: Lock,
          label: "Locked out — no commission this month",
          sub: "Forfeited. No rollover. Resets next month.",
          tone: "border-destructive/40 bg-destructive/10 text-destructive",
        }
      : status === "at_risk"
        ? {
            icon: AlertTriangle,
            label: `At risk — ${missed} missed, one more = lockout`,
            sub: `${met}/${required} required days met this month`,
            tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          }
        : {
            icon: CheckCircle2,
            label: `On track — ${met}/${required} days${missed ? ` · ${missed} missed` : ""}`,
            sub: "Tue · Thu · Sat · 4 approved minimum each",
            tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          };

  const Icon = config.icon;

  return (
    <Link
      to="/creator/calendar"
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 md:p-4 transition-colors hover:opacity-90",
        config.tone,
      )}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{config.label}</p>
        <p className="text-xs opacity-80 mt-0.5">{config.sub}</p>
      </div>
      <CalendarDays className="w-4 h-4 opacity-70 hidden sm:block" />
      <ArrowRight className="w-4 h-4 opacity-70" />
    </Link>
  );
}
