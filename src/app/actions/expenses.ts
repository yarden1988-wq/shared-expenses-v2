'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { validateExpenseInput, type ExpenseFieldErrors, type ExpenseItemInput } from '@/lib/validation/expense'
import { mapExpenseErrorToHebrew } from '@/lib/expenses/errors'

function parseItems(raw: string): ExpenseItemInput[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (i): i is ExpenseItemInput =>
        i &&
        typeof i.description === 'string' &&
        typeof i.amount === 'string' &&
        typeof i.included === 'boolean'
    )
  } catch {
    return []
  }
}

function buildItemsPayload(items: ExpenseItemInput[]) {
  return items.map((i) => ({
    description: i.description.trim(),
    amount: Number(i.amount),
    included: i.included,
  }))
}

type ParsedExpenseForm = {
  relationshipId: string
  categoryId: string
  merchantName: string
  expenseDate: string
  items: ExpenseItemInput[]
  childIds: string[]
  overrideSplit: boolean
  parentOnePercentage: number | null
  parentTwoPercentage: number | null
}

function parseExpenseForm(formData: FormData): ParsedExpenseForm {
  const overrideSplit = formData.get('overrideSplit') === 'on'
  const parentOneRaw = String(formData.get('parentOnePercentage') ?? '')
  const parentTwoRaw = String(formData.get('parentTwoPercentage') ?? '')

  return {
    relationshipId: String(formData.get('relationshipId') ?? ''),
    categoryId: String(formData.get('categoryId') ?? ''),
    merchantName: String(formData.get('merchantName') ?? ''),
    expenseDate: String(formData.get('expenseDate') ?? ''),
    items: parseItems(String(formData.get('items') ?? '[]')),
    childIds: formData.getAll('childIds').map(String),
    overrideSplit,
    parentOnePercentage: overrideSplit && parentOneRaw !== '' ? Number(parentOneRaw) : null,
    parentTwoPercentage: overrideSplit && parentTwoRaw !== '' ? Number(parentTwoRaw) : null,
  }
}

// ---- Create / update (always leave the expense in draft) ----

export type ExpenseFormState =
  | {
      errors?: ExpenseFieldErrors
      message?: string
    }
  | undefined

export async function createExpenseAction(
  _prevState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const parsed = parseExpenseForm(formData)

  const errors = validateExpenseInput(parsed)
  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_expense', {
    p_relationship_id: parsed.relationshipId,
    p_category_id: parsed.categoryId,
    p_merchant_name: parsed.merchantName.trim(),
    p_expense_date: parsed.expenseDate,
    p_items: buildItemsPayload(parsed.items),
    p_child_ids: parsed.childIds,
    p_parent_one_percentage: parsed.parentOnePercentage,
    p_parent_two_percentage: parsed.parentTwoPercentage,
    p_receipt_storage_path: null,
  })

  if (error || !data) {
    return { message: mapExpenseErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${parsed.relationshipId}/expenses/${data.expense_id}`)
}

export async function updateExpenseAction(
  _prevState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const expenseId = String(formData.get('expenseId') ?? '')
  const parsed = parseExpenseForm(formData)

  const errors = validateExpenseInput(parsed)
  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_expense', {
    p_expense_id: expenseId,
    p_category_id: parsed.categoryId,
    p_merchant_name: parsed.merchantName.trim(),
    p_expense_date: parsed.expenseDate,
    p_items: buildItemsPayload(parsed.items),
    p_child_ids: parsed.childIds,
    p_parent_one_percentage: parsed.parentOnePercentage,
    p_parent_two_percentage: parsed.parentTwoPercentage,
    p_receipt_storage_path: null,
  })

  if (error) {
    return { message: mapExpenseErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${parsed.relationshipId}/expenses/${expenseId}`)
}

// ---- Lifecycle actions (no field-level errors, just a message) ----

export type ExpenseActionState = { message?: string } | undefined

export async function submitExpenseAction(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const expenseId = String(formData.get('expenseId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_expense', { p_expense_id: expenseId })

  if (error) {
    return { message: mapExpenseErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}/expenses/${expenseId}`)
}

export async function approveExpenseAction(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const expenseId = String(formData.get('expenseId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')
  const allSelectedItemIds = String(formData.get('allSelectedItemIds') ?? '')
    .split(',')
    .filter(Boolean)
  const includedItemIds = new Set(formData.getAll('includedItemIds').map(String))
  const excludedItemIds = allSelectedItemIds.filter((id) => !includedItemIds.has(id))

  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_expense', {
    p_expense_id: expenseId,
    p_excluded_item_ids: excludedItemIds,
  })

  if (error) {
    return { message: mapExpenseErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}/expenses/${expenseId}`)
}

export async function rejectExpenseAction(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const expenseId = String(formData.get('expenseId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')
  const reason = String(formData.get('reason') ?? '')

  if (!reason.trim()) {
    return { message: 'יש לציין סיבת דחייה.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_expense', {
    p_expense_id: expenseId,
    p_reason: reason.trim(),
  })

  if (error) {
    return { message: mapExpenseErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}/expenses/${expenseId}`)
}

export async function requestExpenseChangesAction(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const expenseId = String(formData.get('expenseId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')
  const reason = String(formData.get('reason') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.rpc('request_expense_changes', {
    p_expense_id: expenseId,
    p_reason: reason.trim() || null,
  })

  if (error) {
    return { message: mapExpenseErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}/expenses/${expenseId}`)
}
