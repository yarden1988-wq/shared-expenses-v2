'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { validateRegisterInput, type RegisterFieldErrors } from '@/lib/validation/register'
import { validateLoginInput, type LoginFieldErrors } from '@/lib/validation/login'
import {
  validateForgotPasswordInput,
  type ForgotPasswordFieldErrors,
} from '@/lib/validation/forgot-password'
import {
  validateResetPasswordInput,
  type ResetPasswordFieldErrors,
} from '@/lib/validation/reset-password'
import {
  isIdentityRevealingError,
  isRateLimitError,
  mapAuthErrorToHebrew,
  GENERIC_ERROR_MESSAGE,
} from '@/lib/auth/errors'

export type RegisterFormState =
  | {
      errors?: RegisterFieldErrors
      message?: string
      success?: boolean
    }
  | undefined

const CHECK_EMAIL_MESSAGE =
  'נרשמת בהצלחה! שלחנו אליך הודעת אימות בדוא"ל – יש לאשר את הכתובת כדי להשלים את ההרשמה.'

export async function registerAction(
  _prevState: RegisterFormState,
  formData: FormData
): Promise<RegisterFormState> {
  const input = {
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  }

  const errors = validateRegisterInput(input)
  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
      },
    },
  })

  if (error) {
    // Never let a signup error reveal whether the email is already registered.
    if (isIdentityRevealingError(error)) {
      return { success: true, message: CHECK_EMAIL_MESSAGE }
    }
    return { message: mapAuthErrorToHebrew(error) }
  }

  // Intentionally do NOT branch on or redirect based on session state here.
  // Whether signUp returns an active session depends on this Supabase
  // project's "confirm email" setting, which can change independently of
  // this code. Branching on it would make a successful new registration
  // observably different from an already-registered email (which never
  // gets a session), defeating the anti-enumeration handling above.
  // Redirecting an already-authenticated visitor away from /register
  // belongs in proxy.ts (a later checkpoint), applied uniformly regardless
  // of how the session was created.
  return { success: true, message: CHECK_EMAIL_MESSAGE }
}

export type LoginFormState =
  | {
      errors?: LoginFieldErrors
      message?: string
    }
  | undefined

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const input = {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  }

  const errors = validateLoginInput(input)
  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  })

  if (error) {
    return { message: mapAuthErrorToHebrew(error) }
  }

  redirect('/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export type ForgotPasswordFormState =
  | {
      errors?: ForgotPasswordFieldErrors
      message?: string
      success?: boolean
    }
  | undefined

const RESET_EMAIL_MESSAGE =
  'אם קיים חשבון המשויך לכתובת זו, נשלח אליו קישור לאיפוס הסיסמה.'

export async function forgotPasswordAction(
  _prevState: ForgotPasswordFormState,
  formData: FormData
): Promise<ForgotPasswordFormState> {
  const input = {
    email: String(formData.get('email') ?? ''),
  }

  const errors = validateForgotPasswordInput(input)
  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  // The redirect target must come only from a trusted, server-configured
  // value — never from request headers (Host/X-Forwarded-Host are
  // client-controllable and would allow password-reset link poisoning).
  // Fail safely if it's not configured, before any Supabase call is made,
  // so this can't become an enumeration signal either.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    return { message: GENERIC_ERROR_MESSAGE }
  }

  const supabase = await createClient()

  // Points at the PKCE code-exchange callback, not directly at
  // /reset-password: GoTrue's own hosted verify step redirects here with
  // ?code=..., which must be exchanged for a session before the reset
  // page can do anything (see src/app/auth/confirm/route.ts).
  const { error } = await supabase.auth.resetPasswordForEmail(input.email.trim(), {
    redirectTo: `${siteUrl}/auth/confirm`,
  })

  // Only a rate-limit error is safe to surface distinctly — it doesn't
  // reveal whether the email is registered. Every other outcome, including
  // any other Supabase error, returns the identical generic message so the
  // response can't be used to enumerate accounts.
  if (error && isRateLimitError(error)) {
    return { message: mapAuthErrorToHebrew(error) }
  }

  return { success: true, message: RESET_EMAIL_MESSAGE }
}

export type ResetPasswordFormState =
  | {
      errors?: ResetPasswordFieldErrors
      message?: string
      success?: boolean
    }
  | undefined

const INVALID_LINK_MESSAGE = 'הקישור פג תוקף או שאינו תקין. יש לבקש קישור חדש לאיפוס סיסמה.'
const RESET_SUCCESS_MESSAGE = 'הסיסמה עודכנה בהצלחה. ניתן להתחבר עכשיו עם הסיסמה החדשה.'

export async function resetPasswordAction(
  _prevState: ResetPasswordFormState,
  formData: FormData
): Promise<ResetPasswordFormState> {
  const input = {
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  }

  const errors = validateResetPasswordInput(input)
  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  const supabase = await createClient()

  // updateUser() always acts on the CURRENT session's own user — there is
  // no user id/email field anywhere in this form or action for a caller to
  // supply. Re-verify the session here too (not just at page-render time)
  // so this action is safe even if invoked directly.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { message: INVALID_LINK_MESSAGE }
  }

  const { error } = await supabase.auth.updateUser({ password: input.password })

  if (error) {
    return { message: mapAuthErrorToHebrew(error) }
  }

  // Close out the recovery session so "continue to /login" (per the
  // checkpoint's own behavior spec) requires actually authenticating with
  // the new password, rather than silently carrying the recovery session
  // forward.
  await supabase.auth.signOut()

  return { success: true, message: RESET_SUCCESS_MESSAGE }
}
