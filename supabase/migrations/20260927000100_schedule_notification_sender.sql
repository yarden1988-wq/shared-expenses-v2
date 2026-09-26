-- Migration: schedule_notification_sender
-- NOT YET APPLIED — and must NOT be applied until ALL of these are done
-- (each is its own owner-approved step, see docs/runbooks/notifications-rollout.md):
--   1. 20260927000000_add_notification_outbox.sql applied and verified
--   2. Edge Function `send-notifications` deployed (verify_jwt = false),
--      with its secrets set (RESEND_API_KEY, NOTIFICATIONS_FROM,
--      APP_BASE_URL, NOTIFICATIONS_CRON_SECRET) and a verified Resend
--      sending domain
--   3. Two Vault secrets created (Dashboard -> Vault, never in git):
--        notifications_function_url  = https://<project-ref>.supabase.co/functions/v1/send-notifications
--        notifications_cron_secret   = the same value as the function's NOTIFICATIONS_CRON_SECRET
--
-- Schedules a pg_cron job that POSTs to the Edge Function once a minute
-- via pg_net. The job reads both values from Vault at run time, so this
-- file contains no secrets and no project-specific URL. If either Vault
-- secret is missing the job makes no call at all (no per-minute errors);
-- the signal then is outbox rows staying 'pending'.
--
-- Pre-apply read-only checks (expected results in brackets):
--   select count(*) from vault.decrypted_secrets
--    where name in ('notifications_function_url', 'notifications_cron_secret');   [2]
--   select to_regnamespace('cron') is null
--       or not exists (select 1 from cron.job where jobname in ('send-notifications', 'purge-cron-history'));  [true]
--
-- Rollback (if ever needed):
--   select cron.unschedule('send-notifications'); select cron.unschedule('purge-cron-history');
--   (Leave pg_net / pg_cron installed: dropping pg_net drops schema net.)

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Supabase grants client roles USAGE on schema net + EXECUTE on its
-- functions (for Dashboard database webhooks, which this app doesn't use).
-- Clients have no business making outbound HTTP from the database, and
-- net.http_request_queue briefly holds the x-cron-secret header.
revoke execute on all functions in schema net from anon, authenticated;
revoke usage on schema net from anon, authenticated;

-- cron.schedule with an existing job name updates that job in place.
select cron.schedule(
  'send-notifications',
  '* * * * *',
  $job$
    select net.http_post(
      url := s.url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s.secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    from (
      select
        (select decrypted_secret from vault.decrypted_secrets where name = 'notifications_function_url') as url,
        (select decrypted_secret from vault.decrypted_secrets where name = 'notifications_cron_secret') as secret
    ) s
    where s.url is not null and s.secret is not null;
  $job$
);

-- Keep pg_cron's run history bounded (~1,440 rows/day from the job above).
select cron.schedule(
  'purge-cron-history',
  '0 3 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '7 days' $job$
);
