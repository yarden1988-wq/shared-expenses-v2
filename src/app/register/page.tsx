'use client'

import { useActionState, useState } from 'react'
import { registerAction, type RegisterFormState } from '@/app/actions/auth'
import { PASSWORD_REQUIREMENTS } from '@/lib/validation/password'

const initialState: RegisterFormState = undefined

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initialState)
  const [password, setPassword] = useState('')

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
      <h1 className="text-2xl font-semibold">הרשמה</h1>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="firstName" className="text-sm font-medium">
            שם פרטי
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            className="rounded border border-zinc-300 px-3 py-2"
            aria-invalid={!!state?.errors?.firstName}
            aria-describedby={state?.errors?.firstName ? 'firstName-error' : undefined}
          />
          {state?.errors?.firstName && (
            <p id="firstName-error" className="text-sm text-red-600">
              {state.errors.firstName}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="lastName" className="text-sm font-medium">
            שם משפחה
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            autoComplete="family-name"
            required
            className="rounded border border-zinc-300 px-3 py-2"
            aria-invalid={!!state?.errors?.lastName}
            aria-describedby={state?.errors?.lastName ? 'lastName-error' : undefined}
          />
          {state?.errors?.lastName && (
            <p id="lastName-error" className="text-sm text-red-600">
              {state.errors.lastName}
            </p>
          )}
        </div>

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
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 text-right"
            aria-invalid={!!state?.errors?.password}
            aria-describedby={
              [state?.errors?.password ? 'password-error' : null, 'password-requirements']
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
          <ul id="password-requirements" className="flex flex-col gap-0.5 text-sm">
            {PASSWORD_REQUIREMENTS.map((req) => {
              const met = req.test(password)
              return (
                <li key={req.key} className={met ? 'text-green-700' : 'text-zinc-500'}>
                  {met ? '✓' : '○'} {req.label}
                </li>
              )
            })}
          </ul>
          {state?.errors?.password && (
            <p id="password-error" className="text-sm text-red-600">
              {state.errors.password}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            אימות סיסמה
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
          {pending ? 'נרשם/ת...' : 'הרשמה'}
        </button>
      </form>
    </main>
  )
}
