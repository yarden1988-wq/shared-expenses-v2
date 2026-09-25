'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { recordPaymentAction, type RecordPaymentFormState } from '@/app/actions/payments'

const initialState: RecordPaymentFormState = undefined

export function RecordPaymentForm({
  relationshipId,
  recipientName,
}: {
  relationshipId: string
  recipientName: string
}) {
  const [state, formAction, pending] = useActionState(recordPaymentAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="relationshipId" value={relationshipId} />

      <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
        ההעברה תירשם כתשלום שלך ל{recipientName}. {recipientName} יצטרך/תצטרך לאשר שקיבל/ה אותה
        לפני שהיא תשפיע על היתרה.
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="amount" className="text-sm font-medium">
          סכום (₪)
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          inputMode="decimal"
          dir="ltr"
          min={0}
          step="0.01"
          required
          className="rounded border border-zinc-300 px-3 py-2 text-right"
          aria-invalid={!!state?.errors?.amount}
          aria-describedby={state?.errors?.amount ? 'amount-error' : undefined}
        />
        {state?.errors?.amount && (
          <p id="amount-error" className="text-sm text-red-600">
            {state.errors.amount}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="paymentDate" className="text-sm font-medium">
          תאריך ההעברה
        </label>
        <input
          id="paymentDate"
          name="paymentDate"
          type="date"
          dir="ltr"
          required
          className="rounded border border-zinc-300 px-3 py-2 text-right"
          aria-invalid={!!state?.errors?.paymentDate}
          aria-describedby={state?.errors?.paymentDate ? 'paymentDate-error' : undefined}
        />
        {state?.errors?.paymentDate && (
          <p id="paymentDate-error" className="text-sm text-red-600">
            {state.errors.paymentDate}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="note" className="text-sm font-medium">
          הערה / אסמכתא (לא חובה)
        </label>
        <textarea id="note" name="note" className="rounded border border-zinc-300 px-3 py-2 text-right" />
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'שולח/ת...' : 'רישום ההעברה'}
      </button>

      <Link href={`/dashboard/relationships/${relationshipId}/payments`} className="text-center text-sm underline">
        ביטול וחזרה
      </Link>
    </form>
  )
}
