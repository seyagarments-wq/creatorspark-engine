import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getSecret } from "../_shared/secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Reminder slots: integer-encoded to fit the existing integer column
// 10 = Day 1 morning, 15 = Day 1 evening, 20 = Day 2, 50 = Day 5
const REMINDER_SLOTS = [
  { key: 10, minHours: 24, label: "Day 1 Morning" },
  { key: 15, minHours: 32, label: "Day 1 Evening" },
  { key: 20, minHours: 48, label: "Day 2" },
  { key: 50, minHours: 120, label: "Day 5" },
  { key: 70, minHours: 168, label: "Day 7" },
  { key: 100, minHours: 240, label: "Day 10" },
];

const resend = new Resend((await getSecret("RESEND_API_KEY")));

function getDay1Email(name: string): { subject: string; html: string } {
  return {
    subject: "Welcome to Creatorsctrl — Let's get you set up! 🚀",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="color:#111;">Hey ${name}! 👋</h2>
        <p style="color:#444;">Congrats again on being approved to join <strong>Creatorsctrl</strong>! We're excited to have you.</p>
        <p style="color:#444;">To start earning, you'll need to complete a few quick steps:</p>
        <ol style="color:#444; line-height:1.8;">
          <li><strong>Create your account</strong> — Sign in at <a href="https://creatorsctrl.com/auth" style="color:#6366f1;">creatorsctrl.com</a></li>
          <li><strong>Connect Stripe</strong> — So we can send you payouts</li>
          <li><strong>Request your free sample</strong> — Get the product shipped to you</li>
          <li><strong>Submit your first video</strong> — Start earning commissions!</li>
        </ol>
        <p style="margin-top:24px;">
          <a href="https://creatorsctrl.com/auth" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Get Started Now</a>
        </p>
        <p style="color:#888;font-size:13px;margin-top:32px;">Questions? Text our founder Kohl directly at <strong>(425) 588-1480</strong> — he's happy to help!</p>
      </div>
    `,
  };
}

function getDay1EveningEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Quick reminder — your creator account is ready to set up! 🙌",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="color:#111;">Hey ${name}! 👋</h2>
        <p style="color:#444;">Just wanted to make sure you saw the email from earlier — your <strong>Creatorsctrl</strong> account is approved and ready to go!</p>
        <p style="color:#444;">All you need to do is sign in and complete a quick setup. It takes about 5 minutes:</p>
        <p style="margin-top:24px;">
          <a href="https://creatorsctrl.com/auth" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Set Up Your Account</a>
        </p>
        <p style="color:#444;margin-top:24px;">If the link above doesn't work, just go to <a href="https://creatorsctrl.com/auth" style="color:#6366f1;">creatorsctrl.com/auth</a> directly.</p>
        <p style="color:#444;margin-top:16px;"><strong>💬 Having trouble or questions?</strong> Text Kohl (our founder) directly at <strong>(425) 588-1480</strong> and he'll get you sorted out personally!</p>
        <p style="color:#888;font-size:13px;margin-top:32px;">The Creatorsctrl Team</p>
      </div>
    `,
  };
}

