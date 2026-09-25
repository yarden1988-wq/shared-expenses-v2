import { createClient } from '@/lib/supabase/server'
import { getRelationshipsForCurrentUser } from '@/lib/relationships/data'

// Read-only aggregation across ALL of the current user's relationships,
// answering "what needs my attention now?" on the dashboard home page.
// RLS already scopes `expenses`/`payments` visibility to relationships the
// user participates in, so these queries intentionally omit a
// `relationship_id` filter — the same discipline `getBalanceForCurrentUser`
// and the list pages rely on. No RPCs, no writes.

export type AttentionExpenseKind = 'awaiting_approval' | 'needs_changes'

export type AttentionExpenseItem = {
  id: string
  relationshipId: string
  relationshipName: string
  merchantName: string
  eligibleAmount: number
  kind: AttentionExpenseKind
}

export type AttentionPaymentItem = {
  id: string
  relationshipId: string
  relationshipName: string
  amount: number
  paymentDate: string
}

export type AttentionSummary = {
  expenses: AttentionExpenseItem[]
  payments: AttentionPaymentItem[]
}

type ExpenseRow = {
  id: string
  relationship_id: string
  merchant_name: string
  eligible_amount: number
  created_by: string
}

type PaymentRow = {
  id: string
  relationship_id: string
  amount: number
  payment_date: string
}

export async function getAttentionItemsForCurrentUser(userId: string): Promise<AttentionSummary> {
  const supabase = await createClient()
  const relationships = await getRelationshipsForCurrentUser()
  const relationshipNameById = new Map(
    relationships.map((r) => [r.id, r.counterpartName ?? r.invitation?.invitedEmail ?? 'שותף/ה'])
  )

  const [{ data: submittedRows }, { data: changesRequestedRows }, { data: pendingPaymentRows }] = await Promise.all([
    supabase
      .from('expenses')
      .select('id, relationship_id, merchant_name, eligible_amount, created_by')
      .eq('status', 'submitted'),
    supabase
      .from('expenses')
      .select('id, relationship_id, merchant_name, eligible_amount, created_by')
      .eq('status', 'changes_requested'),
    supabase
      .from('payments')
      .select('id, relationship_id, amount, payment_date')
      .eq('status', 'pending')
      .eq('recipient_user_id', userId),
  ])

  const awaitingApproval: AttentionExpenseItem[] = ((submittedRows ?? []) as unknown as ExpenseRow[])
    .filter((e) => e.created_by !== userId)
    .map((e) => ({
      id: e.id,
      relationshipId: e.relationship_id,
      relationshipName: relationshipNameById.get(e.relationship_id) ?? 'שותף/ה',
      merchantName: e.merchant_name,
      eligibleAmount: Number(e.eligible_amount),
      kind: 'awaiting_approval',
    }))

  const needsMyChanges: AttentionExpenseItem[] = ((changesRequestedRows ?? []) as unknown as ExpenseRow[])
    .filter((e) => e.created_by === userId)
    .map((e) => ({
      id: e.id,
      relationshipId: e.relationship_id,
      relationshipName: relationshipNameById.get(e.relationship_id) ?? 'שותף/ה',
      merchantName: e.merchant_name,
      eligibleAmount: Number(e.eligible_amount),
      kind: 'needs_changes',
    }))

  const paymentsAwaitingMyConfirmation: AttentionPaymentItem[] = ((pendingPaymentRows ?? []) as unknown as PaymentRow[]).map(
    (p) => ({
      id: p.id,
      relationshipId: p.relationship_id,
      relationshipName: relationshipNameById.get(p.relationship_id) ?? 'שותף/ה',
      amount: Number(p.amount),
      paymentDate: p.payment_date,
    })
  )

  return {
    expenses: [...awaitingApproval, ...needsMyChanges],
    payments: paymentsAwaitingMyConfirmation,
  }
}
