import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyResendResponse, isAuthorizedCaller, loadConfig } from '../send-notifications/lib.ts'

const GOOD_ENV: Record<string, string> = {
  RESEND_API_KEY: 're_test_123',
  NOTIFICATIONS_FROM: 'הוצאות משותפות <notify@mail.example.com>',
  APP_BASE_URL: 'https://app.example.com',
  SUPABASE_URL: 'https://abcd.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
}
const envFrom = (env: Record<string, string>) => (name: string) => env[name]

test('valid configuration loads and normalizes SUPABASE_URL', () => {
  const result = loadConfig(envFrom(GOOD_ENV))
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.config.supabaseUrl, 'https://abcd.supabase.co')
})

test('invalid configuration reports setting names only, never values', () => {
  const result = loadConfig(
    envFrom({
      ...GOOD_ENV,
      RESEND_API_KEY: 'sk_live_wrongprovider',
      NOTIFICATIONS_FROM: 'Evil\r\nBcc: x@y.com <a@b.com>',
      APP_BASE_URL: 'http://app.example.com',
      SUPABASE_SERVICE_ROLE_KEY: '',
    })
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.deepEqual(result.missing.sort(), ['APP_BASE_URL', 'NOTIFICATIONS_FROM', 'RESEND_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
    assert.ok(!JSON.stringify(result).includes('sk_live'))
  }
})

test('bare sender address is accepted', () => {
  assert.equal(loadConfig(envFrom({ ...GOOD_ENV, NOTIFICATIONS_FROM: 'notify@mail.example.com' })).ok, true)
})

test('caller auth: requires a >= 32 char secret and an exact match', async () => {
  const secret = 'x'.repeat(32)
  assert.equal(await isAuthorizedCaller(secret, secret), true)
  assert.equal(await isAuthorizedCaller(`${secret}y`, secret), false)
  assert.equal(await isAuthorizedCaller(null, secret), false)
  assert.equal(await isAuthorizedCaller('', ''), false)
  assert.equal(await isAuthorizedCaller('short', 'short'), false)
  assert.equal(await isAuthorizedCaller('anything', undefined), false)
})

test('Resend responses map to sent / retry / failed', () => {
  assert.deepEqual(classifyResendResponse(200, { id: 'msg_1' }), { outcome: 'sent', providerMessageId: 'msg_1' })
  assert.deepEqual(classifyResendResponse(200, null), { outcome: 'sent', providerMessageId: '' })
  assert.equal(classifyResendResponse(429, null).outcome, 'retry')
  assert.equal(classifyResendResponse(500, null).outcome, 'retry')
  assert.equal(classifyResendResponse(503, null).outcome, 'retry')
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(classifyResendResponse(status, null).outcome, 'failed')
  }
})
