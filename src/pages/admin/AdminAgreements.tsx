import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { cohortEvents } from "@/lib/cohort-events";
import { format } from "date-fns";

type Agreement = {
  id: string;
  version: string;
  title: string;
  body: string;
  audience: "all" | "cohort" | "creator_list";
  accept_deadline: string | null;
  effective_at: string;
  is_active: boolean;
  created_at: string;
};

type Cohort = { id: string; name: string };

export default function AdminAgreements() {
  const { user } = useAuth();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [acceptanceCounts, setAcceptanceCounts] = useState<Record<string, { accepted: number; targeted: number }>>({});
  const [loading, setLoading] = useState(true);

  // composer
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "cohort">("all");
  const [cohortId, setCohortId] = useState<string>("");
  const [deadline, setDeadline] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from("agreements").select("*").order("created_at", { ascending: false }),
      supabase.from("creator_cohorts").select("id, name").order("name"),
    ]);
    setAgreements((a ?? []) as Agreement[]);
    setCohorts((c ?? []) as Cohort[]);

    if (a && a.length) {
      const counts: Record<string, { accepted: number; targeted: number }> = {};
      for (const ag of a as Agreement[]) {
        const [{ count: accepted }, targetedCount] = await Promise.all([
          supabase.from("agreement_acceptances").select("id", { count: "exact", head: true }).eq("agreement_id", ag.id),
          getTargetedCount(ag),
        ]);
        counts[ag.id] = { accepted: accepted ?? 0, targeted: targetedCount };
      }
      setAcceptanceCounts(counts);
    }
    setLoading(false);
  }

  async function getTargetedCount(ag: Agreement): Promise<number> {
    if (ag.audience === "all") {
      const { count } = await supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "creator");
      return count ?? 0;
    }
    const { data: targets } = await supabase.from("agreement_targets").select("cohort_id, creator_id").eq("agreement_id", ag.id);
    if (!targets) return 0;
    const cohortIds = targets.map((t) => t.cohort_id).filter(Boolean) as string[];
    const creatorIds = new Set(targets.map((t) => t.creator_id).filter(Boolean) as string[]);
    if (cohortIds.length) {
      const { data: members } = await supabase.from("creator_cohort_members").select("creator_id").in("cohort_id", cohortIds);
      members?.forEach((m) => creatorIds.add(m.creator_id));
    }
    return creatorIds.size;
  }

  async function publish() {
    if (!title.trim() || !body.trim() || !version.trim()) {
      toast.error("Version, title and body are required.");
      return;
    }
    if (audience === "cohort" && !cohortId) {
      toast.error("Pick a cohort.");
      return;
    }
    setPublishing(true);

    const { data: ag, error } = await supabase
      .from("agreements")
      .insert({
        version,
        title,
        body,
        audience,
        accept_deadline: deadline ? new Date(deadline).toISOString() : null,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error || !ag) {
      toast.error(error?.message ?? "Failed to publish");
      setPublishing(false);
      return;
    }

    if (audience === "cohort") {
      await supabase.from("agreement_targets").insert({ agreement_id: ag.id, cohort_id: cohortId });
    }

    // Notify targeted creators
    const userIds = await collectUserIdsForAgreement(ag as Agreement, cohortId);
    await Promise.all(
      userIds.map((uid) =>
        cohortEvents.agreementPending(uid, title, deadline ? format(new Date(deadline), "MMM d") : undefined).catch(() => {}),
      ),
    );

    toast.success(`Published — notified ${userIds.length} creator(s)`);
    setVersion(""); setTitle(""); setBody(""); setAudience("all"); setCohortId(""); setDeadline("");
    setPublishing(false);
    void load();
  }

  async function collectUserIdsForAgreement(ag: Agreement, selectedCohortId?: string): Promise<string[]> {
    if (ag.audience === "all") {
      const { data } = await supabase.from("user_roles").select("user_id").eq("role", "creator");
      return (data ?? []).map((r) => r.user_id);
    }
    if (ag.audience === "cohort" && selectedCohortId) {
      const { data: members } = await supabase
        .from("creator_cohort_members")
        .select("creator_id, profiles!inner(user_id)")
        .eq("cohort_id", selectedCohortId);
      return (members ?? []).map((m: any) => m.profiles.user_id);
    }
    return [];
  }

  async function toggleActive(ag: Agreement) {
    await supabase.from("agreements").update({ is_active: !ag.is_active }).eq("id", ag.id);
    void load();
  }

  return (
    <AdminLayout>
      <div className="container max-w-6xl py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Agreements</h1>
          <p className="text-muted-foreground text-sm">Versioned agreements with blocking acceptance. Publishing immediately notifies targeted creators.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Publish new version</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Version</Label>
                <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 2025-04-cohort1" />
              </div>
              <div>
                <Label>Accept deadline (optional — auto-offboard after)</Label>
                <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Body (markdown / plain text)</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Audience</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All creators</SelectItem>
                    <SelectItem value="cohort">Specific cohort</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {audience === "cohort" && (
                <div>
                  <Label>Cohort</Label>
                  <Select value={cohortId} onValueChange={setCohortId}>
                    <SelectTrigger><SelectValue placeholder="Pick cohort" /></SelectTrigger>
                    <SelectContent>
                      {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Button onClick={publish} disabled={publishing}>{publishing ? "Publishing…" : "Publish & notify"}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Published agreements</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
              <div className="space-y-3">
                {agreements.map((ag) => {
                  const c = acceptanceCounts[ag.id];
                  const pct = c && c.targeted ? Math.round((c.accepted / c.targeted) * 100) : 0;
                  return (
                    <div key={ag.id} className="flex items-center justify-between border rounded-lg p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{ag.title}</p>
                          <Badge variant="secondary">v{ag.version}</Badge>
                          <Badge variant={ag.is_active ? "default" : "outline"}>{ag.is_active ? "active" : "inactive"}</Badge>
                          <Badge variant="outline">{ag.audience}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Effective {format(new Date(ag.effective_at), "MMM d, yyyy")}
                          {ag.accept_deadline && ` · Deadline ${format(new Date(ag.accept_deadline), "MMM d, yyyy")}`}
                          {c && ` · ${c.accepted}/${c.targeted} accepted (${pct}%)`}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(ag)}>
                        {ag.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  );
                })}
                {!agreements.length && <p className="text-sm text-muted-foreground">No agreements published yet.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
