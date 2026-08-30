import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

type Row = {
  creator_id: string;
  full_name: string;
  required_days: number;
  met_days: number;
  missed_days: number;
  status: string;
};

export default function AdminEligibility() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cohorts, setCohorts] = useState<{ id: string; name: string }[]>([]);
  const [cohortFilter, setCohortFilter] = useState<string>("all");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    void load();
  }, [month, cohortFilter]);

  async function load() {
    const { data: c } = await supabase.from("creator_cohorts").select("id, name").order("name");
    setCohorts(c ?? []);

    let creatorIds: string[] | null = null;
    if (cohortFilter !== "all") {
      const { data: members } = await supabase.from("creator_cohort_members").select("creator_id").eq("cohort_id", cohortFilter);
      creatorIds = (members ?? []).map((m) => m.creator_id);
    }

    let q = supabase
      .from("creator_monthly_eligibility")
      .select("creator_id, required_days, met_days, missed_days, status, profiles!inner(full_name)")
      .eq("month", month);
    if (creatorIds) q = q.in("creator_id", creatorIds);
    const { data } = await q;
    setRows((data ?? []).map((r: any) => ({
      creator_id: r.creator_id,
      full_name: r.profiles.full_name,
      required_days: r.required_days,
      met_days: r.met_days,
      missed_days: r.missed_days,
      status: r.status,
    })));
  }

  async function recompute() {
    setRecomputing(true);
    await supabase.functions.invoke("recompute-upload-status", { body: {} });
    setRecomputing(false);
    void load();
  }

  function exportCsv() {
    const header = "Creator,Required,Met,Missed,Status\n";
    const lines = rows.map((r) => `"${r.full_name}",${r.required_days},${r.met_days},${r.missed_days},${r.status}`).join("\n");
    const blob = new Blob([header + lines], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `eligibility-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function statusBadge(s: string) {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      on_track: "default", at_risk: "secondary", ineligible: "destructive", eligible: "default",
    };
    return <Badge variant={variants[s] ?? "outline"}>{s.replace("_", " ")}</Badge>;
  }

  return (
    <AdminLayout>
      <div className="container max-w-6xl py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Monthly Eligibility</h1>
            <p className="text-muted-foreground text-sm">Live tracker of who qualifies for this month's commission.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={recompute} disabled={recomputing}>
              {recomputing ? "Recomputing…" : "Recompute now"}
            </Button>
            <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <input
            type="month"
            className="rounded-md border bg-background p-2 text-sm"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(`${e.target.value}-01`)}
          />
          <Select value={cohortFilter} onValueChange={setCohortFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cohorts</SelectItem>
              {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/agreements">Manage agreements →</Link>
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle>{rows.length} creator(s)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2">Creator</th>
                    <th className="py-2">Required</th>
                    <th className="py-2">Met</th>
                    <th className="py-2">Missed</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.creator_id} className="border-b">
                      <td className="py-2 font-medium">{r.full_name}</td>
                      <td className="py-2">{r.required_days}</td>
                      <td className="py-2">{r.met_days}</td>
                      <td className="py-2">{r.missed_days}</td>
                      <td className="py-2">{statusBadge(r.status)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No data for this month yet — hit "Recompute now".</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
