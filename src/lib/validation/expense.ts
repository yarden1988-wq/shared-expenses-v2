import { validateSplitRatio } from './relationship-invite'

export type ExpenseItemInput = { description: string; amount: string; included: boolean }
export type ExpenseItemFieldErrors = { description?: string; amount?: string }

export type ExpenseInput = {
  merchantName: string
  expenseDate: string
  categoryId: string
  items: ExpenseItemInput[]
  childIds: string[]
  overrideSplit: boolean
  parentOnePercentage: number | null
  parentTwoPercentage: number | null
}

export type ExpenseFieldErrors = {
  merchantName?: string
  expenseDate?: string
  categoryId?: string
  items?: (ExpenseItemFieldErrors | null)[]
  itemsRequired?: string
  childrenRequired?: string
  splitRatio?: string
  receipt?: string
}

export function validateExpenseItemInput(item: ExpenseItemInput): ExpenseItemFieldErrors {
  const errors: ExpenseItemFieldErrors = {}

  if (!item.description.trim()) {
    errors.description = 'שדה חובה'
  }

  const amount = Number(item.amount)
  if (item.amount.trim() === '' || Number.isNaN(amount) || amount <= 0) {
    errors.amount = 'יש להזין סכום חיובי'
  }

  return errors
}

export function hasExpenseItemErrors(errors: ExpenseItemFieldErrors): boolean {
  return Object.keys(errors).length > 0
}

export function validateExpenseInput(input: ExpenseInput): ExpenseFieldErrors {
  const errors: ExpenseFieldErrors = {}

  if (!input.merchantName.trim()) {
    errors.merchantName = 'שדה חובה'
  }

  if (!input.expenseDate) {
    errors.expenseDate = 'שדה חובה'
  } else {
    const date = new Date(input.expenseDate)
    if (Number.isNaN(date.getTime())) {
      errors.expenseDate = 'תאריך לא תקין'
    } else if (date > new Date()) {
      errors.expenseDate = 'תאריך ההוצאה לא יכול להיות בעתיד'
    }
  }

  if (!input.categoryId) {
    errors.categoryId = 'יש לבחור קטגוריה'
  }

  if (input.items.length === 0) {
    errors.itemsRequired = 'יש להוסיף לפחות פריט אחד'
  } else {
    const itemErrors = input.items.map(validateExpenseItemInput)
    if (itemErrors.some(hasExpenseItemErrors)) {
      errors.items = itemErrors.map((e) => (hasExpenseItemErrors(e) ? e : null))
    }
    if (!input.items.some((item) => item.included)) {
      errors.itemsRequired = 'יש לכלול לפחות פריט אחד בסכום ההוצאה'
    }
  }

  if (input.childIds.length === 0) {
    errors.childrenRequired = 'יש לבחור לפחות ילד/ה אחד/ת'
  }

  if (input.overrideSplit) {
    const splitError = validateSplitRatio(input.parentOnePercentage, input.parentTwoPercentage)
    if (splitError) {
      errors.splitRatio = splitError
    }
  }

  return errors
}
