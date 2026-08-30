// Shared tool definitions + executor for the AI Workbook and scheduled agents.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Ctx = {
  admin: SupabaseClient;
  role: "admin" | "creator";
  profileId: string | null;
  approvedActions: string[]; // tool names the user has explicitly approved this turn
};

export const READ_TOOLS = [
  {
    type: "function",
    name: "search_creators",
    description: "Search creators by name or email. Returns basic profile info.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_videos",
    description:
      "List videos, optionally filtered by status (pending, approved, rejected, revision_requested) or creator name.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string" },
        creator_query: { type: "string" },
        days: { type: "number", description: "Only videos created in the last N days" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "platform_stats",
    description:
      "High level platform numbers: creator counts, video counts by status, payouts totals, recent performance spend/revenue.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "video_performance",
    description:
      "Top or bottom performing videos by spend, revenue or ROAS over the last N days.",
    parameters: {
      type: "object",
      properties: {
        order: { type: "string", description: "top or bottom" },
        metric: { type: "string", description: "spend, revenue or roas" },
        days: { type: "number" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_payouts",
    description: "List payouts, optionally filtered by status (pending, approved, paid).",
    parameters: {
      type: "object",
      properties: { status: { type: "string" }, limit: { type: "number" } },
      additionalProperties: false,
    },
  },
] as const;

export const ACTION_TOOLS = [
  {
    type: "function",
    name: "approve_video",
    description: "Approve a video submission. Requires explicit user approval before running.",
    parameters: {
      type: "object",
      properties: { video_id: { type: "string" }, note: { type: "string" } },
      required: ["video_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "reject_video",
    description:
      "Reject a video submission with a reason. Rejection is final. Requires explicit user approval.",
    parameters: {
      type: "object",
      properties: { video_id: { type: "string" }, reason: { type: "string" } },
      required: ["video_id", "reason"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "notify_creator",
    description:
      "Send an in-app notification to a creator. Requires explicit user approval before running.",
    parameters: {
      type: "object",
      properties: {
        creator_id: { type: "string" },
        title: { type: "string" },
        message: { type: "string" },
      },
      required: ["creator_id", "title", "message"],
      additionalProperties: false,
    },
  },
] as const;

export const WRITE_TOOL_NAMES = ACTION_TOOLS.map((t) => t.name) as string[];

export function toolsForRole(role: "admin" | "creator") {
  return role === "admin" ? [...READ_TOOLS, ...ACTION_TOOLS] : [...READ_TOOLS];
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const clamp = (n: unknown, def: number, max: number) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : def;
};
const sanitize = (s: unknown) => String(s ?? "").replace(/[%,]/g, "").slice(0, 120);

export async function runTool(name: string, args: any, ctx: Ctx): Promise<any> {
  const { admin, role, profileId } = ctx;

  if (WRITE_TOOL_NAMES.includes(name)) {
    if (role !== "admin") return { error: "Only admins can run this action." };
    if (!ctx.approvedActions.includes(name)) {
      return { pending_approval: true, message: "Waiting for the user to approve this action." };
    }
  }

  switch (name) {
    case "search_creators": {
      const q = sanitize(args?.query);
      const { data, error } = await admin
        .from("profiles")
        .select("id, full_name, email, status, country, created_at")
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(clamp(args?.limit, 10, 25));
      return error ? { error: error.message } : { creators: data };
    }
    case "list_videos": {
      let query = admin
        .from("videos")
        .select("id, title, unique_video_id, status, created_at, creator_id")
        .order("created_at", { ascending: false })
        .limit(clamp(args?.limit, 15, 50));
      if (args?.status) query = query.eq("status", sanitize(args.status));
      if (args?.days) {
        const since = new Date(Date.now() - clamp(args.days, 7, 365) * 864e5).toISOString();
        query = query.gte("created_at", since);
      }
      if (role === "creator" && profileId) query = query.eq("creator_id", profileId);
      const { data, error } = await query;
      if (error) return { error: error.message };
      const ids = [...new Set((data || []).map((v: any) => v.creator_id))];
      const { data: profs } = await admin
        .from("profiles").select("id, full_name").in("id", ids);
      const map = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      let rows = (data || []).map((v: any) => ({ ...v, creator: map.get(v.creator_id) ?? null }));
      if (args?.creator_query) {
        const cq = String(args.creator_query).toLowerCase();
        rows = rows.filter((r: any) => (r.creator || "").toLowerCase().includes(cq));
      }
      return { videos: rows };
    }
    case "platform_stats": {
      if (role !== "admin") return { error: "Admins only." };
      const [creators, videos, payouts, perf] = await Promise.all([
        admin.from("profiles").select("id", { count: "exact", head: true }),
        admin.from("videos").select("status"),
        admin.from("payouts").select("amount, status"),
        admin.from("performance_data").select("spend, revenue, metric_date")
          .gte("metric_date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
      ]);
      const byStatus: Record<string, number> = {};
      for (const v of videos.data || []) byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      const payoutTotals: Record<string, number> = {};
      for (const p of payouts.data || []) {
        payoutTotals[p.status] = (payoutTotals[p.status] || 0) + Number(p.amount || 0);
      }
      const spend = (perf.data || []).reduce((s: number, r: any) => s + Number(r.spend || 0), 0);
      const revenue = (perf.data || []).reduce((s: number, r: any) => s + Number(r.revenue || 0), 0);
      return {
        creators: creators.count ?? 0,
        videos_by_status: byStatus,
        payout_totals: payoutTotals,
        last_30_days: { spend: +spend.toFixed(2), revenue: +revenue.toFixed(2), roas: spend ? +(revenue / spend).toFixed(2) : 0 },
      };
    }
    case "video_performance": {
      if (role !== "admin") return { error: "Admins only." };
      const days = clamp(args?.days, 30, 365);
      const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      const { data, error } = await admin
        .from("performance_data")
        .select("video_id, spend, revenue, metric_date")
        .gte("metric_date", since)
        .limit(5000);
      if (error) return { error: error.message };
      const agg = new Map<string, { spend: number; revenue: number }>();
      for (const r of data || []) {
        const cur = agg.get(r.video_id) || { spend: 0, revenue: 0 };
        cur.spend += Number(r.spend || 0);
        cur.revenue += Number(r.revenue || 0);
        agg.set(r.video_id, cur);
      }
      const metric = String(args?.metric || "roas");
      let rows = [...agg.entries()].map(([video_id, v]) => ({
        video_id,
        spend: +v.spend.toFixed(2),
        revenue: +v.revenue.toFixed(2),
        roas: v.spend ? +(v.revenue / v.spend).toFixed(2) : 0,
      }));
      rows.sort((a: any, b: any) =>
        String(args?.order) === "bottom" ? a[metric] - b[metric] : b[metric] - a[metric]);
      rows = rows.slice(0, clamp(args?.limit, 10, 25));
      const { data: vids } = await admin
        .from("videos").select("id, title, unique_video_id").in("id", rows.map((r) => r.video_id));
      const vm = new Map((vids || []).map((v: any) => [v.id, v]));
      return { results: rows.map((r) => ({ ...r, ...(vm.get(r.video_id) || {}) })) };
    }
    case "list_payouts": {
      if (role !== "admin") return { error: "Admins only." };
      let q = admin.from("payouts")
        .select("id, amount, status, payout_type, created_at, creator_id")
        .order("created_at", { ascending: false })
        .limit(clamp(args?.limit, 15, 50));
      if (args?.status) q = q.eq("status", sanitize(args.status));
      const { data, error } = await q;
      return error ? { error: error.message } : { payouts: data };
    }
    case "approve_video": {
      const { error } = await admin.from("videos")
        .update({ status: "approved", approved_at: new Date().toISOString(), admin_feedback: args?.note ?? null })
        .eq("id", String(args?.video_id));
      return error ? { error: error.message } : { ok: true };
    }
    case "reject_video": {
      const { error } = await admin.from("videos")
        .update({ status: "rejected", rejection_reason: String(args?.reason).slice(0, 1000) })
        .eq("id", String(args?.video_id));
      return error ? { error: error.message } : { ok: true };
    }
    case "notify_creator": {
      const target = String(args?.creator_id);
      const { data: prof } = await admin
        .from("profiles").select("user_id").or(`id.eq.${target},user_id.eq.${target}`).maybeSingle();
      if (!prof?.user_id) return { error: "Creator not found" };
      const { error } = await admin.from("notifications").insert({
        user_id: prof.user_id,
        title: String(args?.title).slice(0, 140),
        message: String(args?.message).slice(0, 2000),
        notification_type: "system",
      });
      return error ? { error: error.message } : { ok: true };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

export type AgentResult = { text: string; activity: any[]; pendingActions: any[] };

export async function runAgentLoop(
  system: string,
  input: any[],
  ctx: Ctx,
  maxSteps = 8,
): Promise<AgentResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const activity: any[] = [];
  const pendingActions: any[] = [];
  const messages: any[] = [...input];

  for (let step = 0; step < maxSteps; step++) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        instructions: system,
        input: messages,
        tools: toolsForRole(ctx.role),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`[${res.status}] ${body}`);
      (err as any).status = res.status;
      throw err;
    }

    const data = await res.json();
    const output: any[] = data.output || [];
    const calls = output.filter((o) => o.type === "function_call");

    if (calls.length === 0) {
      const text = output
        .filter((o) => o.type === "message")
        .flatMap((o: any) => (o.content || []).filter((c: any) => c.type === "output_text").map((c: any) => c.text))
        .join("\n").trim();
      return { text, activity, pendingActions };
    }

    for (const c of output) messages.push(c);

    for (const call of calls) {
      let args: any = {};
      try { args = JSON.parse(call.arguments || "{}"); } catch { /* ignore */ }
      const result = await runTool(call.name, args, ctx);
      if (result?.pending_approval) {
        pendingActions.push({ tool: call.name, args });
      }
      activity.push({ tool: call.name, args, result });
      messages.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result).slice(0, 12000),
      });
    }
  }

  return { text: "I reached the step limit before finishing. Try narrowing the request.", activity, pendingActions };
}
