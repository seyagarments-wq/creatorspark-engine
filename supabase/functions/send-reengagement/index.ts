import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getSecret } from "../_shared/secrets.ts";

const RESEND_API_KEY = (await getSecret("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[REENGAGEMENT] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

function getEmailHtml(body: string, name: string, buttonText: string, link: string): string {
  const paragraphs = body
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `<p style="color:#4b5563;font-size:16px;margin:0 0 12px 0;line-height:1.6;">${l}</p>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f4f4f5;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <div style="text-align:center;margin-bottom:28px;">
    <span style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:white;padding:10px 20px;border-radius:10px;font-weight:700;font-size:18px;">Creators Control</span>
  </div>
  <p style="color:#1f2937;font-size:16px;margin:0 0 16px 0;font-weight:500;">Hey ${name},</p>
  ${paragraphs}
  <div style="text-align:center;margin:28px 0 12px 0;">
    <a href="${link}" style="display:inline-block;background-color:#8B5CF6;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">${buttonText}</a>
  </div>
  <div style="margin-top:36px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;">Creators Control &bull; Manage preferences in your profile settings</p>
  </div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    log("Function started");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const appUrl = (await getSecret("APP_URL")) || "https://creatorsctrl.com";

    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "creator");
    if (!roles?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: sentSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "reengagement_sent")
      .maybeSingle();
    const sentMap: Record<string, string> = (sentSetting?.value as any) || {};
    const updatedSentMap = { ...sentMap };

    let sent = 0;
    let skipped = 0;

    for (const r of roles) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, email, email_notifications")
          .eq("user_id", r.user_id)
          .eq("status", "active")
          .eq("stripe_onboarding_complete", true)
          .single();
        if (!profile?.email || !profile.email_notifications) {
          skipped++;
          continue;
        }

        const lastSent = sentMap[profile.id];
        if (lastSent) {
          const daysSince = (now.getTime() - new Date(lastSent).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 7) {
            skipped++;
            continue;
          }
        }

        const { count: recentCount } = await supabase
          .from("videos")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", profile.id)
          .gte("created_at", threeDaysAgo.toISOString());
        if ((recentCount || 0) > 0) {
          skipped++;
          continue;
        }

        const { count: monthCount } = await supabase
          .from("videos")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", profile.id)
          .gte("created_at", thirtyDaysAgo.toISOString());
        if ((monthCount || 0) === 0) {
          skipped++;
          continue;
        }

        const { data: elig } = await supabase
          .from("creator_monthly_eligibility")
          .select("missed_days, status")
          .eq("creator_id", profile.id)
          .eq("month", monthKey)
          .maybeSingle();

        const missed = elig?.missed_days ?? 0;
        const isLocked = elig?.status === "ineligible" || missed >= 3;

        const subject = isLocked
          ? "🔒 You forfeited this month — but next month is wide open"
          : `⚠️ ${missed}/3 missed days — your commission is on the line`;

        const body = isLocked
          ? `You hit 3 missed required days, so this month's commission is forfeited per the cohort agreement. No rollover.\n\nBut here's the deal: the 1st resets EVERYTHING. Clean board. Fresh 12 required days. New shot at the full month.\n\nUse the rest of this month to dial in your process so when the new month hits, you're ready to go 12-for-12. Don't waste the comeback.`
          : `You've been ghost for a few days — and you're already at <strong>${missed}/3</strong> missed required days this month.\n\nReminder of the cohort rules:\n• Required days: Tue / Thu / Sat\n• Minimum: 4 approved videos per required day\n• Hit a 4th miss = this month's commission is GONE. No rollover. No appeal.\n\nThis isn't a "we miss you" email. This is your earnings on the line. Get back on the board today.`;

        const cta = isLocked ? "See Next Month's Plan" : "Get Back on the Board";
        const link = isLocked ? `${appUrl}/creator/calendar` : `${appUrl}/creator/submit`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Creators Control <noreply@seyagarments.com>",
            to: [profile.email],
            subject,
            html: getEmailHtml(body, profile.full_name, cta, link),
          }),
        });

        updatedSentMap[profile.id] = now.toISOString();
        sent++;
        await new Promise((r) => setTimeout(r, 600));
      } catch (e) {
        log("Error", { user: r.user_id, error: String(e) });
      }
    }

    await supabase.from("settings").upsert({ key: "reengagement_sent", value: updatedSentMap as any }, { onConflict: "key" });

    log("Complete", { sent, skipped });
    return new Response(JSON.stringify({ success: true, sent, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
