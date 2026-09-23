'use client'

import { useActionState } from 'react'
import { loginAction, type LoginFormState } from '@/app/actions/auth'

const initialState: LoginFormState = undefined

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState)

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">התחברות</h1>

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

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">
            סיסמה
          </label>
          <input
            id="password"
            name="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-right"
            aria-invalid={!!state?.errors?.password}
            aria-describedby={state?.errors?.password ? 'password-error' : undefined}
          />
          {state?.errors?.password && (
            <p id="password-error" className="text-sm text-red-600">
              {state.errors.password}
            </p>
          )}
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
          {pending ? 'מתחבר/ת...' : 'התחברות'}
        </button>
      </form>
    </main>
  )
}
