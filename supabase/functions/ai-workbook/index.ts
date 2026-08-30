import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runAgentLoop, serviceClient, type Ctx } from "../_shared/aiTools.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return json({ error: "Not authenticated" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    const message = String(body.message ?? "").slice(0, 8000);
    const approvedActions: string[] = Array.isArray(body.approvedActions)
      ? body.approvedActions.map((a: unknown) => String(a)).slice(0, 5)
      : [];
    if (!message && history.length === 0) return json({ error: "Message is required" }, 400);

    const admin = serviceClient();
    const [{ data: roleRow }, { data: profile }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      admin.from("profiles").select("id, full_name").eq("user_id", user.id).maybeSingle(),
    ]);
    const role: "admin" | "creator" = roleRow ? "admin" : "creator";

    const ctx: Ctx = { admin, role, profileId: profile?.id ?? null, approvedActions };

    const system = role === "admin"
      ? `You are the Creators Control operations copilot for an admin of a UGC creator management platform.
Use the tools to look up real data before answering — never guess numbers. Be direct, concise and serious in tone; no hype, no game-show language.
Format answers in short markdown with bullets or small tables. Always cite concrete numbers and names you retrieved.
Destructive or outbound actions (approving/rejecting videos, notifying creators) require the user's explicit approval; if a tool returns pending_approval, explain what you are about to do and ask them to confirm.
Video rejection is final — say so when relevant.`
      : `You are the Creators Control creator coach for a UGC creator. Their profile id is ${profile?.id ?? "unknown"}.
You can look up their own videos and help with scripts, hooks, briefs and improving performance. Be direct, practical and encouraging without hype.
Never reveal other creators' data, payouts or platform-wide numbers. Format answers in short markdown.`;

    const input = [
      ...history.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 8000),
      })),
      ...(message ? [{ role: "user", content: message }] : []),
    ];

    const result = await runAgentLoop(system, input, ctx);
    return json(result, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ai-workbook failed:", msg);
    const m = msg.match(/^\[(\d{3})\]/);
    const status = m ? Number(m[1]) : 500;
    return json({ error: msg }, status >= 400 && status < 600 ? status : 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
