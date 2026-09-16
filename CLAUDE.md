# Creators Control (repo: creatorspark-engine)

Seya Garments' creator platform. React 18 + Vite 5 + TS + Tailwind + shadcn/ui on Supabase, deployed by
Vercel from `main`. The durable documentation lives in Kohl's Brain vault, not here:
`~/Documents/Brain/app-development/` (read `app-status.md` first, then `app-build-protocol.md`).

## Rules that are not negotiable
- **Never commit to `main` without Kohl's explicit approval.** Every push to `main` is a production
  deploy (no staging on Vercel, no branch protection). Work on a branch; its preview URL is the test.
- **Never run `supabase db push` against production** (`abqfarkftkbkmmzozdyv`). Its migration history
  table records none of the repo's migrations; a push would replay them all. Apply production
  migrations through the Supabase MCP `apply_migration` and keep the repo file as the record.
- **Backend before frontend.** Migrations → edge secrets → `functions deploy` → `functions delete`,
  then `git push origin main`.
- **The money rule.** Anything touching `payouts`, Stripe or PayPal: gate + a Stripe TEST key run on
  staging + Kohl's sign-off. `PAYOUTS_LIVE=true` and `PAYPAL_ENV=live` exist only on production.
- Roles live in `user_roles`. RLS is the authorization; `ProtectedRoute` is navigation.
- Any edge function with `verify_jwt = false` in `supabase/config.toml` checks auth as its first act.

## Environments
| | Production | Staging |
|---|---|---|
| Supabase | `abqfarkftkbkmmzozdyv` | `gmimrunaoeymmnqlzimy` |
| Frontend | `creatorspark-engine.vercel.app` | every Vercel preview; locally `npm run dev -- --mode staging` |
| Local env file | `.env` (public `VITE_` values only) | `.env.staging.local` (gitignored) |
| Test logins | real creators, do not test here | synthetic users listed in `.staging-credentials.local` (gitignored) |
| Reseed | never | `supabase/seed/staging.sql` |

## Daily commands
```bash
npx --yes bun@latest install                 # Vercel builds with bun from bun.lock; do not use npm install
npm run dev -- --mode staging                 # http://localhost:8080 against staging
npx tsc --noEmit -p tsconfig.app.json         # the gate Vite does not run
npm run test                                  # vitest: upload pre-flight, error classification, pay math
npm run build
npx eslint <files you touched>                # no NEW errors; the baseline is noisy
node_modules/.bin/supabase db push            # STAGING ONLY, from a checkout linked to staging
node_modules/.bin/supabase gen types typescript --linked > src/integrations/supabase/types.ts
node_modules/.bin/supabase functions deploy <name> --project-ref <ref>
```

## Where things live
- Upload: `src/pages/creator/CreatorSubmit.tsx` + `src/lib/resumable-upload.ts` (TUS, 6 MB chunks),
  `src/lib/upload-limits.ts` (1 GiB, keep in step with the `videos` bucket), `src/lib/upload-guard.ts`.
- Pay engine: migration `supabase/migrations/20260916020000_pay_engine.sql` (ledger `video_earnings`,
  triggers, `open_due_payouts`, daily cron); rates in `settings.pay_rates`; edge `payout-cycle`,
  `process-payout`, `process-bulk-payouts` → `supabase/functions/_shared/payout-rails.ts` (the only
  place money moves) and `payout-guard.ts`; pure math + tests in `_shared/payout-math.ts`.
- Settings hook: `src/hooks/use-settings.ts` (`upload_schedule`, `pay_rates`).
- Edge secret names are exact (`STRIPE_SECRET_KEY`); values cannot be read back through the API.

## Program facts the code must keep true
$65 per approved non-bounty video, credited on approval, reversed if un-approved before payment,
final once paid. Bonus 3% / 4% / 5% of attributed revenue at $0 / $10k / $50k on the creator's own
28-day cycle, shown on its own page. Cycle anchored on the first APPROVED video. One global upload
day (Friday). Nothing pays automatically; an admin presses Pay. No XP, streaks, tiers, required days
or forfeits, ever again.
