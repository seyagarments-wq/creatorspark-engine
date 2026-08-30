import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getSecret } from "../_shared/secrets.ts";

function welcomeEmailHtml(firstName: string, brandName: string, appUrl: string): string {
  const setupUrl = `${appUrl.replace(/\/$/, "")}/admin/setup`;
  const step = (n: number, title: string, body: string) => `
    <tr><td style="padding:0 0 18px 0;">
      <table role="presentation" width="100%"><tr>
        <td width="34" valign="top">
          <div style="width:26px;height:26px;border-radius:999px;background:#2563eb;color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:26px;">${n}</div>
        </td>
        <td valign="top">
          <p style="margin:2px 0 4px 0;font-size:15px;font-weight:600;color:#0f172a;">${title}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">${body}</p>
        </td>
      </tr></table>
    </td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:18px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;padding:10px 20px;border-radius:12px;font-weight:700;font-size:18px;">Creators Control</span>
  </div>

  <h1 style="margin:0 0 8px 0;font-size:24px;color:#0f172a;">You're the boss now, ${firstName} 👑</h1>
  <p style="margin:0 0 22px 0;font-size:16px;line-height:1.6;color:#475569;">
    Your owner account for <strong>${brandName}</strong> is live. Everything below takes about 10 minutes,
    and you never need a developer for any of it. Grab a coffee — let's switch the lights on.
  </p>

  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin:0 0 24px 0;">
    <p style="margin:0;font-size:14px;color:#1e3a8a;line-height:1.6;">
      <strong>Your one stop shop:</strong> everything is configured at
      <a href="${setupUrl}" style="color:#2563eb;">Admin → Setup</a>. Each field has a "Test connection"
      button — green means you're done, red means paste it again. That's the whole game.
    </p>
  </div>

  <table role="presentation" width="100%">
    ${step(1, "Sign in and land on Setup", `Go to <a href="${setupUrl}" style="color:#2563eb;">${setupUrl}</a> and log in with this email address. Bookmark it — it's your control room.`)}
    ${step(2, "Email (Resend) — do this one first", `Create a key at resend.com, verify your sending domain, paste the key in the <em>Email</em> card and hit Test. This unlocks creator invites, payout notices and reminders.`)}
    ${step(3, "Shopify — products & samples", `Shopify Admin → Settings → Apps → Develop apps → create an app, give it product + order read/write scopes, install it, then paste the store domain (<em>yourstore.myshopify.com</em>) and the Admin API token.`)}
    ${step(4, "Stripe — paying your creators", `Grab your live secret key (<em>sk_live_…</em>) from the Stripe dashboard and paste it in. Creators then connect their own accounts and payouts run from Admin → Payouts.`)}
    ${step(5, "Meta — ads & performance data", `Add your App ID, App Secret, system-user token and ad account ID (<em>act_…</em>) to pull real ad performance into the dashboard and launch creator videos as ads.`)}
    ${step(6, "AI assistant — pick your brain", `Paste an OpenAI or Anthropic key. This powers brief generation, hook scoring and the ads command bot. Skip it if you want — everything else still works.`)}
    ${step(7, "Invite your first creators", `Admin → Creators → Invite. They get an email, set their own password, and land straight in their dashboard. Watch the submissions roll in.`)}
  </table>

  <div style="text-align:center;margin:28px 0 8px 0;">
    <a href="${setupUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 30px;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;">Open my Setup page</a>
  </div>

  <div style="background:#f8fafc;border-radius:12px;padding:14px 16px;margin:24px 0 0 0;">
    <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#0f172a;">Two things worth knowing</p>
    <p style="margin:0 0 6px 0;font-size:13px;line-height:1.6;color:#475569;">• Your keys are stored server-side only — creators and admins can never read them back.</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">• The owner setup page is now closed for good. New admins come in by invite only.</p>
  </div>

  <p style="margin:26px 0 0 0;font-size:13px;color:#94a3b8;text-align:center;">
    Sent to you because you created the owner account for ${brandName} on Creators Control.
  </p>
</div></body></html>`;
}

async function sendWelcomeEmail(email: string, fullName: string, brandName: string) {
  try {
    const apiKey = await getSecret("RESEND_API_KEY");
    if (!apiKey) {
      console.log("RESEND_API_KEY not configured — skipping welcome email");
      return;
    }
    const appUrl = (await getSecret("APP_URL")) || "https://creators.seyagarments.com";
    const from = (await getSecret("EMAIL_FROM")) || "Creators Control <noreply@seyagarments.com>";
    const firstName = fullName.split(" ")[0] || "there";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Welcome aboard — here's how to switch on ${brandName} 🚀`,
        html: welcomeEmailHtml(firstName, brandName, appUrl),
      }),
    });
    if (!res.ok) console.error("welcome email failed", await res.text());
  } catch (e) {
    console.error("welcome email error", e);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? "status";

    // Does the platform already have an owner/admin?
    const { count, error: countError } = await supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) throw new Error(countError.message);
    const adminExists = (count ?? 0) > 0;

    if (action === "status") {
      return json({ needsSetup: !adminExists });
    }

    if (action !== "create") return json({ error: "Unknown action" }, 400);

    if (adminExists) {
      return json({ error: "This platform has already been set up. Ask an existing admin for an invite." }, 409);
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const brandName = String(body.brand_name ?? "").trim();
    const websiteUrl = String(body.website_url ?? "").trim();
    const commissionRate = Number(body.commission_rate ?? 10);

    if (!email.includes("@")) return json({ error: "Enter a valid email address." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    if (fullName.length < 2) return json({ error: "Enter your full name." }, 400);
    if (brandName.length < 2) return json({ error: "Enter your brand name." }, 400);

    // 1. Create the auth user (auto-confirmed so they can sign in immediately)
    const { data: created, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (authError) return json({ error: authError.message }, 400);

    const userId = created.user.id;

    // 2. Profile
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingProfile) {
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: userId,
        email,
        full_name: fullName,
        status: "active",
      });
      if (profileError) console.error("profile insert failed", profileError);
    }

    // 3. Admin role
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (roleError) {
      console.error("role insert failed", roleError);
      return json({ error: `Account created but admin role failed: ${roleError.message}` }, 500);
    }

    // 4. Brand — reuse the seeded row if there is exactly one, otherwise create
    const { data: brands } = await supabase.from("brands").select("id").limit(2);
    const brandPayload = {
      name: brandName,
      website_url: websiteUrl || null,
      commission_rate: Number.isFinite(commissionRate) ? commissionRate : 10,
      is_active: true,
    };

    if (brands && brands.length === 1) {
      await supabase.from("brands").update(brandPayload).eq("id", brands[0].id);
    } else if (!brands || brands.length === 0) {
      await supabase.from("brands").insert(brandPayload);
    }

    await sendWelcomeEmail(email, fullName, brandName);

    return json({ success: true, user_id: userId });
  } catch (error) {
    console.error("owner-bootstrap error", error);
    return json({ error: (error as Error).message }, 500);
  }
});
