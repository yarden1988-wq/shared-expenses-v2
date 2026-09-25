'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { validatePaymentInput, type PaymentFieldErrors } from '@/lib/validation/payment'
import { mapPaymentErrorToHebrew } from '@/lib/payments/errors'

export type RecordPaymentFormState =
  | {
      errors?: PaymentFieldErrors
      message?: string
    }
  | undefined

export async function recordPaymentAction(
  _prevState: RecordPaymentFormState,
  formData: FormData
): Promise<RecordPaymentFormState> {
  const relationshipId = String(formData.get('relationshipId') ?? '')
  const amount = String(formData.get('amount') ?? '')
  const paymentDate = String(formData.get('paymentDate') ?? '')
  const note = String(formData.get('note') ?? '')

  const errors = validatePaymentInput({ amount, paymentDate })
  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('record_payment', {
    p_relationship_id: relationshipId,
    p_amount: Number(amount),
    p_payment_date: paymentDate,
    p_note: note.trim() || null,
  })

  if (error) {
    return { message: mapPaymentErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}/payments`)
}

export type PaymentActionState = { message?: string } | undefined

export async function approvePaymentAction(
  _prevState: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const paymentId = String(formData.get('paymentId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_payment', { p_payment_id: paymentId })

  if (error) {
    return { message: mapPaymentErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}/payments`)
}

export async function rejectPaymentAction(
  _prevState: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  const paymentId = String(formData.get('paymentId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')
  const reason = String(formData.get('reason') ?? '')

  if (!reason.trim()) {
    return { message: 'יש לציין סיבת דחייה.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_payment', {
    p_payment_id: paymentId,
    p_reason: reason.trim(),
  })

  if (error) {
    return { message: mapPaymentErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}/payments`)
}
