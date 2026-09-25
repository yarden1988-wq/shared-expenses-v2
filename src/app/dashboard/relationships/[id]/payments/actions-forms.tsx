'use client'

import { useActionState, useState } from 'react'
import { approvePaymentAction, rejectPaymentAction, type PaymentActionState } from '@/app/actions/payments'

export function ApprovePaymentForm({ paymentId, relationshipId }: { paymentId: string; relationshipId: string }) {
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(approvePaymentAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'מאשר/ת...' : 'אישור קבלת ההעברה'}
      </button>
      {state?.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
    </form>
  )
}

export function RejectPaymentForm({ paymentId, relationshipId }: { paymentId: string; relationshipId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(rejectPaymentAction, undefined)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-red-300 px-4 py-2 text-red-700"
      >
        דחיית ההעברה
      </button>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-red-200 p-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <label htmlFor={`reject-reason-${paymentId}`} className="text-sm">
        סיבת הדחייה (חובה)
      </label>
      <textarea
        id={`reject-reason-${paymentId}`}
        name="reason"
        required
        className="rounded border border-zinc-300 px-3 py-2"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? 'שולח/ת...' : 'אישור הדחייה'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded border border-zinc-300 px-4 py-2"
        >
          ביטול
        </button>
      </div>
      {state?.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
    </form>
  )
}
