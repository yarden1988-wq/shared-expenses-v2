'use client'

import { useActionState, useState } from 'react'
import {
  submitExpenseAction,
  approveExpenseAction,
  rejectExpenseAction,
  requestExpenseChangesAction,
  type ExpenseActionState,
} from '@/app/actions/expenses'

export function SubmitExpenseForm({ expenseId, relationshipId }: { expenseId: string; relationshipId: string }) {
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(submitExpenseAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'שולח/ת...' : 'שליחה לאישור'}
      </button>
      {state?.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
    </form>
  )
}

export function ApproveExpenseForm({
  expenseId,
  relationshipId,
  selectedItems,
}: {
  expenseId: string
  relationshipId: string
  selectedItems: { id: string; description: string; amount: number }[]
}) {
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(approveExpenseAction, undefined)
  const [included, setIncluded] = useState<Record<string, boolean>>(
    Object.fromEntries(selectedItems.map((i) => [i.id, true]))
  )

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-green-200 p-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <input type="hidden" name="allSelectedItemIds" value={selectedItems.map((i) => i.id).join(',')} />
      <span className="text-sm font-medium">בחירת פריטים לאישור</span>
      {selectedItems.map((item) => (
        <label key={item.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includedItemIds"
              value={item.id}
              checked={included[item.id] ?? true}
              onChange={(e) => setIncluded((prev) => ({ ...prev, [item.id]: e.target.checked }))}
            />
            {item.description}
          </span>
          <span>{item.amount.toFixed(2)} ₪</span>
        </label>
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'מאשר/ת...' : 'אישור ההוצאה'}
      </button>
      {state?.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
    </form>
  )
}

export function RejectExpenseForm({ expenseId, relationshipId }: { expenseId: string; relationshipId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(rejectExpenseAction, undefined)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-red-300 px-4 py-2 text-red-700"
      >
        דחיית ההוצאה
      </button>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-red-200 p-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <label htmlFor="reject-reason" className="text-sm">
        סיבת הדחייה (חובה)
      </label>
      <textarea id="reject-reason" name="reason" required className="rounded border border-zinc-300 px-3 py-2" />
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

export function RequestChangesForm({ expenseId, relationshipId }: { expenseId: string; relationshipId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(
    requestExpenseChangesAction,
    undefined
  )

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded border border-zinc-300 px-4 py-2">
        בקשת שינויים
      </button>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-zinc-200 p-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <label htmlFor="changes-reason" className="text-sm">
        הסבר (לא חובה)
      </label>
      <textarea id="changes-reason" name="reason" className="rounded border border-zinc-300 px-3 py-2" />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? 'שולח/ת...' : 'שליחת בקשה'}
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
