// Postgres RPC exceptions surface through supabase-js as a PostgrestError
// whose `.message` is exactly the string passed to `raise exception`, e.g.
// `raise exception 'not_authenticated'` → error.message === 'not_authenticated'.
// This maps those known codes to Hebrew; anything unrecognized falls back
// to a generic message rather than leaking a raw Postgres error string.

const GENERIC_MESSAGE = 'אירעה שגיאה. נסו שוב מאוחר יותר.'

const RPC_ERROR_MESSAGES: Partial<Record<string, string>> = {
  not_authenticated: 'יש להתחבר כדי לבצע פעולה זו.',
  cannot_invite_self: 'לא ניתן להזמין את כתובת הדוא"ל שלך.',
  duplicate_relationship: 'כבר קיים קשר פעיל או ממתין מול כתובת דוא"ל זו.',
  not_relationship_participant: 'אין לך גישה לקשר זה.',
  not_relationship_member: 'רק צד לקשר יכול לבצע פעולה זו.',
  relationship_not_found: 'הקשר לא נמצא.',
  relationship_not_active: 'ניתן לבצע פעולה זו רק כאשר הקשר פעיל.',
  invalid_full_name: 'יש להזין שם מלא תקין.',
  invalid_date_of_birth: 'תאריך לידה לא תקין.',
  invalid_gender: 'יש לבחור מגדר תקין.',
  not_expected_responder: 'רק הצד השני בהזמנה יכול לבצע פעולה זו כעת.',
  invitation_expired: 'ההזמנה פגה תוקף.',
  invitation_not_awaiting_invitee: 'ההזמנה אינה ממתינה לתשובתך כרגע.',
  invitation_not_awaiting_inviter: 'ההזמנה אינה ממתינה לתשובת השולח כרגע.',
  invitation_not_open_for_proposal: 'לא ניתן להציע שינויים במצב הנוכחי של ההזמנה.',
  invitee_not_matched: 'המוזמן/ת עדיין לא משויכ/ת לחשבון קיים.',
  cannot_approve_own_request: 'לא ניתן לאשר בקשה שהגשת בעצמך.',
  cannot_reject_own_request: 'לא ניתן לדחות בקשה שהגשת בעצמך.',
  archive_request_not_pending: 'הבקשה כבר טופלה.',
  children_required: 'יש להוסיף לפחות ילד אחד.',
  child_full_name_required: 'יש להזין שם מלא לכל ילד.',
  child_birth_date_invalid: 'תאריך הלידה של הילד/ה אינו יכול להיות בעתיד.',
  child_gender_required: 'יש לבחור מגדר עבור כל ילד.',
}

export function mapRelationshipErrorToHebrew(error: { message?: string } | null | undefined): string {
  const code = error?.message?.trim()
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code]
  }
  return GENERIC_MESSAGE
}
