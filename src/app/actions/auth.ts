'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { validateRegisterInput, type RegisterFieldErrors } from '@/lib/validation/register'
import { validateLoginInput, type LoginFieldErrors } from '@/lib/validation/login'
import { isIdentityRevealingError, mapAuthErrorToHebrew } from '@/lib/auth/errors'

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