function getDay2Email(name: string, missingSteps: string[]): { subject: string; html: string } {
  const stepsHtml = missingSteps.map((s) => `<li>${s}</li>`).join("");
  return {
    subject: `${name}, don't forget to finish your setup! ⏳`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="color:#111;">Hey ${name}, just checking in! 🙌</h2>
        <p style="color:#444;">We noticed you still have a few things to wrap up before you can start earning:</p>
        <ul style="color:#444; line-height:1.8;">${stepsHtml}</ul>
        <p style="color:#444;">It only takes a few minutes to get everything set up. The sooner you're ready, the sooner you start making money! 💰</p>
        <p style="margin-top:24px;">
          <a href="https://creatorsctrl.com/auth" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Complete Setup</a>
        </p>
        <p style="color:#888;font-size:13px;margin-top:32px;">Need help? Text Kohl (our founder) directly: <strong>(425) 588-1480</strong></p>
      </div>
    `,
  };
}

function getDay5Email(name: string, missingSteps: string[]): { subject: string; html: string } {
  const stepsHtml = missingSteps.map((s) => `<li>${s}</li>`).join("");
  return {
    subject: `${name}, your spot is waiting — finish setting up! 🎯`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="color:#111;">Hey ${name}, we'd hate to see you miss out! 😊</h2>
        <p style="color:#444;">You were approved to join Creatorsctrl 5 days ago, but it looks like you haven't finished setting up yet.</p>
        <p style="color:#444;">Here's what's left:</p>
        <ul style="color:#444; line-height:1.8;">${stepsHtml}</ul>
        <p style="color:#444;">Other creators in the program are already earning — we want you to be next!</p>
        <p style="color:#444;"><strong>💬 Text Kohl (the founder) directly at (425) 588-1480</strong> if you need any help getting set up. He'll walk you through it personally.</p>
        <p style="margin-top:24px;">
          <a href="https://creatorsctrl.com/auth" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Finish Setup Now</a>
        </p>
        <p style="color:#888;font-size:13px;margin-top:32px;">The Creatorsctrl Team</p>
      </div>
    `,
  };
}

