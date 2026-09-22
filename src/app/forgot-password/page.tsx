'use client'

import { useActionState } from 'react'
import { forgotPasswordAction, type ForgotPasswordFormState } from '@/app/actions/auth'

const initialState: ForgotPasswordFormState = undefined

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState)

  if (state?.success) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-semibold">בדקו את תיבת הדוא&quot;ל</h1>
        <p className="text-zinc-700">{state.message}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">שכחתי סיסמה</h1>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            דוא&quot;ל
          </label>
          <input
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-right"
            aria-invalid={!!state?.errors?.email}
            aria-describedby={state?.errors?.email ? 'email-error' : undefined}
          />
          {state?.errors?.email && (
            <p id="email-error" className="text-sm text-red-600">
              {state.errors.email}
            </p>
          )}
        </div>

        {state?.message && !state?.success && (
          <p role="alert" className="text-sm text-red-600">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? 'שולח/ת...' : 'שליחת קישור לאיפוס'}
        </button>
      </form>
    </main>
  )
}
