// Postgres RPC exceptions surface through supabase-js as a PostgrestError
// whose `.message` is exactly the string passed to `raise exception`. This
// maps every known code from the payments migration to Hebrew; anything
// unrecognized falls back to a generic message rather than leaking a raw
// Postgres error string.

const GENERIC_MESSAGE = 'אירעה שגיאה. נסו שוב מאוחר יותר.'

const RPC_ERROR_MESSAGES: Partial<Record<string, string>> = {
  not_authenticated: 'יש להתחבר כדי לבצע פעולה זו.',
  not_relationship_participant: 'אין לך גישה לקשר זה.',
  not_relationship_member: 'רק צד לקשר יכול לבצע פעולה זו.',
  relationship_not_found: 'הקשר לא נמצא.',
  relationship_not_settleable: 'לא ניתן לרשום העברה עבור קשר זה.',
  invalid_amount: 'יש להזין סכום חיובי.',
  invalid_payment_date: 'תאריך ההעברה אינו תקין.',
  relationship_members_incomplete: 'לא ניתן להשלים את הפעולה עקב בעיה במבנה הקשר. יש לפנות לתמיכה.',
  payment_not_found: 'ההעברה לא נמצאה.',
  not_payment_recipient: 'רק מקבל/ת ההעברה יכול/ה לבצע פעולה זו.',
  payment_not_pending: 'ניתן לבצע פעולה זו רק על העברה הממתינה לאישור.',
  reason_required: 'יש לציין סיבה.',
}

export function mapPaymentErrorToHebrew(error: { message?: string } | null | undefined): string {
  const code = error?.message?.trim()
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code]
  }
  return GENERIC_MESSAGE
}
