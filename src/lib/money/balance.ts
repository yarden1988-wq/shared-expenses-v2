import { createClient } from '@/lib/supabase/server'

export type RelationshipBalance = {
  netAmount: number
  direction: 'owed_to_me' | 'i_owe' | 'settled'
}

type BalanceExpenseRow = {
  owed_amount: number | null
  owed_by_user_id: string | null
  owed_to_user_id: string | null
}

type BalancePaymentRow = {
  amount: number
  payer_user_id: string
  recipient_user_id: string
}

// Computed by aggregating raw rows against the current auth.uid(), not by
// reading `balances.net_amount` directly: interpreting that column's sign
// requires knowing the current user's parent_one/parent_two position,
// which isn't resolvable client-side (relationship_members has no
// client-facing SELECT policy — only the SECURITY DEFINER RPCs read it).
// This mirrors, row for row, the same math
// supabase/migrations/20260925000000_add_payments_settlement.sql uses
// server-side in `_recalculate_balance`: approved expenses create debt
// (owed_by owes owed_to); approved payments discharge debt in the
// direction paid (payer's debt to recipient shrinks). Pending/rejected
// payments and non-approved expenses never contribute.
export async function getBalanceForCurrentUser(
  relationshipId: string,
  userId: string
): Promise<RelationshipBalance> {
  const supabase = await createClient()

  const [{ data: expenseRows, error: expenseError }, { data: paymentRows, error: paymentError }] = await Promise.all([
    supabase
      .from('expenses')
      .select('owed_amount, owed_by_user_id, owed_to_user_id')
      .eq('relationship_id', relationshipId)
      .in('status', ['approved', 'partially_approved']),
    supabase
      .from('payments')
      .select('amount, payer_user_id, recipient_user_id')
      .eq('relationship_id', relationshipId)
      .eq('status', 'approved'),
  ])

  if (expenseError || paymentError) return { netAmount: 0, direction: 'settled' }

  let owedToMe = 0
  let iOwe = 0

  for (const row of (expenseRows ?? []) as unknown as BalanceExpenseRow[]) {
    const amount = Number(row.owed_amount ?? 0)
    if (row.owed_to_user_id === userId) owedToMe += amount
    if (row.owed_by_user_id === userId) iOwe += amount
  }

  for (const row of (paymentRows ?? []) as unknown as BalancePaymentRow[]) {
    const amount = Number(row.amount)
    if (row.recipient_user_id === userId) owedToMe -= amount
    if (row.payer_user_id === userId) iOwe -= amount
  }

  const net = owedToMe - iOwe
  if (Math.abs(net) < 0.005) return { netAmount: 0, direction: 'settled' }
  return { netAmount: Math.abs(net), direction: net > 0 ? 'owed_to_me' : 'i_owe' }
}
