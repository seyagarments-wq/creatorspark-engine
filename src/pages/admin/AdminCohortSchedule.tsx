import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AdminCohortSchedule() {
  const { id: cohortId } = useParams();
  const [cohortName, setCohortName] = useState("");
  const [requiredWeekdays, setRequiredWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [videosPerDay, setVideosPerDay] = useState(4);
  const [maxMisses, setMaxMisses] = useState(3);
  const [lockDay, setLockDay] = useState<number | null>(3); // Wed default
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cohortId) return;
    void load();
  }, [cohortId]);

  async function load() {
    const { data: cohort } = await supabase.from("creator_cohorts").select("name").eq("id", cohortId!).single();
    if (cohort) setCohortName(cohort.name);

    const { data: sched } = await supabase
      .from("cohort_upload_schedules")
      .select("*")
      .eq("cohort_id", cohortId!)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sched) {
      setScheduleId(sched.id);
      setRequiredWeekdays(sched.required_weekdays);
      setVideosPerDay(sched.videos_per_day);
      setMaxMisses(sched.max_misses_per_month);
      setLockDay(sched.lock_day_of_week);
    }
  }

  function toggleWeekday(day: number) {
    setRequiredWeekdays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  }

  async function save() {
    setSaving(true);
    const payload = {
      cohort_id: cohortId!,
      required_weekdays: requiredWeekdays,
      videos_per_day: videosPerDay,
      max_misses_per_month: maxMisses,
      lock_day_of_week: lockDay,
      effective_from: new Date().toISOString().slice(0, 10),
    };
    const { error } = scheduleId
      ? await supabase.from("cohort_upload_schedules").update(payload).eq("id", scheduleId)
      : await supabase.from("cohort_upload_schedules").insert(payload);
    if (error) toast.error(error.message);
    else toast.success("Schedule saved");
    setSaving(false);
    void load();
  }

  return (
    <AdminLayout>
      <div className="container max-w-2xl py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Upload schedule</h1>
          <p className="text-muted-foreground text-sm">Cohort: {cohortName}</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Required upload days</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {WEEKDAYS.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <Checkbox checked={requiredWeekdays.includes(i)} onCheckedChange={() => toggleWeekday(i)} id={`d${i}`} />
                <label htmlFor={`d${i}`} className="text-sm">{label}</label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Daily quota</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Approved videos required per day</Label>
              <Input type="number" min={1} max={20} value={videosPerDay} onChange={(e) => setVideosPerDay(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <Label>Max misses allowed per month before commission forfeit</Label>
              <Input type="number" min={0} max={31} value={maxMisses} onChange={(e) => setMaxMisses(parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Eligibility lock day (weekday they must be on track by)</Label>
              <select className="w-full rounded-md border bg-background p-2 text-sm" value={lockDay ?? ""} onChange={(e) => setLockDay(e.target.value === "" ? null : parseInt(e.target.value))}>
                <option value="">No lock day</option>
                {WEEKDAYS.map((label, i) => <option key={i} value={i}>{label}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save schedule"}</Button>
      </div>
    </AdminLayout>
  );
}
