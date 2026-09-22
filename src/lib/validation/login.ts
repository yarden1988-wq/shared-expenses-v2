export type LoginFieldErrors = {
  email?: string
  password?: string
}

export type LoginInput = {
  email: string
  password: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLoginInput(input: LoginInput): LoginFieldErrors {
  const errors: LoginFieldErrors = {}

  if (!input.email.trim()) {
    errors.email = 'שדה חובה'
  } else if (!EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = 'כתובת אימייל לא תקינה'
  }

  if (!input.password) {
    errors.password = 'שדה חובה'
  }

  return errors
}
