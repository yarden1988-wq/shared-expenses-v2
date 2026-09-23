export type RegisterFieldErrors = {
  firstName?: string
  lastName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export type RegisterInput = {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegisterInput(input: RegisterInput): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {}

  if (!input.firstName.trim()) errors.firstName = 'שדה חובה'
  if (!input.lastName.trim()) errors.lastName = 'שדה חובה'

  if (!input.email.trim()) {
    errors.email = 'שדה חובה'
  } else if (!EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = 'כתובת אימייל לא תקינה'
  }

  if (!input.password) {
    errors.password = 'שדה חובה'
  } else if (input.password.length < 8) {
    errors.password = 'הסיסמה חייבת להכיל לפחות 8 תווים'
  }

  if (!input.confirmPassword) {
    errors.confirmPassword = 'שדה חובה'
  } else if (input.password && input.confirmPassword !== input.password) {
    errors.confirmPassword = 'הסיסמאות אינן תואמות'
  }

  return errors
}
