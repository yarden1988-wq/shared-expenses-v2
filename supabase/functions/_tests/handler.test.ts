import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TIME_BUDGET_MS, handleRequest, loadConfig, type ClaimedRow, type Deps } from '../send-notifications/lib.ts'

const SECRET = 's'.repeat(40)
const R = 'aaaaaaaa-1111-4111-8111-111111111111'
const E = 'bbbbbbbb-2222-4222-8222-222222222222'
const ENV: Record<string, string> = {
  NOTIFICATIONS_CRON_SECRET: SECRET,
  RESEND_API_KEY: 're_test_123',
  NOTIFICATIONS_FROM: 'Shared Expenses <notify@mail.example.com>',
  APP_BASE_URL: 'https://app.example.com',
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
}

const row = (id: string, overrides: Partial<ClaimedRow> = {}): ClaimedRow => ({
  notification_id: id,
  notification_kind: 'expense_submitted',
  relationship_id: R,
  entity_id: E,
  recipient_email: 'b@example.com',
  attempt: 1,
  ...overrides,
})

type Call = { url: string; headers: Record<string, string>; body: unknown }

function harness(opts: { env?: Record<string, string>; rows?: ClaimedRow[]; resendStatus?: number; clockStep?: number } = {}) {
  const calls: Call[] = []
  const logs: string[] = []
  let clock = 0
  const deps: Deps = {
    getEnv: (name) => (opts.env ?? ENV)[name],
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({
        url,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      if (url.endsWith('/rpc/claim_notification_batch')) return Response.json(opts.rows ?? [])
      if (url.endsWith('/rpc/complete_notification')) return new Response(null, { status: 204 })
      if (url === 'https://api.resend.com/emails') {
        const status = opts.resendStatus ?? 200
        return status === 200 ? Response.json({ id: 'msg_1' }) : new Response('err', { status })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as typeof fetch,
    sleep: async () => {},
    now: () => (clock += opts.clockStep ?? 0),
    log: (...args) => logs.push(args.join(' ')),
    logError: (...args) => logs.push(args.join(' ')),
  }
  return { deps, calls, logs }
}

const post = (secret?: string) =>
  new Request('https://fn.local/send-notifications', {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  })

test('non-POST is rejected before anything else', async () => {
  const h = harness()
  const res = await handleRequest(new Request('https://fn.local', { method: 'GET' }), h.deps)
  assert.equal(res.status, 405)
  assert.equal(h.calls.length, 0)
})

test('wrong/missing secret: 401 and no network calls at all', async () => {
  for (const secret of [undefined, 'wrong', `${SECRET}x`]) {
    const h = harness()
    const res = await handleRequest(post(secret), h.deps)
    assert.equal(res.status, 401)
    assert.equal(h.calls.length, 0)
  }
})

test('unconfigured function returns the same 401 as a bad secret', async () => {
  const h = harness({ env: { ...ENV, NOTIFICATIONS_CRON_SECRET: '' } })
  const res = await handleRequest(post(''), h.deps)
  assert.equal(res.status, 401)
  assert.equal(await res.text(), 'Unauthorized')
})

test('invalid config: 500, nothing claimed, logs names only', async () => {
  const h = harness({ env: { ...ENV, RESEND_API_KEY: 'bogus-value-123' } })
  const res = await handleRequest(post(SECRET), h.deps)
  assert.equal(res.status, 500)
  assert.equal(h.calls.length, 0)
  assert.ok(h.logs.join('\n').includes('RESEND_API_KEY'))
  assert.ok(!h.logs.join('\n').includes('bogus-value-123'))
})

test('localhost links need the explicit pre-production flag', () => {
  const local: Record<string, string> = { ...ENV, APP_BASE_URL: 'http://localhost:3000' }
  assert.equal(loadConfig((n) => local[n]).ok, false)
  const allowed: Record<string, string> = { ...local, NOTIFICATIONS_ALLOW_LOCALHOST_LINKS: 'true' }
  assert.equal(loadConfig((n) => allowed[n]).ok, true)
})

test('happy path: claim, send with idempotency key, complete as sent', async () => {
  const h = harness({ rows: [row('n1')] })
  const res = await handleRequest(post(SECRET), h.deps)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { claimed: 1, sent: 1, retry: 0, failed: 0 })

  assert.deepEqual(h.calls.map((c) => c.url), [
    'https://proj.supabase.co/rest/v1/rpc/claim_notification_batch',
    'https://api.resend.com/emails',
    'https://proj.supabase.co/rest/v1/rpc/complete_notification',
  ])
  const [claim, send, complete] = h.calls
  assert.equal(claim.headers.authorization, 'Bearer service-key')
  assert.deepEqual(claim.body, { p_limit: 10 })
  assert.equal(send.headers['idempotency-key'], 'notification-n1')
  assert.equal(send.headers.authorization, 'Bearer re_test_123')
  const email = send.body as { to: string[]; html: string; text: string; from: string }
  assert.deepEqual(email.to, ['b@example.com'])
  assert.ok(email.text.includes(`https://app.example.com/dashboard/relationships/${R}/expenses/${E}`))
  assert.deepEqual(complete.body, { p_id: 'n1', p_outcome: 'sent', p_error: null, p_provider_message_id: 'msg_1' })
})

test('logs never contain recipient emails or links', async () => {
  const h = harness({ rows: [row('n1'), row('n2', { recipient_email: null })], resendStatus: 200 })
  await handleRequest(post(SECRET), h.deps)
  const logs = h.logs.join('\n')
  assert.ok(!logs.includes('@example.com'))
  assert.ok(!logs.includes('https://'))
})

test('per-row failures map to retry / failed without sending bad rows', async () => {
  const h = harness({
    rows: [row('n1', { recipient_email: null }), row('n2', { notification_kind: 'toString' }), row('n3')],
    resendStatus: 503,
  })
  const res = await handleRequest(post(SECRET), h.deps)
  assert.deepEqual(await res.json(), { claimed: 3, sent: 0, retry: 1, failed: 2 })
  assert.equal(h.calls.filter((c) => c.url === 'https://api.resend.com/emails').length, 1)
  const outcomes = h.calls
    .filter((c) => c.url.endsWith('/complete_notification'))
    .map((c) => (c.body as { p_outcome: string; p_error: string }).p_error)
  assert.deepEqual(outcomes, ['recipient_has_no_email', 'unknown_kind', 'resend_http_503'])
})

test('time budget: remaining claimed rows are released as retry, not sent', async () => {
  const h = harness({ rows: [row('n1'), row('n2'), row('n3')], clockStep: TIME_BUDGET_MS / 2 + 1 })
  const res = await handleRequest(post(SECRET), h.deps)
  const summary = (await res.json()) as { sent: number; retry: number }
  assert.ok(summary.retry >= 1)
  assert.equal(summary.sent + summary.retry, 3)
  assert.equal(h.calls.filter((c) => c.url === 'https://api.resend.com/emails').length, summary.sent)
  assert.equal(h.calls.filter((c) => c.url.endsWith('/complete_notification')).length, 3)
})

test('claim failure: 500 and no sends', async () => {
  const h = harness()
  h.deps.fetch = (async () => new Response('nope', { status: 401 })) as typeof fetch
  const res = await handleRequest(post(SECRET), h.deps)
  assert.equal(res.status, 500)
})
