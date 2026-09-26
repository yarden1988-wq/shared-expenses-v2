// All logic for the send-notifications Edge Function. No Deno globals:
// env, fetch and sleep are injected, so the full request handler runs
// under both Deno and `node --test` (see ../_tests).

import { buildLink, isNotificationKind, renderEmail } from './templates.ts'

export type Config = {
  resendApiKey: string
  from: string
  appBaseUrl: string
  supabaseUrl: string
  serviceRoleKey: string
}

export type Outcome =
  | { outcome: 'sent'; providerMessageId: string }
  | { outcome: 'retry' | 'failed'; error: string }

export type ConfigResult = { ok: true; config: Config } | { ok: false; missing: string[] }

export const MIN_CRON_SECRET_LENGTH = 32

const PROBE_UUID = '00000000-0000-4000-8000-000000000000'

// "Name <addr@domain>" or a bare address; no CR/LF (header injection).
const FROM_RE = /^(?:[^<>\r\n]{1,100} <[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/

// Validated BEFORE claiming anything: a claim increments attempts, so a
// misconfiguration discovered per row would burn every queued
// notification into 'failed'. Returns the names of bad/missing settings
// (never their values) so logs are useful without leaking secrets.
export function loadConfig(getEnv: (name: string) => string | undefined): ConfigResult {
  const read = (name: string) => (getEnv(name) ?? '').trim()
  const config: Config = {
    resendApiKey: read('RESEND_API_KEY'),
    from: read('NOTIFICATIONS_FROM'),
    appBaseUrl: read('APP_BASE_URL'),
    supabaseUrl: read('SUPABASE_URL'),
    serviceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),
  }

  const missing: string[] = []
  if (!config.resendApiKey.startsWith('re_')) missing.push('RESEND_API_KEY')
  if (!FROM_RE.test(config.from)) missing.push('NOTIFICATIONS_FROM')
  const probeLink = buildLink(config.appBaseUrl, 'expense_submitted', PROBE_UUID, PROBE_UUID)
  // Localhost links are only for pre-production acceptance and must be
  // opted into explicitly, so production can't email them by mistake.
  const isLocalLink = !!probeLink && new URL(probeLink).protocol === 'http:'
  if (!probeLink || (isLocalLink && read('NOTIFICATIONS_ALLOW_LOCALHOST_LINKS') !== 'true')) {
    missing.push('APP_BASE_URL')
  }
  if (!/^https:\/\/[^/\s]+$/.test(config.supabaseUrl.replace(/\/$/, ''))) missing.push('SUPABASE_URL')
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')

  config.supabaseUrl = config.supabaseUrl.replace(/\/$/, '')
  return missing.length === 0 ? { ok: true, config } : { ok: false, missing }
}

export async function constantTimeEquals(a: string, b: string): Promise<boolean> {
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

export async function isAuthorizedCaller(provided: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return false
  return constantTimeEquals(provided ?? '', secret)
}

// Maps a Resend HTTP result to an outbox outcome. 429 / 5xx are transient.
// Any other 4xx (bad address, unverified domain, invalid payload) won't fix
// itself on retry — including 409 (idempotency key reused with a different
// payload, e.g. APP_BASE_URL changed between retries): accepted, failed.
export function classifyResendResponse(status: number, body: { id?: unknown } | null): Outcome {
  if (status >= 200 && status < 300) {
    return { outcome: 'sent', providerMessageId: typeof body?.id === 'string' ? body.id : '' }
  }
  if (status === 429 || status >= 500) return { outcome: 'retry', error: `resend_http_${status}` }
  return { outcome: 'failed', error: `resend_http_${status}` }
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

export type ClaimedRow = {
  notification_id: string
  notification_kind: string
  relationship_id: string
  entity_id: string
  recipient_email: string | null
  attempt: number
}

export type Deps = {
  getEnv: (name: string) => string | undefined
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => number
  log: (...args: unknown[]) => void
  logError: (...args: unknown[]) => void
}

export const BATCH_SIZE = 10
// Resend's default rate limit is 2 requests/second.
export const SEND_INTERVAL_MS = 600
export const RESEND_TIMEOUT_MS = 5_000
// The cron caller (pg_net) stops waiting after 30s. Stop starting new
// sends after this budget; unsent claimed rows are completed as 'retry'
// right away (not left 'processing' for the 15-minute reclaim).
export const TIME_BUDGET_MS = 20_000

async function rpc<T>(deps: Deps, config: Config, name: string, args: Record<string, unknown>): Promise<T> {
  const res = await deps.fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`rpc_${name}_http_${res.status}`)
  const body = await res.text()
  return (body ? JSON.parse(body) : null) as T
}

async function sendOne(deps: Deps, row: ClaimedRow, config: Config): Promise<Outcome> {
  if (!isNotificationKind(row.notification_kind)) return { outcome: 'failed', error: 'unknown_kind' }
  if (!row.recipient_email) return { outcome: 'failed', error: 'recipient_has_no_email' }

  const link = buildLink(config.appBaseUrl, row.notification_kind, row.relationship_id, row.entity_id)
  if (!link) return { outcome: 'failed', error: 'invalid_link' }

  const email = renderEmail(row.notification_kind, link)

  let res: Response
  try {
    res = await deps.fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
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

  const body = res.ok ? ((await res.json().catch(() => null)) as { id?: unknown } | null) : null
  return classifyResendResponse(res.status, body)
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Same 401 whether the secret is wrong or the function is unconfigured.
  if (!(await isAuthorizedCaller(req.headers.get('x-cron-secret'), deps.getEnv('NOTIFICATIONS_CRON_SECRET')))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const loaded = loadConfig(deps.getEnv)
  if (!loaded.ok) {
    deps.logError('send-notifications: invalid configuration, nothing claimed:', loaded.missing.join(','))
    return new Response('Not configured', { status: 500 })
  }
  const config = loaded.config
  const startedAt = deps.now()

  let rows: ClaimedRow[]
  try {
    rows = (await rpc<ClaimedRow[]>(deps, config, 'claim_notification_batch', { p_limit: BATCH_SIZE })) ?? []
  } catch (error) {
    deps.logError('send-notifications: claim failed', (error as Error).message)
    return new Response('Claim failed', { status: 500 })
  }

  const summary = { claimed: rows.length, sent: 0, retry: 0, failed: 0 }

  for (const [index, row] of rows.entries()) {
    let result: Outcome
    if (deps.now() - startedAt > TIME_BUDGET_MS) {
      result = { outcome: 'retry', error: 'time_budget_exceeded' }
    } else {
      if (index > 0) await deps.sleep(SEND_INTERVAL_MS)
      try {
        result = await sendOne(deps, row, config)
      } catch (error) {
        result = { outcome: 'retry', error: (error as Error).message.slice(0, 100) }
      }
    }
    summary[result.outcome]++

    try {
      await rpc(deps, config, 'complete_notification', {
        p_id: row.notification_id,
        p_outcome: result.outcome,
        p_error: result.outcome === 'sent' ? null : result.error,
        p_provider_message_id: result.outcome === 'sent' ? result.providerMessageId : null,
      })
    } catch (error) {
      // Row stays 'processing' and is reclaimed after 15 minutes; the
      // idempotency key keeps a resend from duplicating the email.
      deps.logError('send-notifications: complete failed', row.notification_id, (error as Error).message)
    }
    deps.log('send-notifications:', row.notification_id, result.outcome)
  }

  return Response.json(summary)
}
