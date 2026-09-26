import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Download, FileText, Paperclip } from 'lucide-react'
import { requireUser } from '@/lib/auth/dal'
import { getExpenseById } from '@/lib/expenses/data'
import { receiptKindLabel } from '@/lib/receipts/constants'
import { ReceiptUnavailableNotice } from './receipt-unavailable-notice'
import { SubmitExpenseForm, ApproveExpenseForm, RejectExpenseForm, RequestChangesForm } from './actions-forms'

const STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  submitted: 'ממתין לאישור',
  approved: 'אושר',
  partially_approved: 'אושר חלקית',
  rejected: 'נדחה',
  changes_requested: 'נדרשים שינויים',
}

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; expenseId: string }>
  searchParams: Promise<{ receipt?: string | string[] }>
}) {
  const { id, expenseId } = await params
  const receiptUnavailable = (await searchParams).receipt === 'unavailable'
  const user = await requireUser()
  const expense = await getExpenseById(expenseId)

  if (!expense || expense.relationshipId !== id) {
    notFound()
  }

  const isOwner = expense.createdBy === user.id
  const selectedItems = expense.items.filter((i) => i.isSelected)

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{expense.merchantName}</h1>
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs">
          {STATUS_LABELS[expense.status] ?? expense.status}
        </span>
      </div>

      <div className="flex flex-col gap-1 text-sm text-zinc-700">
        <p>קטגוריה: {expense.categoryName ?? '—'}</p>
        <p>תאריך: {expense.expenseDate}</p>
        <p>
          חלוקה: {expense.parentOnePercentage}% / {expense.parentTwoPercentage}%
        </p>
        {expense.children.length > 0 && (
          <p>ילדים: {expense.children.map((c) => c.fullName).join(', ')}</p>
        )}
      </div>

      {expense.statusReason && (expense.status === 'rejected' || expense.status === 'changes_requested') && (
        <div
          className={`rounded border p-3 text-sm ${
            expense.status === 'rejected'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-orange-200 bg-orange-50 text-orange-800'
          }`}
        >
          <p className="font-medium">{expense.status === 'rejected' ? 'סיבת הדחייה:' : 'נדרשים שינויים:'}</p>
          <p>{expense.statusReason}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">פריטים</span>
        <ul className="flex flex-col gap-2">
          {expense.items.map((item) => (
            <li
              key={item.id}
              className={`flex items-center justify-between rounded border border-zinc-200 p-2 text-sm ${
                !item.isSelected ? 'text-zinc-400 line-through' : ''
              }`}
            >
              <span>{item.description}</span>
              <span className="flex items-center gap-2">
                {item.amount.toFixed(2)} ₪
                {item.isSelected && item.isApproved === false && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">לא אושר</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm font-medium">סה&quot;כ: {expense.eligibleAmount.toFixed(2)} ₪</p>
        {expense.owedAmount !== null && (
          <p className="text-sm text-zinc-700">סכום לתשלום: {expense.owedAmount.toFixed(2)} ₪</p>
        )}
      </div>

      <section aria-labelledby="receipt-heading" className="flex flex-col gap-2">
        <h2 id="receipt-heading" className="text-sm font-medium">
          קבלה
        </h2>
        {expense.receiptStoragePath ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">קבלה מצורפת</span>
                <span className="text-xs text-muted">{receiptKindLabel(expense.receiptStoragePath)}</span>
              </div>
            </div>
            {/* Plain <a>, not <Link>: a file download must never be prefetched. */}
            <a
              href={`/dashboard/relationships/${id}/expenses/${expenseId}/receipt`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-muted"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              הורדת קבלה
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-muted p-4 text-sm text-muted">
            <Paperclip aria-hidden="true" className="h-5 w-5 shrink-0" />
            אין קבלה מצורפת
          </div>
        )}
        {receiptUnavailable && <ReceiptUnavailableNotice />}
      </section>

      {isOwner && expense.status === 'draft' && (
        <div className="flex flex-col gap-2">
          <Link
            href={`/dashboard/relationships/${id}/expenses/${expenseId}/edit`}
            className="rounded border border-zinc-300 px-4 py-2 text-center"
          >
            עריכת ההוצאה
          </Link>
          <SubmitExpenseForm expenseId={expenseId} relationshipId={id} />
        </div>
      )}

      {isOwner && expense.status === 'changes_requested' && (
        <Link
          href={`/dashboard/relationships/${id}/expenses/${expenseId}/edit`}
          className="rounded bg-zinc-900 px-4 py-2 text-center text-white"
        >
          עריכה ושליחה מחדש
        </Link>
      )}

      {!isOwner && expense.status === 'submitted' && (
        <div className="flex flex-col gap-4">
          <ApproveExpenseForm expenseId={expenseId} relationshipId={id} selectedItems={selectedItems} />
          <RequestChangesForm expenseId={expenseId} relationshipId={id} />
          <RejectExpenseForm expenseId={expenseId} relationshipId={id} />
        </div>
      )}

      {!isOwner && expense.status === 'changes_requested' && (
        <RejectExpenseForm expenseId={expenseId} relationshipId={id} />
      )}

      <Link href={`/dashboard/relationships/${id}/expenses`} className="text-center text-sm underline">
        חזרה לרשימת ההוצאות
      </Link>
    </main>
  )
}
