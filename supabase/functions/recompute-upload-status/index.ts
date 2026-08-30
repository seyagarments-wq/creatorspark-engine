// recompute-upload-status: rebuilds creator_daily_upload_status + creator_monthly_eligibility
// for a given creator/date, then emits warning/at-risk events when thresholds cross.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Schedule = {
  required_weekdays: number[];
  videos_per_day: number;
  max_misses_per_month: number;
};

async function getCreatorSchedule(supabase: any, creatorId: string): Promise<Schedule> {
  const { data: members } = await supabase
    .from("creator_cohort_members").select("cohort_id").eq("creator_id", creatorId).limit(1);
  const cohortId = members?.[0]?.cohort_id;
  if (!cohortId) {
    return { required_weekdays: [2,4,6], videos_per_day: 4, max_misses_per_month: 3 };
  }
  const { data: sched } = await supabase
    .from("cohort_upload_schedules")
    .select("*")
    .eq("cohort_id", cohortId)
    .lte("effective_from", new Date().toISOString().slice(0,10))
    .order("effective_from", { ascending: false })
    .limit(1);
  return sched?.[0] ?? { required_weekdays: [2,4,6], videos_per_day: 4, max_misses_per_month: 3 };
}

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function monthKey(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01`; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const body = await req.json().catch(() => ({}));
  const creatorIds: string[] = body.creator_ids ?? (body.creator_id ? [body.creator_id] : []);
  const targetDate = body.date ? new Date(body.date) : new Date();

  // If no specific creators, recompute everyone (nightly mode)
  let creators: { id: string; user_id: string }[] = [];
  if (creatorIds.length) {
    const { data } = await supabase.from("profiles").select("id, user_id").in("id", creatorIds);
    creators = data ?? [];
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, user_roles!inner(role)")
      .eq("user_roles.role", "creator");
    creators = (data ?? []) as any;
  }

  const dateStr = ymd(targetDate);
  const monthStartStr = monthKey(targetDate);
  const nextMonthDate = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 1));
  const nextMonthStartStr = ymd(nextMonthDate);
  const weekday = targetDate.getUTCDay(); // 0..6 Sun..Sat

  const events: { user_id: string; type: string; payload: any }[] = [];

  for (const c of creators) {
    const sched = await getCreatorSchedule(supabase, c.id);
    const isRequired = sched.required_weekdays.includes(weekday);

    // Approved count for today
    const startOfDay = `${dateStr}T00:00:00.000Z`;
    const endOfDay = `${dateStr}T23:59:59.999Z`;
    const { data: approved } = await supabase
      .from("videos")
      .select("id", { count: "exact", head: false })
      .eq("creator_id", c.id)
      .eq("status", "approved")
      .gte("approved_at", startOfDay)
      .lte("approved_at", endOfDay);

    const approvedCount = approved?.length ?? 0;
    let status: "pending" | "met" | "missed" = "pending";
    if (isRequired) {
      if (approvedCount >= sched.videos_per_day) status = "met";
      else if (targetDate < new Date(new Date().toDateString())) status = "missed"; // past day
    }

    await supabase.from("creator_daily_upload_status").upsert({
      creator_id: c.id,
      date: dateStr,
      approved_count: approvedCount,
      required_count: isRequired ? sched.videos_per_day : 0,
      is_required_day: isRequired,
      status,
    }, { onConflict: "creator_id,date" });

    // Recompute month rollup
    const { data: monthRows } = await supabase
      .from("creator_daily_upload_status")
      .select("status, is_required_day")
      .eq("creator_id", c.id)
      .gte("date", monthStartStr)
      .lt("date", nextMonthStartStr);

    const required = (monthRows ?? []).filter((r) => r.is_required_day).length;
    const met = (monthRows ?? []).filter((r) => r.status === "met").length;
    const missed = (monthRows ?? []).filter((r) => r.status === "missed").length;

    let monthStatus: "on_track" | "at_risk" | "ineligible" | "eligible" = "on_track";
    if (missed > sched.max_misses_per_month) monthStatus = "ineligible";
    else if (missed === sched.max_misses_per_month) monthStatus = "at_risk";

    // Get prior status to detect transitions
    const { data: prevElig } = await supabase
      .from("creator_monthly_eligibility")
      .select("status, missed_days")
      .eq("creator_id", c.id)
      .eq("month", monthStartStr)
      .maybeSingle();

    await supabase.from("creator_monthly_eligibility").upsert({
      creator_id: c.id,
      month: monthStartStr,
      required_days: required,
      met_days: met,
      missed_days: missed,
      status: monthStatus,
      locked_at: monthStatus === "ineligible" && !prevElig?.status?.includes("ineligible") ? new Date().toISOString() : null,
    }, { onConflict: "creator_id,month" });

    // Emit transitional events
    const prevMissed = prevElig?.missed_days ?? 0;
    if (missed > prevMissed && missed >= 2 && monthStatus === "on_track") {
      events.push({ user_id: c.user_id, type: "missed_day_warning", payload: { missed, allowed: sched.max_misses_per_month } });
    }
    if (monthStatus === "at_risk" && prevElig?.status !== "at_risk") {
      events.push({ user_id: c.user_id, type: "at_risk", payload: { missed, allowed: sched.max_misses_per_month } });
    }
    if (monthStatus === "ineligible" && prevElig?.status !== "ineligible") {
      events.push({ user_id: c.user_id, type: "month_ineligible", payload: { missed } });
    }
  }

  // Fire notifications
  for (const e of events) {
    const titleMap: Record<string, { title: string; message: string; link: string; type: string }> = {
      missed_day_warning: {
        title: "⚠️ You missed a required upload day",
        message: `That's ${e.payload.missed} of ${e.payload.allowed} allowed misses this month. One more and you forfeit this month's commission.`,
        link: "/creator/calendar",
        type: "video",
      },
      at_risk: {
        title: "🚨 At risk — one more miss = no commission",
        message: `You've missed ${e.payload.missed}/${e.payload.allowed} days. The next miss locks you out of this month's payout.`,
        link: "/creator/calendar",
        type: "video",
      },
      month_ineligible: {
        title: "Commission forfeited this month",
        message: `You hit ${e.payload.missed} missed days, past the cohort threshold. No rollover. Reset starts the 1st.`,
        link: "/creator/calendar",
        type: "payout",
      },
    };
    const t = titleMap[e.type];
    await supabase.functions.invoke("send-notification-email", {
      body: { user_id: e.user_id, title: t.title, message: t.message, notification_type: t.type, link: t.link },
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ processed: creators.length, events: events.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
