'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { createInvitationAction, type CreateInvitationFormState } from '@/app/actions/relationships'

const initialState: CreateInvitationFormState = undefined

type ChildRow = { fullName: string; dateOfBirth: string; gender: string }

const GENDER_OPTIONS = [
  { value: 'male', label: 'זכר' },
  { value: 'female', label: 'נקבה' },
  { value: 'other', label: 'אחר' },
]

export function InviteForm() {
  const [state, formAction, pending] = useActionState(createInvitationAction, initialState)
  const [children, setChildren] = useState<ChildRow[]>([{ fullName: '', dateOfBirth: '', gender: '' }])

  function updateChild(index: number, field: keyof ChildRow, value: string) {
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  function addChildRow() {
    setChildren((prev) => [...prev, { fullName: '', dateOfBirth: '', gender: '' }])
  }

  function removeChildRow(index: number) {
    setChildren((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="children" value={JSON.stringify(children)} />

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          דוא&quot;ל של השותף/ה
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
        <span className="text-sm font-medium">חלוקת ההוצאות (%)</span>
        <div className="flex flex-row-reverse gap-2">
          <input
            name="parentOnePercentage"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            dir="ltr"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-right"
            placeholder="שלי"
          />
          <input
            name="parentTwoPercentage"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            dir="ltr"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-right"
            placeholder="שותף/ה"
          />
        </div>
        <p className="text-xs text-zinc-500">שני המספרים חייבים להסתכם ב-100</p>
        {state?.errors?.splitRatio && <p className="text-sm text-red-600">{state.errors.splitRatio}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-sm font-medium">ילדים</span>
        {children.map((child, index) => {
          const childError = state?.errors?.children?.[index]
          return (
            <div key={index} className="flex flex-col gap-2 rounded border border-zinc-200 p-3">
              <div className="flex flex-col gap-1">
                <label htmlFor={`child-${index}-fullName`} className="text-sm">
                  שם מלא
                </label>
                <input
                  id={`child-${index}-fullName`}
                  type="text"
                  value={child.fullName}
                  onChange={(e) => updateChild(index, 'fullName', e.target.value)}
                  required
                  className="rounded border border-zinc-300 px-3 py-2 text-right"
                  aria-invalid={!!childError?.fullName}
                  aria-describedby={childError?.fullName ? `child-${index}-fullName-error` : undefined}
                />
                {childError?.fullName && (
                  <p id={`child-${index}-fullName-error`} className="text-sm text-red-600">
                    {childError.fullName}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`child-${index}-dateOfBirth`} className="text-sm">
                  תאריך לידה
                </label>
                <input
                  id={`child-${index}-dateOfBirth`}
                  type="date"
                  dir="ltr"
                  value={child.dateOfBirth}
                  onChange={(e) => updateChild(index, 'dateOfBirth', e.target.value)}
                  required
                  className="rounded border border-zinc-300 px-3 py-2 text-right"
                  aria-invalid={!!childError?.dateOfBirth}
                  aria-describedby={childError?.dateOfBirth ? `child-${index}-dateOfBirth-error` : undefined}
                />
                {childError?.dateOfBirth && (
                  <p id={`child-${index}-dateOfBirth-error`} className="text-sm text-red-600">
                    {childError.dateOfBirth}
                  </p>
                )}
              </div>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm">מגדר</legend>
                <div className="flex flex-row-reverse gap-4">
                  {GENDER_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        name={`gender-${index}`}
                        value={opt.value}
                        checked={child.gender === opt.value}
                        onChange={() => updateChild(index, 'gender', opt.value)}
                        required
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {childError?.gender && <p className="text-sm text-red-600">{childError.gender}</p>}
              </fieldset>
              {children.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeChildRow(index)}
                  className="self-start text-sm text-red-600 underline"
                >
                  הסרת ילד/ה
                </button>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={addChildRow}
          className="self-start rounded border border-zinc-300 px-3 py-1 text-sm"
        >
          + הוספת ילד/ה נוסף/ת
        </button>
        {state?.errors?.childrenRequired && (
          <p className="text-sm text-red-600">{state.errors.childrenRequired}</p>
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
        {pending ? 'שולח/ת...' : 'שליחת הזמנה'}
      </button>

      <Link href="/dashboard/relationships" className="text-center text-sm underline">
        ביטול וחזרה
      </Link>
    </form>
  )
}
