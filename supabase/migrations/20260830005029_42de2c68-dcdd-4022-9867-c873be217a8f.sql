
select cron.schedule(
  'ai-agent-run-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url:='https://mhrvfmlzeabkxnodxcve.supabase.co/functions/v1/ai-agent-run',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
