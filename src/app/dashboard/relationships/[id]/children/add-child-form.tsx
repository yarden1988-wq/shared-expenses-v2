'use client'

import { useActionState } from 'react'
import { addChildAction, type AddChildFormState } from '@/app/actions/relationships'

const initialState: AddChildFormState = undefined

export function AddChildForm({ relationshipId }: { relationshipId: string }) {
  const [state, formAction, pending] = useActionState(addChildAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-zinc-200 p-3" noValidate>
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <h2 className="text-lg font-medium">הוספת ילד/ה</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="fullName" className="text-sm">
          שם מלא
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          className="rounded border border-zinc-300 px-3 py-2 text-right"
          aria-invalid={!!state?.errors?.fullName}
          aria-describedby={state?.errors?.fullName ? 'fullName-error' : undefined}
        />
        {state?.errors?.fullName && (
          <p id="fullName-error" className="text-sm text-red-600">
            {state.errors.fullName}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="dateOfBirth" className="text-sm">
          תאריך לידה
        </label>
        <input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          dir="ltr"
          required
          className="rounded border border-zinc-300 px-3 py-2 text-right"
          aria-invalid={!!state?.errors?.dateOfBirth}
          aria-describedby={state?.errors?.dateOfBirth ? 'dateOfBirth-error' : undefined}
        />
        {state?.errors?.dateOfBirth && (
          <p id="dateOfBirth-error" className="text-sm text-red-600">
            {state.errors.dateOfBirth}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm">מגדר</legend>
        <div className="flex flex-row-reverse gap-4">
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" name="gender" value="male" required /> זכר
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" name="gender" value="female" /> נקבה
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" name="gender" value="other" /> אחר
          </label>
        </div>
        {state?.errors?.gender && <p className="text-sm text-red-600">{state.errors.gender}</p>}
      </fieldset>

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
        {pending ? 'מוסיף/ה...' : 'הוספת ילד/ה'}
      </button>
    </form>
  )
}
