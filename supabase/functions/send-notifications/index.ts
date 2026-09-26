// Supabase Edge Function: send-notifications
//
// Drains public.notification_outbox and emails recipients via Resend.
// Invoked once a minute by pg_cron (migration 20260927000100), never by
// the browser or the Next.js app.
//
// Trust model:
// - Caller auth: a shared secret header (x-cron-secret) compared in
//   constant time. Deploy with --no-verify-jwt: the anon key is public,
//   so JWT verification alone would not restrict who can trigger a run.
// - DB access: SUPABASE_SERVICE_ROLE_KEY, auto-injected by the Edge
//   runtime (never in git, never in the app). It is used ONLY to call the
//   two service_role-only RPCs claim_notification_batch /
//   complete_notification — no table access.
// - Secrets (set via `supabase secrets set`, never committed):
//   RESEND_API_KEY, NOTIFICATIONS_FROM, APP_BASE_URL, NOTIFICATIONS_CRON_SECRET.
// - Logs contain notification ids and outcomes only — never email
//   addresses, links, or provider responses.

import { buildLink, isNotificationKind, renderEmail } from './templates.ts'

type ClaimedRow = {
  notification_id: string
  notification_kind: string
  relationship_id: string
  entity_id: string
  recipient_email: string | null
  attempt: number
}

type Config = { resendApiKey: string; from: string; appBaseUrl: string }

type Outcome = { outcome: 'sent'; providerMessageId: string } | { outcome: 'retry' | 'failed'; error: string }

// Small enough that a full batch (spacing + Resend latency) finishes well
// inside the 30s pg_net timeout of the cron call.
const BATCH_SIZE = 10
// Resend's default rate limit is 2 requests/second.
const SEND_INTERVAL_MS = 600

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing_env_${name}`)
  return value
}

const PROBE_UUID = '00000000-0000-4000-8000-000000000000'

// Validated BEFORE claiming anything: a claim increments attempts, so a
// misconfiguration discovered per row would burn every queued
// notification into 'failed'. Misconfigured => claim nothing.
function loadConfig(): Config | null {
  try {
    const config: Config = {
      resendApiKey: env('RESEND_API_KEY'),
      from: env('NOTIFICATIONS_FROM'),
      appBaseUrl: env('APP_BASE_URL'),
    }
    env('SUPABASE_URL')
    env('SUPABASE_SERVICE_ROLE_KEY')
    if (!buildLink(config.appBaseUrl, 'expense_submitted', PROBE_UUID, PROBE_UUID)) return null
    return config
  } catch {
    return null
  }
}

async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(da)
  const y = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`rpc_${name}_http_${res.status}`)
  const body = await res.text()
  return (body ? JSON.parse(body) : null) as T
}

async function sendOne(row: ClaimedRow, config: Config): Promise<Outcome> {
  if (!isNotificationKind(row.notification_kind)) return { outcome: 'failed', error: 'unknown_kind' }
  if (!row.recipient_email) return { outcome: 'failed', error: 'recipient_has_no_email' }

  const link = buildLink(config.appBaseUrl, row.notification_kind, row.relationship_id, row.entity_id)
  if (!link) return { outcome: 'failed', error: 'invalid_link' }

  const email = renderEmail(row.notification_kind, link)

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
        // Same key on every retry of this outbox row: Resend drops duplicates
        // (e.g. first send succeeded but complete_notification didn't land).
        'Idempotency-Key': `notification-${row.notification_id}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [row.recipient_email],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    })
  } catch {
    return { outcome: 'retry', error: 'network_error' }
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    return { outcome: 'sent', providerMessageId: body.id ?? '' }
  }
  // 429 / 5xx are transient; any other 4xx (bad address, unverified
  // domain, invalid payload) will not fix itself on retry. That includes
  // 409 (idempotency key reused with a different payload, e.g. if
  // APP_BASE_URL changed between retries): accepted, marked failed.
  if (res.status === 429 || res.status >= 500) return { outcome: 'retry', error: `resend_http_${res.status}` }
  return { outcome: 'failed', error: `resend_http_${res.status}` }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Unauthenticated callers get the same 401 whether or not the function
  // is configured. A missing/short secret disables the function entirely.
  const secret = Deno.env.get('NOTIFICATIONS_CRON_SECRET') ?? ''
  if (secret.length < 32) {
    console.error('send-notifications: NOTIFICATIONS_CRON_SECRET missing or shorter than 32 chars')
    return new Response('Unauthorized', { status: 401 })
  }
  if (!(await constantTimeEquals(req.headers.get('x-cron-secret') ?? '', secret))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const config = loadConfig()
  if (!config) {
    console.error('send-notifications: configuration invalid; nothing claimed')
    return new Response('Not configured', { status: 500 })
  }

  let rows: ClaimedRow[]
  try {
    rows = (await rpc<ClaimedRow[]>('claim_notification_batch', { p_limit: BATCH_SIZE })) ?? []
  } catch (error) {
    console.error('send-notifications: claim failed', (error as Error).message)
    return new Response('Claim failed', { status: 500 })
  }

  const summary = { claimed: rows.length, sent: 0, retry: 0, failed: 0 }

  for (const [index, row] of rows.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, SEND_INTERVAL_MS))

    let result: Outcome
    try {
      result = await sendOne(row, config)
    } catch (error) {
      result = { outcome: 'retry', error: (error as Error).message.slice(0, 100) }
    }
    summary[result.outcome]++

    try {
      await rpc('complete_notification', {
        p_id: row.notification_id,
        p_outcome: result.outcome,
        p_error: result.outcome === 'sent' ? null : result.error,
        p_provider_message_id: result.outcome === 'sent' ? result.providerMessageId : null,
      })
    } catch (error) {
      // Row stays 'processing' and is reclaimed after 15 minutes; the
      // idempotency key keeps a resend from duplicating the email.
      console.error('send-notifications: complete failed', row.notification_id, (error as Error).message)
    }
    console.log('send-notifications:', row.notification_id, result.outcome)
  }

  return Response.json(summary)
})
