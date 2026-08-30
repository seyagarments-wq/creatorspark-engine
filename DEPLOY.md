# Self-hosting on Vercel + Supabase

This app is a plain Vite + React SPA with a standard Supabase backend. Nothing in it
depends on Lovable at runtime — it keeps working after you move it.

## 1. Get the code

Connect the project to GitHub (Lovable: top-right GitHub button) or download the ZIP.
Then push that repo to your own GitHub account.

## 2. Supabase project

You are already on your own Supabase project (`abqfarkftkbkmmzozdyv`). To keep it, do nothing.
To create a fresh one:

```bash
supabase link --project-ref <your-ref>
supabase db push                  # applies supabase/migrations (116 files, in order)
supabase functions deploy         # deploys everything in supabase/functions (71)
```

Storage buckets needed (all public):
videos, avatars, photos, application-videos, brief-assets, chat-audio, chat-images,
plan-uploads, resources, stickers

Edge function secrets to set in Supabase → Edge Functions → Secrets:
`RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `META_APP_ID`, `META_APP_SECRET`,
`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`,
`APP_URL`, `SITE_URL`, `VAPID_PUBLIC_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
plus `ANTHROPIC_API_KEY` (or keep `LOVABLE_API_KEY` if you stay on the AI gateway).
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 3. Vercel

Import the GitHub repo. `vercel.json` in this repo already sets the build command,
output directory and the SPA rewrite, so deep links and refreshes work.

Environment variables (Project → Settings → Environment Variables):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable / anon key>
VITE_SUPABASE_PROJECT_ID=<ref>
VITE_VAPID_PUBLIC_KEY=<optional, for web push>
```

## 4. Domain and auth URLs

Point `creators.seyagarments.com` at Vercel, then in Supabase → Authentication → URL
Configuration set Site URL to `https://creators.seyagarments.com` and add it to
Redirect URLs. Update the same URL in the Meta app's OAuth redirect settings and in
Stripe/Resend where callbacks are configured.

## 5. Lovable-only bits (harmless, optional to remove)

- `lovable-tagger` in `vite.config.ts` — dev-mode only, stripped from production builds.
- `src/integrations/supabase/previewAuthStorage.ts` — falls back to plain `localStorage`
  on any non-Lovable host, so it is a no-op on your domain.

## Admin self-service setup

After deploying, sign in as an admin and open **Admin → Setup** (`/admin/setup`).
Every third-party credential (Shopify, Resend, Stripe, Meta, PayPal, AI keys, app URL)
can be entered there with step-by-step instructions and a "Test connection" button.

Values are stored in the `platform_secrets` table (service-role only, no client read access)
and resolved by edge functions via `supabase/functions/_shared/secrets.ts`:
environment variable first, then the admin-saved value. So you can either set
Supabase Edge Function secrets yourself, or let the admin do it in the app — both work.

## Client hand-off: everything is configured in-app

After the client signs in with their admin account, they open **Admin → Setup**
(`/admin/setup`) and fill in each card — no environment variables, no developer:

| Card | What it turns on |
| --- | --- |
| Shopify | Product picker + free sample orders |
| Resend | All outbound email |
| Stripe | Creator Connect payouts |
| Meta / Facebook Ads | Ad insights, uploads, campaign launches |
| PayPal (optional) | Alternative payouts |
| AI assistant & AI features | AI assistant/agents, brief generation, hook scores, digests |
| Push notifications (optional) | Web push (VAPID key pair) |
| App URLs | Email links + OAuth redirects |

Each card has step-by-step instructions, a masked "Saved" state, and a
**Test connection** button. Values are stored in `public.platform_secrets`
(service-role only) and every edge function reads the Supabase env var first and
falls back to the admin-saved value.

AI is provider-agnostic: OpenAI, Anthropic or a Lovable gateway key all work.
OpenAI is recommended because the AI assistant/agents use the Responses API
(OpenAI or Lovable gateway only). `AI_MODEL` optionally overrides the default model.
