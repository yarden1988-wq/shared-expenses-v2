import { validateChildInput, hasChildErrors, type ChildInput, type ChildFieldErrors } from './child'

export type RelationshipInviteFieldErrors = {
  email?: string
  splitRatio?: string
  children?: (ChildFieldErrors | null)[]
  childrenRequired?: string
}

export type RelationshipInviteInput = {
  email: string
  parentOnePercentage: number | null
  parentTwoPercentage: number | null
  children: ChildInput[]
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSplitRatio(
  parentOnePercentage: number | null,
  parentTwoPercentage: number | null
): string | undefined {
  if (
    parentOnePercentage === null ||
    parentTwoPercentage === null ||
    Number.isNaN(parentOnePercentage) ||
    Number.isNaN(parentTwoPercentage) ||
    parentOnePercentage < 0 ||
    parentTwoPercentage < 0 ||
    parentOnePercentage > 100 ||
    parentTwoPercentage > 100 ||
    parentOnePercentage + parentTwoPercentage !== 100
  ) {
    return 'שני המספרים חייבים להיות בין 0 ל-100 ולהסתכם ב-100'
  }
  return undefined
}

export function validateRelationshipInviteInput(
  input: RelationshipInviteInput
): RelationshipInviteFieldErrors {
  const errors: RelationshipInviteFieldErrors = {}

  if (!input.email.trim()) {
    errors.email = 'שדה חובה'
  } else if (!EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = 'כתובת אימייל לא תקינה'
  }

  const splitError = validateSplitRatio(input.parentOnePercentage, input.parentTwoPercentage)
  if (splitError) {
    errors.splitRatio = splitError
  }

  if (input.children.length === 0) {
    errors.childrenRequired = 'יש להוסיף לפחות ילד אחד'
  } else {
    const childErrors = input.children.map(validateChildInput)
    if (childErrors.some(hasChildErrors)) {
      errors.children = childErrors.map((e) => (hasChildErrors(e) ? e : null))
    }
  }

  return errors
}
