import { createClient } from '@/lib/supabase/server'

export type ExpenseCategory = { id: string; name: string; sortOrder: number }

type ExpenseCategoryRow = { id: string; name: string; sort_order: number }

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true })

  if (error || !data) return []

  return (data as unknown as ExpenseCategoryRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sort_order,
  }))
}

export type ExpenseListItem = {
  id: string
  merchantName: string
  expenseDate: string
  status: string
  eligibleAmount: number
  owedAmount: number | null
  createdBy: string
  categoryName: string | null
}

type CategoryEmbed = { name: string } | { name: string }[] | null

type ExpenseListRow = {
  id: string
  merchant_name: string
  expense_date: string
  status: string
  eligible_amount: number
  owed_amount: number | null
  created_by: string
  expense_categories: CategoryEmbed
}

function unwrapEmbed<T>(embed: T | T[] | null): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null
  return embed
}

export async function getExpensesForRelationship(relationshipId: string): Promise<ExpenseListItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expenses')
    .select(
      'id, merchant_name, expense_date, status, eligible_amount, owed_amount, created_by, expense_categories(name)'
    )
    .eq('relationship_id', relationshipId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as unknown as ExpenseListRow[]).map((e) => {
    const category = unwrapEmbed(e.expense_categories)
    return {
      id: e.id,
      merchantName: e.merchant_name,
      expenseDate: e.expense_date,
      status: e.status,
      eligibleAmount: Number(e.eligible_amount),
      owedAmount: e.owed_amount === null ? null : Number(e.owed_amount),
      createdBy: e.created_by,
      categoryName: category?.name ?? null,
    }
  })
}

export type ExpenseItemRow = {
  id: string
  description: string
  amount: number
  isSelected: boolean
  isApproved: boolean | null
}

export type ExpenseChildRow = { id: string; fullName: string }

export type ExpenseDetail = {
  id: string
  relationshipId: string
  createdBy: string
  categoryId: string
  categoryName: string | null
  merchantName: string
  expenseDate: string
  status: string
  statusReason: string | null
  parentOnePercentage: number
  parentTwoPercentage: number
  eligibleAmount: number
  owedAmount: number | null
  owedByUserId: string | null
  owedToUserId: string | null
  decidedBy: string | null
  decidedAt: string | null
  submittedAt: string | null
  receiptStoragePath: string | null
  items: ExpenseItemRow[]
  children: ExpenseChildRow[]
}

type ExpenseDetailRow = {
  id: string
  relationship_id: string
  created_by: string
  category_id: string
  merchant_name: string
  expense_date: string
  status: string
  status_reason: string | null
  parent_one_percentage: number
  parent_two_percentage: number
  eligible_amount: number
  owed_amount: number | null
  owed_by_user_id: string | null
  owed_to_user_id: string | null
  decided_by: string | null
  decided_at: string | null
  submitted_at: string | null
  receipt_storage_path: string | null
  expense_categories: CategoryEmbed
}

type ExpenseItemDbRow = {
  id: string
  description: string
  amount: number
  is_selected: boolean
  is_approved: boolean | null
}

type ChildEmbed = { id: string; full_name: string } | { id: string; full_name: string }[] | null

type ExpenseChildLinkRow = { child_id: string; children: ChildEmbed }

