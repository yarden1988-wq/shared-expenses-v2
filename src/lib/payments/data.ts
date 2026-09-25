import { createClient } from '@/lib/supabase/server'

export type PaymentListItem = {
  id: string
  payerUserId: string
  recipientUserId: string
  amount: number
  paymentDate: string
  note: string | null
  status: string
  statusReason: string | null
  createdAt: string
}

type PaymentRow = {
  id: string
  payer_user_id: string
  recipient_user_id: string
  amount: number
  payment_date: string
  note: string | null
  status: string
  status_reason: string | null
  created_at: string
}

export async function getPaymentsForRelationship(relationshipId: string): Promise<PaymentListItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .select('id, payer_user_id, recipient_user_id, amount, payment_date, note, status, status_reason, created_at')
    .eq('relationship_id', relationshipId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as unknown as PaymentRow[]).map((p) => ({
    id: p.id,
    payerUserId: p.payer_user_id,
    recipientUserId: p.recipient_user_id,
    amount: Number(p.amount),
    paymentDate: p.payment_date,
    note: p.note,
    status: p.status,
    statusReason: p.status_reason,
    createdAt: p.created_at,
  }))
}
