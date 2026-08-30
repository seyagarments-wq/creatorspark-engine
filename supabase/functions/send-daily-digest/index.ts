import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getSecret } from "../_shared/secrets.ts";

const RESEND_API_KEY = (await getSecret("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[DAILY-DIGEST] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

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
    <span style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:white;padding:10px 20px;border-radius:10px;font-weight:700;font-size:18px;">Creatorsctrl</span>
  </div>
  <p style="color:#1f2937;font-size:16px;margin:0 0 16px 0;font-weight:500;">Hey ${name},</p>
  ${paragraphs}
  <div style="text-align:center;margin:28px 0 12px 0;">
    <a href="${link}" style="display:inline-block;background-color:#8B5CF6;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">${buttonText}</a>
  </div>
  <div style="margin-top:36px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;">Creatorsctrl &bull; Manage preferences in your profile settings</p>
  </div>
</div></body></html>`;
}

function nextRequiredDay(from: Date): string {
  const days = ["Sun", "Mon", "Tuesday", "Wed", "Thursday", "Fri", "Saturday"];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + i);
    const dow = d.getUTCDay();
    if (dow === 2 || dow === 4 || dow === 6) return days[dow];
  }
  return "Tuesday";
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
    const next = nextRequiredDay(now);

    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "creator");
    if (!roles?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let sent = 0;
    for (const r of roles) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, email, email_notifications")
          .eq("user_id", r.user_id)
          .eq("status", "active")
          .eq("stripe_onboarding_complete", true)
          .single();
        if (!profile?.email || !profile.email_notifications) continue;

        const { data: elig } = await supabase
          .from("creator_monthly_eligibility")
          .select("met_days, missed_days, required_days, status")
          .eq("creator_id", profile.id)
          .eq("month", monthKey)
          .maybeSingle();

        const met = elig?.met_days ?? 0;
        const missed = elig?.missed_days ?? 0;
        const required = elig?.required_days ?? 12;
        const status = elig?.status ?? "on_track";

        let headline: string;
        let pace: string;
        let cta = "Open Calendar";
        let link = `${appUrl}/creator/calendar`;

        let subjectPrefix = "";

        if (status === "ineligible" || missed >= 3) {
          headline = "Commission forfeited this month";
          subjectPrefix = "[Important] ";
          pace = `You have reached ${missed} of 3 allowed missed days. This month's commission will not be paid and does not roll over. Eligibility resets on the 1st of next month.`;
        } else if (missed === 2) {
          headline = "One miss away from forfeiting commission";
          subjectPrefix = "[Action Required] ";
          pace = `Current standing: <strong>${met}/${required}</strong> required days met, <strong>${missed}/3</strong> missed. One additional missed day will make you ineligible for this month's payout.`;
          cta = "Submit a video";
          link = `${appUrl}/creator/submit`;
        } else if (missed === 1) {
          headline = "Missed day on record";
          subjectPrefix = "[Important] ";
          pace = `Current standing: <strong>${met}/${required}</strong> required days met, <strong>${missed}/3</strong> missed. Two more missed days will result in losing this month's commission. Next required day: <strong>${next}</strong>.`;
        } else {
          headline = "On track for this month";
          pace = `Current standing: <strong>${met}/${required}</strong> required days met, <strong>0/3</strong> missed. You remain eligible for this month's commission. Next required day: <strong>${next}</strong>.`;
        }

        const subject = `${subjectPrefix}${headline}`;
        const body = `${headline}\n\n${pace}\n\nReminder: a minimum of 4 approved videos is required on each scheduled day (Tue/Thu/Sat). Rejected videos do not count toward the requirement.`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Creatorsctrl <noreply@seyagarments.com>",
            to: [profile.email],
            subject,
            html: getEmailHtml(body, profile.full_name, cta, link),
          }),
        });

        sent++;
        await new Promise((r) => setTimeout(r, 600));
      } catch (e) {
        log("Error", { user: r.user_id, error: String(e) });
      }
    }

    log("Complete", { sent });
    return new Response(JSON.stringify({ success: true, sent }), {
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
