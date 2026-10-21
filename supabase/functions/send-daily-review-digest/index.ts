import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSecret } from "../_shared/secrets.ts";

// Once a day: one email per creator who had videos approved since the last run, and one overview
// to the admins. Declines and revisions from the same window ride along in those emails. On a
// window with zero approvals nothing is sent. Replaces the per-upload / per-approval /
// per-decline emails removed 2026-10-20.
//
// Called by pg_cron (header x-cron-key) or by hand with the service-role bearer.
// POST {"dry_run": true} returns what would be sent without sending or moving the window.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

const log = (s: string, d?: unknown) => console.log(`[REVIEW-DIGEST] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

type VideoRow = {
  id: string;
  title: string | null;
  creator_id: string;
  bounty_id: string | null;
  status: string;
  rejection_reason: string | null;
};

type Profile = { id: string; user_id: string | null; full_name: string | null };

function cleanTitle(t: string | null): string {
  return (t || "Untitled").replace(/[<>]/g, "").trim();
}

// Rejection text carries "[Category] " prefixes and "[sticker:url]" tokens. Keep the words.
function cleanReason(r: string | null): string {
  if (!r) return "";
  return r.replace(/\[sticker:[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: the cron's shared key, or the service-role key as a bearer.
    const cronKey = await getSecret("REVIEW_DIGEST_CRON_KEY");
    const headerKey = req.headers.get("x-cron-key");
    const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const authed = (cronKey && headerKey === cronKey) || (bearer && bearer === serviceKey);
    if (!authed) return json({ error: "Unauthorized" }, 401);

    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch { /* empty body */ }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Window
    const { data: setting } = await supabase.from("settings").select("value").eq("key", "review_digest").maybeSingle();
    const lastRunRaw = (setting?.value as { last_run?: string } | null)?.last_run;
    const since = lastRunRaw ? new Date(lastRunRaw) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const until = new Date();
    log("Window", { since: since.toISOString(), until: until.toISOString(), dryRun });

    // Decisions in the window
    const { data: approved, error: aErr } = await supabase
      .from("videos")
      .select("id, title, creator_id, bounty_id, status, rejection_reason")
      .eq("status", "approved")
      .gt("approved_at", since.toISOString())
      .lte("approved_at", until.toISOString());
    if (aErr) throw aErr;

    const { data: declined, error: dErr } = await supabase
      .from("videos")
      .select("id, title, creator_id, bounty_id, status, rejection_reason")
      .in("status", ["rejected", "revision_requested"])
      .gt("reviewed_at", since.toISOString())
      .lte("reviewed_at", until.toISOString());
    if (dErr) throw dErr;

    const approvals = (approved || []) as VideoRow[];
    const others = (declined || []) as VideoRow[];

    if (approvals.length === 0) {
      log("No approvals in window, nothing sent", { declined: others.length });
      if (!dryRun) {
        await supabase.from("settings").upsert({ key: "review_digest", value: { last_run: until.toISOString() } }, { onConflict: "key" });
      }
      return json({ sent: 0, approvals: 0, declined: others.length, window: { since, until } });
    }

    // Creators involved
    const creatorIds = [...new Set([...approvals, ...others].map((v) => v.creator_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, user_id, full_name").in("id", creatorIds);
    const byId = new Map<string, Profile>((profiles || []).map((p: Profile) => [p.id, p]));

    const sendTo = async (user_id: string, title: string, message: string, link: string, button_text: string) => {
      if (dryRun) return true;
      const r = await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ user_id, title, message, notification_type: "video", link, button_text }),
      });
      if (!r.ok) log("send failed", { user_id, status: r.status, body: await r.text() });
      return r.ok;
    };

    const preview: Array<{ to: string; subject: string; message: string }> = [];
    let sent = 0;

    // 1. One email per creator with approvals
    const approvedByCreator = new Map<string, VideoRow[]>();
    for (const v of approvals) approvedByCreator.set(v.creator_id, [...(approvedByCreator.get(v.creator_id) || []), v]);

    for (const [creatorId, vids] of approvedByCreator) {
      const profile = byId.get(creatorId);
      if (!profile?.user_id) { log("creator without user", { creatorId }); continue; }

      const n = vids.length;
      // Rejected and revision_requested both read as "declined" to the creator; the notes say which.
      const mine = others.filter((v) => v.creator_id === creatorId);

      const lines: string[] = [];
      lines.push(n === 1 ? `1 of your videos was approved today:` : `${n} of your videos were approved today:`);
      for (const v of vids) lines.push(`• "${cleanTitle(v.title)}"`);
      if (mine.length) {
        lines.push(`Declined today:`);
        for (const v of mine) {
          const why = cleanReason(v.rejection_reason);
          lines.push(`• "${cleanTitle(v.title)}"${why ? `: ${why}` : ""}`);
        }
      }

      const subject = n === 1 ? "1 video approved today" : `${n} videos approved today`;
      const message = lines.join("\n");
      preview.push({ to: profile.full_name || profile.user_id, subject, message });
      if (await sendTo(profile.user_id, subject, message, "/creator/my-videos", "See your videos")) sent++;
    }

    // 2. One overview per admin
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const creatorsWithApprovals = approvedByCreator.size;
    const adminLines: string[] = [];
    for (const [creatorId, vids] of approvedByCreator) {
      const name = byId.get(creatorId)?.full_name || "Unknown creator";
      adminLines.push(`${name} (${vids.length}): ${vids.map((v) => `"${cleanTitle(v.title)}"`).join(", ")}`);
    }
    if (others.length) adminLines.push(`Also today: ${others.length} declined.`);
    const adminSubject = `Approved today: ${approvals.length} video${approvals.length === 1 ? "" : "s"} from ${creatorsWithApprovals} creator${creatorsWithApprovals === 1 ? "" : "s"}`;
    const adminMessage = adminLines.join("\n");
    for (const a of adminRoles || []) {
      preview.push({ to: `admin:${a.user_id}`, subject: adminSubject, message: adminMessage });
      if (await sendTo(a.user_id, adminSubject, adminMessage, "/admin/submissions", "Open submissions")) sent++;
    }

    // 3. Move the window
    if (!dryRun) {
      await supabase.from("settings").upsert({ key: "review_digest", value: { last_run: until.toISOString() } }, { onConflict: "key" });
    }

    log("Done", { sent, approvals: approvals.length, creators: creatorsWithApprovals, declined: others.length });
    return json({ sent, approvals: approvals.length, creators: creatorsWithApprovals, declined: others.length, window: { since, until }, dry_run: dryRun, preview: dryRun ? preview : undefined });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return json({ error: msg }, 500);
  }
});
