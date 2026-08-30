import { useEffect, useState } from "react";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Check, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type DailyStatus = {
  date: string;
  approved_count: number;
  required_count: number;
  is_required_day: boolean;
  status: "pending" | "met" | "missed" | "excused";
};

export default function CreatorCalendar() {
  const { profileId } = useAuth();
  const [statuses, setStatuses] = useState<DailyStatus[]>([]);
  const [eligibility, setEligibility] = useState<any | null>(null);
  const [monthDate] = useState(new Date());

  useEffect(() => {
    if (!profileId) return;
    void load();
  }, [profileId]);

  async function load() {
    const monthStart = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const monthEnd = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

    const [{ data: days }, { data: elig }] = await Promise.all([
      supabase.from("creator_daily_upload_status").select("*").eq("creator_id", profileId!).gte("date", monthStart).lte("date", monthEnd).order("date"),
      supabase.from("creator_monthly_eligibility").select("*").eq("creator_id", profileId!).eq("month", monthStart).maybeSingle(),
    ]);
    setStatuses((days ?? []) as DailyStatus[]);
    setEligibility(elig);
  }

  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const today = new Date().toISOString().slice(0, 10);

  const banner = (() => {
    if (!eligibility) return { tone: "muted", text: "Tracking your month — no data yet." };
    const { met_days, required_days, missed_days, status } = eligibility;
    if (status === "ineligible") return { tone: "destructive", text: `Locked out — ${missed_days} missed days. No commission this month.` };
    if (status === "at_risk") return { tone: "warning", text: `At risk — ${missed_days} missed. One more disqualifies this month.` };
    return { tone: "ok", text: `On track — ${met_days}/${required_days} days, ${missed_days} missed.` };
  })();

  return (
    <CreatorLayout>
      <div className="container max-w-4xl py-6 space-y-6">
        <h1 className="text-2xl font-bold">Upload Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Required days: <strong>Tue / Thu / Sat</strong> · <strong>4 approved minimum</strong> (5 = full credit) · Miss more than 3 days = no commission this month. <span className="text-destructive font-medium">No rollover.</span>
        </p>

        <div className={cn(
          "rounded-lg p-4 border",
          banner.tone === "destructive" && "bg-destructive/10 border-destructive text-destructive",
          banner.tone === "warning" && "bg-accent border-accent text-accent-foreground",
          banner.tone === "ok" && "bg-primary/10 border-primary",
        )}>
          <p className="font-medium">{banner.text}</p>
        </div>

        <Card>
          <CardHeader><CardTitle>{monthDate.toLocaleString("default", { month: "long", year: "numeric" })}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground mb-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: firstDayWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                const ds = statuses.find((s) => s.date === dateStr);
                const isToday = dateStr === today;
                return (
                  <div key={dayNum} className={cn(
                    "aspect-square rounded-md border p-2 flex flex-col items-center justify-between text-xs",
                    isToday && "border-primary border-2",
                    ds?.status === "met" && "bg-primary/10",
                    ds?.status === "missed" && "bg-destructive/10",
                    ds?.is_required_day && !ds?.status && "bg-muted",
                  )}>
                    <span className="font-medium">{dayNum}</span>
                    {ds?.status === "met" && <Check className="w-4 h-4 text-primary" />}
                    {ds?.status === "missed" && <X className="w-4 h-4 text-destructive" />}
                    {ds?.is_required_day && ds?.status === "pending" && <Clock className="w-4 h-4 text-muted-foreground" />}
                    {ds && ds.is_required_day && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{ds.approved_count}/{ds.required_count}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </CreatorLayout>
  );
}
