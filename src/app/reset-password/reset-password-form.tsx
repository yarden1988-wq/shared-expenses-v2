'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { resetPasswordAction, type ResetPasswordFormState } from '@/app/actions/auth'

const initialState: ResetPasswordFormState = undefined

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState)

  if (state?.success) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-zinc-700">{state.message}</p>
        <Link href="/login" className="rounded bg-zinc-900 px-4 py-2 text-center text-white">
          מעבר להתחברות
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          סיסמה חדשה
        </label>
        <input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          minLength={8}
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

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          אימות סיסמה חדשה
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          minLength={8}
          required
          className="rounded border border-zinc-300 px-3 py-2 text-right"
          aria-invalid={!!state?.errors?.confirmPassword}
          aria-describedby={state?.errors?.confirmPassword ? 'confirmPassword-error' : undefined}
        />
        {state?.errors?.confirmPassword && (
          <p id="confirmPassword-error" className="text-sm text-red-600">
            {state.errors.confirmPassword}
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
        {pending ? 'מעדכן/ת...' : 'עדכון סיסמה'}
      </button>
    </form>
  )
}