function getDay7Email(name: string, missingSteps: string[]): { subject: string; html: string } {
  const stepsHtml = missingSteps.map((s) => `<li>${s}</li>`).join("");
  return {
    subject: `${name}, it's been a week — let's get you earning! ⏰`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="color:#111;">Hey ${name}, it's been a week! 👋</h2>
        <p style="color:#444;">We approved you to join Creatorsctrl 7 days ago, and we really don't want you to miss out on this opportunity.</p>
        <p style="color:#444;">You're <strong>so close</strong> — here's what's left:</p>
        <ul style="color:#444; line-height:1.8;">${stepsHtml}</ul>
        <p style="color:#444;">Other creators who joined around the same time are already submitting videos and earning commissions. We want you to be right there with them! 💪</p>
        <p style="color:#444;"><strong>💬 Need help? Text Kohl (our founder) directly at (425) 588-1480</strong> — he'll personally walk you through it in 5 minutes.</p>
        <p style="margin-top:24px;">
          <a href="https://creatorsctrl.com/auth" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Finish Setup Now</a>
        </p>
        <p style="color:#888;font-size:13px;margin-top:32px;">The Creatorsctrl Team</p>
      </div>
    `,
  };
}

function getDay10Email(name: string, brandName: string): { subject: string; html: string } {
  return {
    subject: `You're invited to join ${brandName} on Creatorsctrl! 🎉`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f4f4f5;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <div style="text-align:center;margin-bottom:28px;">
    <span style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:white;padding:10px 20px;border-radius:10px;font-weight:700;font-size:18px;">Creatorsctrl</span>
  </div>
  <h2 style="color:#1f2937;text-align:center;margin:0 0 20px 0;">YOU'RE INVITED! 🎉</h2>
  <p style="color:#4b5563;font-size:16px;margin:0 0 12px 0;line-height:1.6;">Hey ${name}, you've been invited to join <strong>${brandName}</strong> as a creator on Creatorsctrl.</p>
  <p style="color:#4b5563;font-size:16px;margin:0 0 12px 0;line-height:1.6;">Click the button below to create your account and get started.</p>
  <div style="text-align:center;margin:28px 0 12px 0;">
    <a href="https://creatorsctrl.com/auth" style="display:inline-block;background-color:#8B5CF6;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Accept Invitation</a>
  </div>
  <h3 style="color:#1f2937;margin:28px 0 12px 0;">What's next?</h3>
  <ul style="color:#4b5563;font-size:15px;line-height:2;">
    <li>Create your account with your name and password</li>
    <li>Set up your creator profile</li>
    <li>Start creating content for ${brandName}</li>
  </ul>
  <div style="margin-top:36px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;">If you didn't expect this invitation, you can safely ignore this email.</p>
  </div>
</div></body></html>`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: approvedApps, error: appsErr } = await supabase
      .from("referral_applications")
      .select("id, email, full_name, reviewed_at")
      .eq("status", "approved")
      .not("reviewed_at", "is", null);

    if (appsErr) throw appsErr;
    if (!approvedApps?.length) {
      return new Response(JSON.stringify({ message: "No approved applications to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appIds = approvedApps.map((a) => a.id);
    const { data: sentReminders } = await supabase
      .from("onboarding_reminders")
      .select("application_id, reminder_day")
      .in("application_id", appIds);

    const sentSet = new Set(
      (sentReminders || []).map((r: any) => `${r.application_id}_${r.reminder_day}`)
    );

    const now = new Date();
    let emailsSent = 0;

    for (const app of approvedApps) {
      const approvedAt = new Date(app.reviewed_at);
      const hoursSinceApproval = (now.getTime() - approvedAt.getTime()) / (1000 * 60 * 60);

      // Check onboarding steps
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, stripe_onboarding_complete, user_id")
        .eq("email", app.email)
        .maybeSingle();

      const hasAccount = !!profile;
      const hasStripe = profile?.stripe_onboarding_complete === true;

      let hasSample = false;
      let hasVideo = false;

      if (profile) {
        const { count: sampleCount } = await supabase
          .from("sample_requests")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", profile.id);
        hasSample = (sampleCount || 0) > 0;

        const { count: videoCount } = await supabase
          .from("videos")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", profile.id);
        hasVideo = (videoCount || 0) > 0;
      }

      if (hasAccount && hasStripe && hasSample && hasVideo) continue;

      const missingSteps: string[] = [];
      if (!hasAccount) missingSteps.push("Create your account at creatorsctrl.com");
      if (!hasStripe) missingSteps.push("Connect your Stripe account for payouts");
      if (!hasSample) missingSteps.push("Request your free product sample");
      if (!hasVideo) missingSteps.push("Submit your first video");

      // Look up the creator's brand name for Day 10 re-invite
      let brandName = "Creatorsctrl";
      if (profile) {
        const { data: creatorBrand } = await supabase
          .from("creator_brands")
          .select("brand_id, brands(name)")
          .eq("creator_id", profile.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (creatorBrand?.brands && typeof creatorBrand.brands === "object" && "name" in creatorBrand.brands) {
          brandName = (creatorBrand.brands as any).name;
        }
      }

      for (const slot of REMINDER_SLOTS) {
        if (hoursSinceApproval < slot.minHours) continue;
        const key = `${app.id}_${slot.key}`;
        if (sentSet.has(key)) continue;

        let emailContent: { subject: string; html: string };
        if (slot.key === 10) {
          emailContent = getDay1Email(app.full_name);
        } else if (slot.key === 15) {
          emailContent = getDay1EveningEmail(app.full_name);
        } else if (slot.key === 20) {
          emailContent = getDay2Email(app.full_name, missingSteps);
        } else if (slot.key === 50) {
          emailContent = getDay5Email(app.full_name, missingSteps);
        } else if (slot.key === 70) {
          emailContent = getDay7Email(app.full_name, missingSteps);
        } else {
          emailContent = getDay10Email(app.full_name, brandName);
        }

        const { error: emailErr } = await resend.emails.send({
          from: "Creatorsctrl <noreply@seyagarments.com>",
          to: app.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        if (emailErr) {
          console.error(`Failed to send slot ${slot.key} reminder to ${app.email}:`, emailErr);
          continue;
        }

        await supabase.from("onboarding_reminders").insert({
          application_id: app.id,
          email: app.email,
          reminder_day: slot.key,
        });

        emailsSent++;
        console.log(`Sent ${slot.label} reminder to ${app.full_name} (${app.email})`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, emails_sent: emailsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Onboarding reminder error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
