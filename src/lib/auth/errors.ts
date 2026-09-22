import type { AuthError } from '@supabase/supabase-js'

const GENERIC_ERROR_MESSAGE = 'אירעה שגיאה. נסו שוב מאוחר יותר.'

// Codes that would let a caller learn whether an email is already registered.
// Never surface these directly — treat the outcome like a normal "check your
// email" success instead, so signup can't be used to enumerate accounts.
const IDENTITY_REVEALING_CODES = new Set(['user_already_exists', 'email_exists'])

export function isIdentityRevealingError(error: AuthError): boolean {
  if (error.code && IDENTITY_REVEALING_CODES.has(error.code)) return true
  return /already registered|already exists/i.test(error.message ?? '')
}

const CODE_MESSAGES: Partial<Record<string, string>> = {
  weak_password: 'הסיסמה חלשה מדי. יש לבחור סיסמה חזקה יותר.',
  validation_failed: 'הנתונים שהוזנו אינם תקינים.',
  email_address_invalid: 'כתובת אימייל לא תקינה.',
  over_email_send_rate_limit: 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.',
  over_request_rate_limit: 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.',
  signup_disabled: 'ההרשמה אינה זמינה כרגע.',
  invalid_credentials: 'אימייל או סיסמה שגויים.',
  email_not_confirmed: 'יש לאשר את כתובת הדוא"ל לפני ההתחברות. בדקו את תיבת הדואר שלכם.',
  user_banned: 'החשבון חסום. פנו לתמיכה.',
}

export function mapAuthErrorToHebrew(error: AuthError): string {
  const message = error.code ? CODE_MESSAGES[error.code] : undefined
  return message ?? GENERIC_ERROR_MESSAGE
}
