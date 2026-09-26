// Supabase Edge Function: send-notifications
//
// Drains public.notification_outbox and emails recipients via Resend.
// Invoked once a minute by pg_cron (migration 20260927000100), never by
// the browser or the Next.js app. All logic lives in lib.ts (tested under
// Node in ../_tests); this file only binds it to the Deno runtime.
//
// Trust model:
// - Caller auth: a shared secret header (x-cron-secret, >= 32 chars)
//   compared in constant time. verify_jwt is off (supabase/config.toml):
//   the anon key is public, so JWT verification alone would not restrict
//   who can trigger a run.
// - DB access: SUPABASE_SERVICE_ROLE_KEY, auto-injected by the Edge
//   runtime (never in git, never in the app). The outbox table itself is
//   revoked from service_role; the key can only call the two
//   service_role-only RPCs claim_notification_batch / complete_notification.
// - Secrets (Dashboard -> Edge Functions -> Secrets, never committed):
//   RESEND_API_KEY, NOTIFICATIONS_FROM, APP_BASE_URL,
//   NOTIFICATIONS_CRON_SECRET, and NOTIFICATIONS_ALLOW_LOCALHOST_LINKS
//   (pre-production acceptance only).
// - Logs contain notification ids, outcomes and setting NAMES only —
//   never email addresses, links, secret values, or provider responses.

import { handleRequest } from './lib.ts'

Deno.serve((req) =>
  handleRequest(req, {
    getEnv: (name) => Deno.env.get(name),
    fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    log: console.log,
    logError: console.error,
  })
)
