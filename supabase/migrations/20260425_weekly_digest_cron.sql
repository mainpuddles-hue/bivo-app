-- Weekly digest cron job — Monday 9:00 AM
-- Calls the send-digest Edge Function via net.http_post
-- The Edge Function sends neighborhood activity summaries via Resend email
-- NOTE: An existing 'weekly-digest' job (Sunday schedule) was updated to Monday.

-- Ensure no stale duplicate exists
SELECT cron.unschedule('send-weekly-digest');

-- The active job is 'weekly-digest' (hardcoded URL, matches other cron patterns)
-- Reschedule from Sunday → Monday
SELECT cron.unschedule('weekly-digest');
SELECT cron.schedule(
  'weekly-digest',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://wfsghkseyyxkkalcqtzq.supabase.co/functions/v1/send-digest',
    headers := '{"x-cron-secret": "fdfc982367827a5f3306d42da2ce68b8ae8f5fe46c374204ebe08a889e368484"}'::jsonb
  )
  $$
);
