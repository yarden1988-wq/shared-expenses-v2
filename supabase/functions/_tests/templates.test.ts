import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLink, isNotificationKind, renderEmail, type NotificationKind } from '../send-notifications/templates.ts'

const R = 'aaaaaaaa-1111-4111-8111-111111111111'
const E = 'bbbbbbbb-2222-4222-8222-222222222222'
const KINDS: NotificationKind[] = ['expense_submitted', 'expense_changes_requested', 'payment_recorded']

test('expense links point at the expense; payment links at the payments page', () => {
  assert.equal(
    buildLink('https://app.example.com', 'expense_submitted', R, E),
    `https://app.example.com/dashboard/relationships/${R}/expenses/${E}`
  )
  assert.equal(
    buildLink('https://app.example.com', 'expense_changes_requested', R, E),
    `https://app.example.com/dashboard/relationships/${R}/expenses/${E}`
  )
  assert.equal(
    buildLink('https://app.example.com', 'payment_recorded', R, E),
    `https://app.example.com/dashboard/relationships/${R}/payments`
  )
})

test('base URL path/query are discarded; only the origin is used', () => {
  assert.equal(
    buildLink('https://app.example.com/evil?next=//x', 'expense_submitted', R, E),
    `https://app.example.com/dashboard/relationships/${R}/expenses/${E}`
  )
})

test('only https, or http on localhost', () => {
  assert.equal(buildLink('http://app.example.com', 'expense_submitted', R, E), null)
  assert.equal(buildLink('javascript:alert(1)', 'expense_submitted', R, E), null)
  assert.equal(buildLink('not a url', 'expense_submitted', R, E), null)
  assert.ok(buildLink('http://localhost:3000', 'expense_submitted', R, E))
  assert.ok(buildLink('http://127.0.0.1:3000', 'expense_submitted', R, E))
})

test('ids must be lowercase UUIDs', () => {
  assert.equal(buildLink('https://a.com', 'expense_submitted', '../admin', E), null)
  assert.equal(buildLink('https://a.com', 'expense_submitted', R.toUpperCase(), E), null)
  assert.equal(buildLink('https://a.com', 'expense_submitted', R, `${E}/x`), null)
})

test('only the three kinds are accepted (no prototype keys)', () => {
  for (const kind of KINDS) assert.equal(isNotificationKind(kind), true)
  for (const bad of ['toString', '__proto__', 'constructor', 'expense_created', '']) {
    assert.equal(isNotificationKind(bad), false)
  }
})

test('emails are Hebrew RTL, escape the link, and carry no financial details', () => {
  for (const kind of KINDS) {
    const link = `https://a.com/p?q=1&r="x"<y>`
    const email = renderEmail(kind, link)
    assert.ok(email.subject.length > 0)
    assert.match(email.html, /<html lang="he" dir="rtl">/)
    assert.ok(email.html.includes('&amp;r=&quot;x&quot;&lt;y&gt;'))
    assert.ok(!email.html.includes('"x"<y>'))
    assert.ok(email.text.includes(link))
    for (const part of [email.subject, email.html, email.text]) {
      assert.doesNotMatch(part, /₪|\d+\.\d{2}|receipt|קבלה/i)
    }
  }
})
