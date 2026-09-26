'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { createExpenseAction, updateExpenseAction, type ExpenseFormState } from '@/app/actions/expenses'
import { ReceiptField } from './receipt-field'

type ItemRow = { description: string; amount: string; included: boolean }

const initialState: ExpenseFormState = undefined

export function ExpenseForm({
  mode,
  relationshipId,
  expenseId,
  categories,
  availableChildren,
  defaultParentOnePercentage,
  defaultParentTwoPercentage,
  forceOverrideSplit = false,
  initialReceiptPath = null,
  initialValues,
}: {
  mode: 'create' | 'edit'
  relationshipId: string
  expenseId?: string
  categories: { id: string; name: string }[]
  availableChildren: { id: string; fullName: string }[]
  defaultParentOnePercentage: number
  defaultParentTwoPercentage: number
  forceOverrideSplit?: boolean
  initialReceiptPath?: string | null
  initialValues?: {
    merchantName: string
    expenseDate: string
    categoryId: string
    items: ItemRow[]
    childIds: string[]
    parentOnePercentage: number
    parentTwoPercentage: number
  }
}) {
  const action = mode === 'create' ? createExpenseAction : updateExpenseAction
  const [state, formAction, pending] = useActionState<ExpenseFormState, FormData>(action, initialState)

  const [items, setItems] = useState<ItemRow[]>(
    initialValues && initialValues.items.length > 0
      ? initialValues.items
      : [{ description: '', amount: '', included: true }]
  )
  const [receiptUploading, setReceiptUploading] = useState(false)
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(initialValues?.childIds ?? [])

  const isOverriddenInitially =
    !!initialValues &&
    (initialValues.parentOnePercentage !== defaultParentOnePercentage ||
      initialValues.parentTwoPercentage !== defaultParentTwoPercentage)
  const [overrideSplit, setOverrideSplit] = useState(isOverriddenInitially || forceOverrideSplit)
  const [parentOnePercentage, setParentOnePercentage] = useState(
    String(initialValues?.parentOnePercentage ?? defaultParentOnePercentage)
  )
  const [parentTwoPercentage, setParentTwoPercentage] = useState(
    String(initialValues?.parentTwoPercentage ?? defaultParentTwoPercentage)
  )

  function updateItem(index: number, field: keyof ItemRow, value: string | boolean) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }
  function addItemRow() {
    setItems((prev) => [...prev, { description: '', amount: '', included: true }])
  }
  function removeItemRow(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }
  function toggleChild(id: string) {
    setSelectedChildIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  const totalIncluded = items.filter((i) => i.included).reduce((sum, i) => sum + (Number(i.amount) || 0), 0)

  const cancelHref = expenseId
    ? `/dashboard/relationships/${relationshipId}/expenses/${expenseId}`
    : `/dashboard/relationships/${relationshipId}/expenses`

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="relationshipId" value={relationshipId} />
      {mode === 'edit' && expenseId && <input type="hidden" name="expenseId" value={expenseId} />}
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="flex flex-col gap-1">
        <label htmlFor="merchantName" className="text-sm font-medium">
          שם העסק / הספק
        </label>
        <input
          id="merchantName"
          name="merchantName"
          type="text"
          defaultValue={initialValues?.merchantName}
          required
          className="rounded border border-zinc-300 px-3 py-2 text-right"
          aria-invalid={!!state?.errors?.merchantName}
          aria-describedby={state?.errors?.merchantName ? 'merchantName-error' : undefined}
        />
        {state?.errors?.merchantName && (
          <p id="merchantName-error" className="text-sm text-red-600">
            {state.errors.merchantName}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="expenseDate" className="text-sm font-medium">
          תאריך ההוצאה
        </label>
        <input
          id="expenseDate"
          name="expenseDate"
          type="date"
          dir="ltr"
          defaultValue={initialValues?.expenseDate}
          required
          className="rounded border border-zinc-300 px-3 py-2 text-right"
          aria-invalid={!!state?.errors?.expenseDate}
          aria-describedby={state?.errors?.expenseDate ? 'expenseDate-error' : undefined}
        />
        {state?.errors?.expenseDate && (
          <p id="expenseDate-error" className="text-sm text-red-600">
            {state.errors.expenseDate}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="categoryId" className="text-sm font-medium">
          קטגוריה
        </label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={initialValues?.categoryId ?? ''}
          required
          className="rounded border border-zinc-300 px-3 py-2 text-right"
          aria-invalid={!!state?.errors?.categoryId}
          aria-describedby={state?.errors?.categoryId ? 'categoryId-error' : undefined}
        >
          <option value="" disabled>
            בחירת קטגוריה
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {state?.errors?.categoryId && (
          <p id="categoryId-error" className="text-sm text-red-600">
            {state.errors.categoryId}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">ילדים רלוונטיים</span>
        {availableChildren.length === 0 ? (
          <p className="text-sm text-zinc-600">אין ילדים רשומים בקשר זה.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {availableChildren.map((child) => (
              <label key={child.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="childIds"
                  value={child.id}
                  checked={selectedChildIds.includes(child.id)}
                  onChange={() => toggleChild(child.id)}
                />
                {child.fullName}
              </label>
            ))}
          </div>
        )}
        {state?.errors?.childrenRequired && (
          <p className="text-sm text-red-600">{state.errors.childrenRequired}</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-sm font-medium">פריטים</span>
        {items.map((item, index) => {
          const itemError = state?.errors?.items?.[index]
          return (
            <div key={index} className="flex flex-col gap-2 rounded border border-zinc-200 p-3">
              <div className="flex flex-col gap-1">
                <label htmlFor={`item-${index}-description`} className="text-sm">
                  תיאור
                </label>
                <input
                  id={`item-${index}-description`}
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(index, 'description', e.target.value)}
                  required
                  className="rounded border border-zinc-300 px-3 py-2 text-right"
                  aria-invalid={!!itemError?.description}
                  aria-describedby={itemError?.description ? `item-${index}-description-error` : undefined}
                />
                {itemError?.description && (
                  <p id={`item-${index}-description-error`} className="text-sm text-red-600">
                    {itemError.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`item-${index}-amount`} className="text-sm">
                  סכום (₪)
                </label>
                <input
                  id={`item-${index}-amount`}
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  min={0}
                  step="0.01"
                  value={item.amount}
                  onChange={(e) => updateItem(index, 'amount', e.target.value)}
                  required
                  className="rounded border border-zinc-300 px-3 py-2 text-right"
                  aria-invalid={!!itemError?.amount}
                  aria-describedby={itemError?.amount ? `item-${index}-amount-error` : undefined}
                />
                {itemError?.amount && (
                  <p id={`item-${index}-amount-error`} className="text-sm text-red-600">
                    {itemError.amount}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.included}
                  onChange={(e) => updateItem(index, 'included', e.target.checked)}
                />
                לכלול פריט זה בסכום ההוצאה
              </label>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItemRow(index)}
                  className="self-start text-sm text-red-600 underline"
                >
                  הסרת פריט
                </button>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={addItemRow}
          className="self-start rounded border border-zinc-300 px-3 py-1 text-sm"
        >
          + הוספת פריט
        </button>
        {state?.errors?.itemsRequired && <p className="text-sm text-red-600">{state.errors.itemsRequired}</p>}
        <p className="text-sm text-zinc-600">סה&quot;כ כלול: {totalIncluded.toFixed(2)} ₪</p>
      </div>

      <div className="flex flex-col gap-2 rounded border border-zinc-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="overrideSplit"
            checked={overrideSplit}
            onChange={(e) => setOverrideSplit(e.target.checked)}
          />
          שינוי חלוקת ההוצאה עבור הוצאה זו בלבד
        </label>
        <p className="text-xs text-zinc-500">
          ברירת המחדל של הקשר: {defaultParentOnePercentage}% / {defaultParentTwoPercentage}%
        </p>
        {overrideSplit && (
          <div className="flex flex-row-reverse gap-2">
            <input
              name="parentOnePercentage"
              type="number"
              dir="ltr"
              min={0}
              max={100}
              value={parentOnePercentage}
              onChange={(e) => setParentOnePercentage(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-right"
            />
            <input
              name="parentTwoPercentage"
              type="number"
              dir="ltr"
              min={0}
              max={100}
              value={parentTwoPercentage}
              onChange={(e) => setParentTwoPercentage(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-right"
            />
          </div>
        )}
        {state?.errors?.splitRatio && <p className="text-sm text-red-600">{state.errors.splitRatio}</p>}
      </div>

      <ReceiptField
        relationshipId={relationshipId}
        expenseId={expenseId}
        originalPath={initialReceiptPath}
        error={state?.errors?.receipt}
        errorSource={state}
        saving={pending}
        onUploadingChange={setReceiptUploading}
      />

      {state?.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || receiptUploading}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'שומר/ת...' : receiptUploading ? 'ממתין לסיום העלאת הקבלה...' : 'שמירה כטיוטה'}
      </button>

      <Link href={cancelHref} className="text-center text-sm underline">
        ביטול וחזרה
      </Link>
    </form>
  )
}
