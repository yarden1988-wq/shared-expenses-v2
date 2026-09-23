export type ResetPasswordFieldErrors = {
  password?: string
  confirmPassword?: string
}

export type ResetPasswordInput = {
  password: string
  confirmPassword: string
}

export function validateResetPasswordInput(
  input: ResetPasswordInput
): ResetPasswordFieldErrors {
  const errors: ResetPasswordFieldErrors = {}

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
