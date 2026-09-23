export type ChildFieldErrors = {
  fullName?: string
  dateOfBirth?: string
  gender?: string
}

export type ChildInput = {
  fullName: string
  dateOfBirth: string
  gender: string
}

const GENDER_VALUES = new Set(['male', 'female', 'other'])

export function validateChildInput(input: ChildInput): ChildFieldErrors {
  const errors: ChildFieldErrors = {}

  if (!input.fullName.trim()) {
    errors.fullName = 'שדה חובה'
  }

  if (!input.dateOfBirth) {
    errors.dateOfBirth = 'שדה חובה'
  } else {
    const date = new Date(input.dateOfBirth)
    if (Number.isNaN(date.getTime())) {
      errors.dateOfBirth = 'תאריך לא תקין'
    } else if (date > new Date()) {
      errors.dateOfBirth = 'תאריך הלידה לא יכול להיות בעתיד'
    }
  }

  if (!input.gender || !GENDER_VALUES.has(input.gender)) {
    errors.gender = 'יש לבחור מגדר'
  }

  return errors
}

export function hasChildErrors(errors: ChildFieldErrors): boolean {
  return Object.keys(errors).length > 0
}
