-- Daily review digest (2026-10-20).
-- Per-event emails (per upload, per approval, per decline) are gone. Instead one function,
-- send-daily-review-digest, runs once a day and emails each creator who had approvals since the
-- last run, plus one overview to the admins. Nothing is sent on a day with no approvals.

-- 1. When was a decision made? approved_at already exists for approvals; reviewed_at covers all
--    three decisions (approved, rejected, revision_requested) so the digest can list them.
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
UPDATE public.videos SET reviewed_at = approved_at WHERE reviewed_at IS NULL AND approved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS videos_reviewed_at_idx ON public.videos (reviewed_at);
CREATE INDEX IF NOT EXISTS videos_approved_at_idx ON public.videos (approved_at);

-- 2. The digest window is (last_run, now]. Seeding last_run = now means nothing reviewed before
--    this migration is ever digested.
INSERT INTO public.settings (key, value)
VALUES ('review_digest', jsonb_build_object('last_run', now()))
ON CONFLICT (key) DO NOTHING;

-- 3. Schedule. 07:00 UTC = 00:00 PDT / 23:00 PST. The URL and the shared key live in Vault, set
--    once per project by hand (never in git):
--      select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-daily-review-digest', 'review_digest_url');
--      select vault.create_secret('<random>', 'review_digest_cron_key');
--    and the same random value as the function secret REVIEW_DIGEST_CRON_KEY.
--    With either Vault row missing, http_post gets a null URL and the run fails harmlessly in
--    cron.job_run_details.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-daily-review-digest';
SELECT cron.schedule(
  'send-daily-review-digest',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'review_digest_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'review_digest_cron_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
