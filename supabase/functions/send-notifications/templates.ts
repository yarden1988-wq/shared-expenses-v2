// Email templates for Beta notifications. Pure (no I/O) so they can be
// unit-tested in isolation.
//
// Privacy rule: emails carry NO amounts, merchant names, reasons, notes,
// child names, or receipt files — only a fixed Hebrew sentence and a link
// back into the app, where the recipient must sign in and RLS decides what
// they can see. The only variable parts are two UUIDs (validated) and the
// configured app base URL.

export type NotificationKind = 'expense_submitted' | 'expense_changes_requested' | 'payment_recorded'

export type RenderedEmail = { subject: string; html: string; text: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const COPY: Record<NotificationKind, { subject: string; body: string; cta: string }> = {
  expense_submitted: {
    subject: 'הוצאה חדשה ממתינה לאישורך',
    body: 'ההורה השותף/ה שלח/ה הוצאה משותפת לאישורך.',
    cta: 'צפייה בהוצאה',
  },
  expense_changes_requested: {
    subject: 'התבקשו שינויים בהוצאה ששלחת',
    body: 'ההורה השותף/ה ביקש/ה שינויים בהוצאה ששלחת לאישור.',
    cta: 'צפייה בהוצאה',
  },
  payment_recorded: {
    subject: 'תשלום חדש ממתין לאישורך',
    body: 'ההורה השותף/ה רשם/ה תשלום אליך. יש לאשר שהתשלום התקבל.',
    cta: 'צפייה בתשלומים',
  },
}

export function isNotificationKind(value: string): value is NotificationKind {
  return Object.hasOwn(COPY, value) // not `in`: that would accept 'toString'
}

// Returns null for anything unexpected so the caller marks the row failed
// rather than sending a malformed link.
export function buildLink(
  appBaseUrl: string,
  kind: NotificationKind,
  relationshipId: string,
  entityId: string
): string | null {
  if (!UUID_RE.test(relationshipId) || !UUID_RE.test(entityId)) return null

  let base: URL
  try {
    base = new URL(appBaseUrl)
  } catch {
    return null
  }
  const isLocal = base.hostname === 'localhost' || base.hostname === '127.0.0.1'
  if (base.protocol !== 'https:' && !(isLocal && base.protocol === 'http:')) return null

  const path =
    kind === 'payment_recorded'
      ? `/dashboard/relationships/${relationshipId}/payments`
      : `/dashboard/relationships/${relationshipId}/expenses/${entityId}`
  return new URL(path, base.origin).toString()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderEmail(kind: NotificationKind, link: string): RenderedEmail {
  const copy = COPY[kind]
  const href = escapeHtml(link)
  const footer = 'הודעה זו נשלחה אוטומטית מאפליקציית ההוצאות המשותפות. אין להשיב למייל זה.'

  const html = `<!doctype html>
<html lang="he" dir="rtl">
  <body style="margin:0;padding:24px;background:#fefcfa;font-family:Arial,Helvetica,sans-serif;color:#221f1c;direction:rtl;text-align:right">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e7e0d8;border-radius:16px">
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(copy.subject)}</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.5">${escapeHtml(copy.body)}</p>
        <a href="${href}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:16px">${escapeHtml(copy.cta)}</a>
        <p style="margin:24px 0 0;font-size:12px;color:#78716c">${escapeHtml(footer)}</p>
      </td></tr>
    </table>
  </body>
</html>`

  const text = `${copy.subject}\n\n${copy.body}\n\n${copy.cta}: ${link}\n\n${footer}`

  return { subject: copy.subject, html, text }
}
