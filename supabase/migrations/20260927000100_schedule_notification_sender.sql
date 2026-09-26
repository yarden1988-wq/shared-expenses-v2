-- Migration: schedule_notification_sender
-- NOT YET APPLIED — and must NOT be applied until ALL of these are done
-- (each is its own owner-approved step, see docs/architecture/notifications.md):
--   1. 20260927000000_add_notification_outbox.sql applied and verified
--   2. Edge Function `send-notifications` deployed, with its secrets set
--      (RESEND_API_KEY, NOTIFICATIONS_FROM, APP_BASE_URL,
--      NOTIFICATIONS_CRON_SECRET) and a verified Resend sending domain
--   3. Two Vault secrets created (via Dashboard -> Vault, never in git):
--        notifications_function_url  = https://<project-ref>.supabase.co/functions/v1/send-notifications
--        notifications_cron_secret   = the same value as the function's NOTIFICATIONS_CRON_SECRET
--
-- Schedules a pg_cron job that POSTs to the Edge Function once a minute
-- via pg_net. The job reads both values from Vault at run time, so this
-- file contains no secrets and no project-specific URL. Until the outbox
-- has due rows, each run is a cheap no-op call.
--
-- Pre-apply read-only checks (expected results in brackets):
--   select name from vault.decrypted_secrets
--    where name in ('notifications_function_url', 'notifications_cron_secret');  [2 rows]
--   select count(*) from cron.job where jobname = 'send-notifications';          [0, or error if pg_cron not yet enabled]
--   -- pg_net keeps queued requests (incl. the x-cron-secret header) in
--   -- net.http_request_queue; clients must not be able to read it.   [false | false], or error if pg_net not yet enabled
--   select has_schema_privilege('authenticated', 'net', 'usage'),
--          has_table_privilege('authenticated', 'net.http_request_queue', 'select');
--   -- and confirm in Dashboard -> API settings that `net` is NOT an exposed schema.
--
-- Rollback (if ever needed): select cron.unschedule('send-notifications');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule with an existing job name updates that job in place.
select cron.schedule(
  'send-notifications',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'notifications_function_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notifications_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

-- Keep pg_cron's run history bounded (~1,440 rows/day from the job above).
select cron.schedule(
  'purge-cron-history',
  '0 3 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '7 days' $job$
);
