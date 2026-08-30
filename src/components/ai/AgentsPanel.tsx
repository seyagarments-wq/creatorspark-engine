import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Bot, Play, Plus, Trash2, Loader2 } from "lucide-react";

type Agent = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  schedule: string;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
};

type Run = {
  id: string;
  agent_id: string;
  status: string;
  output: string | null;
  error: string | null;
  started_at: string;
};

const SCHEDULES = ["hourly", "daily", "weekly"];

const TEMPLATES = [
  {
    name: "Daily performance digest",
    schedule: "daily",
    instructions:
      "Summarise yesterday's platform performance: total spend, revenue and ROAS, the top 5 videos by ROAS and the bottom 5 by spend with no purchases. Flag anything that needs attention.",
  },
  {
    name: "Underperformer flag",
    schedule: "daily",
    instructions:
      "Find videos from the last 14 days with at least $30 spend and zero purchases. List them with creator name, video ID and spend so they can be cut.",
  },
  {
    name: "Review backlog check",
    schedule: "daily",
    instructions:
      "Count videos still pending review and list the 10 oldest with creator name and how long they have been waiting.",
  },
];

export function AgentsPanel() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", instructions: "", schedule: "daily" });

  const load = async () => {
    const [a, r] = await Promise.all([
      supabase.from("ai_agents").select("*").order("created_at", { ascending: false }),
      supabase.from("ai_agent_runs").select("*").order("started_at", { ascending: false }).limit(10),
    ]);
    setAgents((a.data as Agent[]) || []);
    setRuns((r.data as Run[]) || []);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!draft.name.trim() || !draft.instructions.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("ai_agents").insert({
      name: draft.name.trim(),
      instructions: draft.instructions.trim(),
      schedule: draft.schedule,
      created_by: auth.user?.id ?? null,
    });
    if (error) return toast({ title: "Could not create agent", description: error.message, variant: "destructive" });
    setDraft({ name: "", instructions: "", schedule: "daily" });
    setCreating(false);
    load();
  };

  const toggle = async (agent: Agent) => {
    await supabase.from("ai_agents").update({ enabled: !agent.enabled }).eq("id", agent.id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("ai_agents").delete().eq("id", id);
    load();
  };

  const runNow = async (id: string) => {
    setRunning(id);
    const { error } = await supabase.functions.invoke("ai-agent-run", { body: { agent_id: id } });
    setRunning(null);
    if (error) return toast({ title: "Run failed", description: error.message, variant: "destructive" });
    toast({ title: "Agent finished" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Scheduled agents gather live data and write a report on a schedule.
        </p>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="w-4 h-4 mr-1" /> New agent
        </Button>
      </div>

      {creating && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.name} onClick={() => setDraft({ name: t.name, instructions: t.instructions, schedule: t.schedule })}>
                <Badge variant="secondary" className="cursor-pointer">{t.name}</Badge>
              </button>
            ))}
          </div>
          <Input
            placeholder="Agent name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Textarea
            placeholder="What should this agent do each run?"
            value={draft.instructions}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
            className="min-h-[120px] rounded-2xl"
          />
          <div className="flex gap-2">
            {SCHEDULES.map((s) => (
              <button key={s} onClick={() => setDraft({ ...draft, schedule: s })}>
                <Badge variant={draft.schedule === s ? "default" : "secondary"} className="capitalize cursor-pointer">
                  {s}
                </Badge>
              </button>
            ))}
          </div>
          <Button size="sm" onClick={create}>Create agent</Button>
        </Card>
      )}

      {agents.length === 0 && !creating && (
        <Card className="p-8 text-center text-muted-foreground">
          <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No agents yet. Create one to get scheduled reports.</p>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {agents.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{a.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {a.schedule}
                  {a.last_run_at ? ` · last run ${new Date(a.last_run_at).toLocaleString()}` : " · never run"}
                  {a.last_status ? ` · ${a.last_status}` : ""}
                </p>
              </div>
              <Switch checked={a.enabled} onCheckedChange={() => toggle(a)} />
            </div>
            <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{a.instructions}</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => runNow(a.id)} disabled={running === a.id}>
                {running === a.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                Run now
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(a.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {runs.length > 0 && (
        <Card className="p-4">
          <p className="font-semibold text-sm mb-3">Recent runs</p>
          <div className="space-y-3">
            {runs.map((r) => (
              <div key={r.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={r.status === "success" ? "default" : r.status === "error" ? "destructive" : "secondary"}>
                    {r.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{r.output || r.error || "…"}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
