export type ForgotPasswordFieldErrors = {
  email?: string
}

export type ForgotPasswordInput = {
  email: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateForgotPasswordInput(
  input: ForgotPasswordInput
): ForgotPasswordFieldErrors {
  const errors: ForgotPasswordFieldErrors = {}

  if (!input.email.trim()) {
    errors.email = 'שדה חובה'
  } else if (!EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = 'כתובת אימייל לא תקינה'
  }

  return errors
}
