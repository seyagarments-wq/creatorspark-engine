import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { runAgentLoop, serviceClient, type Ctx } from "../_shared/aiTools.ts";

// Runs scheduled AI agents. Invoked by cron (no body) or manually with { agent_id }.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = serviceClient();
  try {
    const body = await req.json().catch(() => ({}));
    const agentId = body?.agent_id ? String(body.agent_id) : null;

    let query = admin.from("ai_agents").select("*").eq("enabled", true);
    if (agentId) query = admin.from("ai_agents").select("*").eq("id", agentId);
    const { data: agents, error } = await query;
    if (error) throw new Error(error.message);

    const due = (agents || []).filter((a: any) => {
      if (agentId) return true;
      if (!a.last_run_at) return true;
      const since = Date.now() - new Date(a.last_run_at).getTime();
      if (a.schedule === "hourly") return since > 55 * 60 * 1000;
      if (a.schedule === "weekly") return since > 6.9 * 864e5;
      return since > 23 * 3600 * 1000; // daily
    });

    const results: any[] = [];
    for (const agent of due) {
      const { data: run } = await admin.from("ai_agent_runs")
        .insert({ agent_id: agent.id, status: "running" }).select("id").single();
      try {
        const ctx: Ctx = { admin, role: "admin", profileId: null, approvedActions: [] };
        const system = `You are a scheduled operations agent for the Creatorsctrl UGC platform.
Use the tools to gather real data, then produce a concise, serious written report in markdown.
Do not attempt destructive actions — they are not approved in scheduled runs. Keep the report under 400 words.`;
        const out = await runAgentLoop(
          system,
          [{ role: "user", content: agent.instructions }],
          ctx,
          8,
        );
        await admin.from("ai_agent_runs").update({
          status: "success",
          output: out.text,
          summary: out.text.split("\n").find((l: string) => l.trim())?.slice(0, 200) ?? null,
          finished_at: new Date().toISOString(),
        }).eq("id", run!.id);
        await admin.from("ai_agents").update({
          last_run_at: new Date().toISOString(), last_status: "success",
        }).eq("id", agent.id);
        results.push({ agent: agent.name, status: "success" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`agent ${agent.id} failed:`, msg);
        await admin.from("ai_agent_runs").update({
          status: "error", error: msg, finished_at: new Date().toISOString(),
        }).eq("id", run!.id);
        await admin.from("ai_agents").update({
          last_run_at: new Date().toISOString(), last_status: "error",
        }).eq("id", agent.id);
        results.push({ agent: agent.name, status: "error", error: msg });
      }
    }

    return new Response(JSON.stringify({ ran: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ai-agent-run failed:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