export async function getExpenseById(expenseId: string): Promise<ExpenseDetail | null> {
  const supabase = await createClient()

  const { data: expenseRow, error } = await supabase
    .from('expenses')
    .select(
      'id, relationship_id, created_by, category_id, merchant_name, expense_date, status, status_reason, parent_one_percentage, parent_two_percentage, eligible_amount, owed_amount, owed_by_user_id, owed_to_user_id, decided_by, decided_at, submitted_at, receipt_storage_path, expense_categories(name)'
    )
    .eq('id', expenseId)
    .maybeSingle()

  if (error || !expenseRow) return null

  const expense = expenseRow as unknown as ExpenseDetailRow

  const [{ data: itemRows }, { data: childLinkRows }] = await Promise.all([
    supabase
      .from('expense_items')
      .select('id, description, amount, is_selected, is_approved')
      .eq('expense_id', expenseId)
      .order('created_at', { ascending: true }),
    supabase
      .from('expense_children')
      .select('child_id, children(id, full_name)')
      .eq('expense_id', expenseId),
  ])

  const category = unwrapEmbed(expense.expense_categories)
  const items = (itemRows ?? []) as unknown as ExpenseItemDbRow[]
  const childLinks = (childLinkRows ?? []) as unknown as ExpenseChildLinkRow[]

  return {
    id: expense.id,
    relationshipId: expense.relationship_id,
    createdBy: expense.created_by,
    categoryId: expense.category_id,
    categoryName: category?.name ?? null,
    merchantName: expense.merchant_name,
    expenseDate: expense.expense_date,
    status: expense.status,
    statusReason: expense.status_reason,
    parentOnePercentage: expense.parent_one_percentage,
    parentTwoPercentage: expense.parent_two_percentage,
    eligibleAmount: Number(expense.eligible_amount),
    owedAmount: expense.owed_amount === null ? null : Number(expense.owed_amount),
    owedByUserId: expense.owed_by_user_id,
    owedToUserId: expense.owed_to_user_id,
    decidedBy: expense.decided_by,
    decidedAt: expense.decided_at,
    submittedAt: expense.submitted_at,
    receiptStoragePath: expense.receipt_storage_path,
    items: items.map((i) => ({
      id: i.id,
      description: i.description,
      amount: Number(i.amount),
      isSelected: i.is_selected,
      isApproved: i.is_approved,
    })),
    children: childLinks
      .map((link) => {
        const child = unwrapEmbed(link.children)
        return child ? { id: child.id, fullName: child.full_name } : null
      })
      .filter((c): c is ExpenseChildRow => c !== null),
  }
}

export type ActiveChild = { id: string; fullName: string }

type ActiveChildRow = { id: string; full_name: string }

export async function getActiveChildrenForRelationship(relationshipId: string): Promise<ActiveChild[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('children')
    .select('id, full_name')
    .eq('relationship_id', relationshipId)
    .eq('active', true)
    .order('created_at', { ascending: true })

  if (error || !data) return []

  return (data as unknown as ActiveChildRow[]).map((c) => ({ id: c.id, fullName: c.full_name }))
}

export type DefaultSplit = { parentOnePercentage: number; parentTwoPercentage: number }

export async function getDefaultSplitForRelationship(relationshipId: string): Promise<DefaultSplit | null> {
  const supabase = await createClient()

  const { data: relationship, error: relationshipError } = await supabase
    .from('relationships')
    .select('active_revision_id')
    .eq('id', relationshipId)
    .maybeSingle()

  if (relationshipError || !relationship?.active_revision_id) return null

  const { data: revision, error: revisionError } = await supabase
    .from('relationship_revisions')
    .select('parent_one_percentage, parent_two_percentage')
    .eq('id', relationship.active_revision_id)
    .maybeSingle()

  if (revisionError || !revision) return null

  return {
    parentOnePercentage: revision.parent_one_percentage,
    parentTwoPercentage: revision.parent_two_percentage,
  }
}

export type RelationshipBalance = {
  netAmount: number
  direction: 'owed_to_me' | 'i_owe' | 'settled'
}

type BalanceExpenseRow = {
  owed_amount: number | null
  owed_by_user_id: string | null
  owed_to_user_id: string | null
}

// Deliberately computed from `expenses` (approved/partially_approved rows),
// not read from the `balances` table: `balances.net_amount`'s sign is
// relative to parent_one/parent_two positions, which aren't resolvable
// client-side (relationship_members has no client-facing SELECT policy —
// it's only read internally by the SECURITY DEFINER RPCs). Aggregating
// owed_by_user_id/owed_to_user_id against the current auth.uid() instead
// sidesteps that entirely and is mathematically equivalent, since those
// columns are exactly what _recalculate_balance itself sums over.
export async function getBalanceForCurrentUser(
  relationshipId: string,
  userId: string
): Promise<RelationshipBalance> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expenses')
    .select('owed_amount, owed_by_user_id, owed_to_user_id')
    .eq('relationship_id', relationshipId)
    .in('status', ['approved', 'partially_approved'])

  if (error || !data) return { netAmount: 0, direction: 'settled' }

  let owedToMe = 0
  let iOwe = 0
  for (const row of data as unknown as BalanceExpenseRow[]) {
    const amount = Number(row.owed_amount ?? 0)
    if (row.owed_to_user_id === userId) owedToMe += amount
    if (row.owed_by_user_id === userId) iOwe += amount
  }

  const net = owedToMe - iOwe
  if (Math.abs(net) < 0.005) return { netAmount: 0, direction: 'settled' }
  return { netAmount: Math.abs(net), direction: net > 0 ? 'owed_to_me' : 'i_owe' }
}
