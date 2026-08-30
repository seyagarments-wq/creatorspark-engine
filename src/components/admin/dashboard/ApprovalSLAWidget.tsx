import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type CohortRow = { cohort: string; medianMinutes: number; sample: number };

function median(nums: number[]) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function formatMinutes(m: number) {
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
}

export function ApprovalSLAWidget() {
  const [overall, setOverall] = useState<number>(0);
  const [sample, setSample] = useState<number>(0);
  const [byCohort, setByCohort] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: videos } = await supabase
        .from("videos")
        .select("id, creator_id, created_at, approved_at, status")
        .gte("created_at", since)
        .in("status", ["approved", "rejected"])
        .not("approved_at", "is", null)
        .limit(2000);

      const list = videos ?? [];
      const allMinutes = list
        .map((v: any) => (new Date(v.approved_at).getTime() - new Date(v.created_at).getTime()) / 60000)
        .filter((n) => n >= 0 && Number.isFinite(n));
      setOverall(median(allMinutes));
      setSample(allMinutes.length);

      // Group by cohort
      const creatorIds = [...new Set(list.map((v: any) => v.creator_id))];
      if (creatorIds.length) {
        const { data: members } = await supabase
          .from("creator_cohort_members")
          .select("creator_id, cohort_id, creator_cohorts!inner(name)")
          .in("creator_id", creatorIds);
        const map = new Map<string, { name: string; mins: number[] }>();
        for (const v of list as any[]) {
          const m = (members ?? []).find((x: any) => x.creator_id === v.creator_id);
          const name = m?.creator_cohorts?.name ?? "No cohort";
          const mins = (new Date(v.approved_at).getTime() - new Date(v.created_at).getTime()) / 60000;
          if (!Number.isFinite(mins) || mins < 0) continue;
          const e = map.get(name) ?? { name, mins: [] };
          e.mins.push(mins);
          map.set(name, e);
        }
        const rows: CohortRow[] = [...map.values()]
          .map((e) => ({ cohort: e.name, medianMinutes: median(e.mins), sample: e.mins.length }))
          .sort((a, b) => b.sample - a.sample)
          .slice(0, 6);
        setByCohort(rows);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="w-4 h-4" /> Approval SLA (30d)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-3xl font-bold">{loading ? "—" : formatMinutes(overall)}</div>
          <div className="text-xs text-muted-foreground">
            Median upload → decision · {sample} videos
          </div>
        </div>
        {byCohort.length > 0 && (
          <div className="space-y-1">
            {byCohort.map((r) => (
              <div key={r.cohort} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground truncate pr-2">{r.cohort}</span>
                <span className="font-medium tabular-nums">
                  {formatMinutes(r.medianMinutes)}
                  <span className="text-muted-foreground text-xs ml-1">({r.sample})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
