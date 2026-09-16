-- Remove the hourly cron job installed by 20260830005029. It POSTs to
-- https://mhrvfmlzeabkxnodxcve.supabase.co, a Lovable-era project that is not ours, with no
-- Authorization header, so it has never done anything but fail once an hour.
-- If AI agents should ever run on a schedule, that is a new job pointed at THIS project with a
-- service-role bearer header, decided separately.
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'ai-agent-run-hourly' OR command LIKE '%mhrvfmlzeabkxnodxcve%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;
