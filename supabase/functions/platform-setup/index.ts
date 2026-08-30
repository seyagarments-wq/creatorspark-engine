import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Credentials an admin can manage from the in-app Setup page.
const ALLOWED_KEYS = [
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_ACCESS_TOKEN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_SYSTEM_USER_TOKEN",
  "META_AD_ACCOUNT_ID",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LOVABLE_API_KEY",
  "AI_MODEL",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "APPLE_PUSH_FUNCTION_URL",
  "APPLE_PUSH_AUTH_SECRET",
  "FACEBOOK_OAUTH_SCOPES",
  "APP_URL",
  "SITE_URL",
] as const;


const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function mask(value: string) {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Invalid token" }, 401);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) return json({ error: "Admin access required" }, 403);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? "status";

    // Values stored in the database by an admin
    const { data: rows } = await supabase
      .from("platform_secrets")
      .select("key, value, updated_at");
    const stored = new Map((rows ?? []).map((r) => [r.key as string, r]));

    const buildStatus = () =>
      ALLOWED_KEYS.map((key) => {
        const envValue = Deno.env.get(key);
        const row = stored.get(key);
        const value = envValue || (row?.value as string | undefined);
        return {
          key,
          configured: !!value,
          source: envValue ? "environment" : row ? "app" : null,
          preview: value ? mask(value) : null,
          updated_at: row?.updated_at ?? null,
          editable: !envValue,
        };
      });

    if (action === "status") return json({ settings: buildStatus() });

    if (action === "save") {
      const entries: { key: string; value: string }[] = body.entries ?? [];
      const invalid = entries.filter((e) => !ALLOWED_KEYS.includes(e.key as never));
      if (invalid.length) return json({ error: `Unknown keys: ${invalid.map((i) => i.key).join(", ")}` }, 400);

      for (const entry of entries) {
        const value = (entry.value ?? "").trim();
        if (!value) {
          await supabase.from("platform_secrets").delete().eq("key", entry.key);
          continue;
        }
        await supabase.from("platform_secrets").upsert(
          { key: entry.key, value, updated_at: new Date().toISOString(), updated_by: user.id },
          { onConflict: "key" },
        );
      }
      const { data: fresh } = await supabase.from("platform_secrets").select("key, value, updated_at");
      stored.clear();
      for (const r of fresh ?? []) stored.set(r.key as string, r);
      return json({ ok: true, settings: buildStatus() });
    }

    if (action === "test") {
      const get = (key: string) => Deno.env.get(key) || (stored.get(key)?.value as string | undefined);
      const service = body.service as string;

      if (service === "shopify") {
        const domain = get("SHOPIFY_STORE_DOMAIN");
        const shopToken = get("SHOPIFY_ACCESS_TOKEN");
        if (!domain || !shopToken) return json({ ok: false, message: "Store domain and Admin API token are required." });
        const res = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
          headers: { "X-Shopify-Access-Token": shopToken },
        });
        if (!res.ok) return json({ ok: false, message: `Shopify responded ${res.status}. Check the Admin API token.` });
        const data = await res.json();
        return json({ ok: true, message: `Connected to ${data?.shop?.name ?? domain}.` });
      }

      if (service === "resend") {
        const key = get("RESEND_API_KEY");
        if (!key) return json({ ok: false, message: "Resend API key is missing." });
        const res = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) return json({ ok: false, message: `Resend responded ${res.status}. Check the API key.` });
        const data = await res.json();
        const domains = (data?.data ?? []).map((d: { name: string }) => d.name).join(", ");
        return json({ ok: true, message: domains ? `Connected. Sending domains: ${domains}` : "Connected. No sending domain added yet." });
      }

      if (service === "stripe") {
        const key = get("STRIPE_SECRET_KEY");
        if (!key) return json({ ok: false, message: "Stripe secret key is missing." });
        const res = await fetch("https://api.stripe.com/v1/account", {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) return json({ ok: false, message: `Stripe responded ${res.status}. Check the secret key.` });
        const data = await res.json();
        return json({ ok: true, message: `Connected to ${data?.business_profile?.name || data?.id}.` });
      }

      if (service === "meta") {
        const metaToken = get("META_SYSTEM_USER_TOKEN");
        if (!metaToken) return json({ ok: false, message: "Meta system-user token is missing." });
        const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(metaToken)}`);
        const data = await res.json();
        if (!res.ok) return json({ ok: false, message: data?.error?.message ?? `Meta responded ${res.status}.` });
        return json({ ok: true, message: `Connected as ${data?.name ?? data?.id}.` });

      if (service === "ai") {
        const model = get("AI_MODEL");
        const openai = get("OPENAI_API_KEY");
        const lovable = get("LOVABLE_API_KEY");
        const anthropic = get("ANTHROPIC_API_KEY");

        if (openai) {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openai}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: model || "gpt-4o-mini",
              messages: [{ role: "user", content: "Reply with the word ok." }],
            }),
          });
          if (!res.ok) {
            const detail = await res.text();
            return json({ ok: false, message: `OpenAI responded ${res.status}. ${detail.slice(0, 160)}` });
          }
          return json({ ok: true, message: `AI is live via OpenAI (${model || "gpt-4o-mini"}).` });
        }

        if (lovable) {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${lovable}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: model || "openai/gpt-5.6-sol",
              messages: [{ role: "user", content: "Reply with the word ok." }],
            }),
          });
          if (!res.ok) {
            const detail = await res.text();
            return json({ ok: false, message: `AI gateway responded ${res.status}. ${detail.slice(0, 160)}` });
          }
          return json({ ok: true, message: `AI is live via the Lovable gateway (${model || "openai/gpt-5.6-sol"}).` });
        }

        if (anthropic) {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": anthropic,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model || "claude-sonnet-4-20250514",
              max_tokens: 16,
              messages: [{ role: "user", content: "Reply with the word ok." }],
            }),
          });
          if (!res.ok) {
            const detail = await res.text();
            return json({ ok: false, message: `Anthropic responded ${res.status}. ${detail.slice(0, 160)}` });
          }
          return json({
            ok: true,
            message: `AI is live via Anthropic (${model || "claude-sonnet-4-20250514"}). Note: the AI assistant/agents need an OpenAI key.`,
          });
        }

        return json({ ok: false, message: "Add an OpenAI, Lovable or Anthropic key first." });
      }

      if (service === "push") {
        const publicKey = get("VAPID_PUBLIC_KEY");
        if (!publicKey) return json({ ok: false, message: "VAPID public key is missing." });
        if (!get("VAPID_PRIVATE_KEY")) {
          return json({ ok: false, message: "VAPID public key saved, but the private key is missing." });
        }
        if (publicKey.length < 80) {
          return json({ ok: false, message: "That does not look like a VAPID public key (should be ~87 characters)." });
        }
        return json({ ok: true, message: "Push keys look valid." });
      }

      return json({ error: "Unknown service" }, 400);

    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("platform-setup error", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
