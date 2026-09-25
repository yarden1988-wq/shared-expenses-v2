import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { SETTLEABLE_RELATIONSHIP_STATUSES } from '@/lib/relationships/constants'
import { getExpensesForRelationship } from '@/lib/expenses/data'
import { getPaymentsForRelationship } from '@/lib/payments/data'
import { getBalanceForCurrentUser } from '@/lib/money/balance'

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  submitted: 'ממתין לאישור',
  approved: 'אושר',
  partially_approved: 'אושר חלקית',
  rejected: 'נדחה',
  changes_requested: 'נדרשים שינויים',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לאישור העברה',
  approved: 'אושר',
  rejected: 'נדחה',
}

// New expenses are only offered while genuinely 'active' (see the CTA row
// below) — settlement (payments) remains reachable through archival, per
// SETTLEABLE_RELATIONSHIP_STATUSES.

export default async function MoneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const relationship = await getRelationshipById(id)

  if (!relationship) {
    notFound()
  }

  if (!SETTLEABLE_RELATIONSHIP_STATUSES.includes(relationship.status)) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-4 px-4 py-8">
        <p className="text-zinc-700">מרכז הכספים זמין רק לאחר שהקשר היה פעיל.</p>
        <Link href={`/dashboard/relationships/${id}`} className="text-center text-sm underline">
          חזרה לקשר
        </Link>
      </main>
    )
  }

  const [balance, expenses, payments] = await Promise.all([
    getBalanceForCurrentUser(id, user.id),
    getExpensesForRelationship(id),
    getPaymentsForRelationship(id),
  ])

  const counterpartName = relationship.counterpartName ?? 'השותף/ה'
  const recentExpenses = expenses.slice(0, 3)
  const recentPayments = payments.slice(0, 3)

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">מרכז הכספים</h1>

      <div className="flex flex-col items-center gap-1 rounded border border-zinc-200 p-6 text-center">
        {balance.direction === 'settled' && (
          <>
            <p className="text-xl font-semibold text-zinc-700">מאוזן</p>
            <p className="text-sm text-zinc-500">אין יתרה פתוחה מול {counterpartName}</p>
          </>
        )}
        {balance.direction === 'owed_to_me' && (
          <>
            <p className="text-xl font-semibold text-green-700">חייבים לך</p>
            <p className="text-2xl font-bold text-green-700">{balance.netAmount.toFixed(2)} ₪</p>
            <p className="text-sm text-zinc-500">מאת {counterpartName}</p>
          </>
        )}
        {balance.direction === 'i_owe' && (
          <>
            <p className="text-xl font-semibold text-red-700">את/ה חייב/ת</p>
            <p className="text-2xl font-bold text-red-700">{balance.netAmount.toFixed(2)} ₪</p>
            <p className="text-sm text-zinc-500">ל{counterpartName}</p>
          </>
        )}
      </div>

      <div className="flex gap-2">
        {relationship.status === 'active' && (
          <Link
            href={`/dashboard/relationships/${id}/expenses/new`}
            className="flex-1 rounded bg-zinc-900 px-4 py-2 text-center text-sm text-white"
          >
            + הוצאה חדשה
          </Link>
        )}
        <Link
          href={`/dashboard/relationships/${id}/payments/new`}
          className={`flex-1 rounded px-4 py-2 text-center text-sm ${
            relationship.status === 'active'
              ? 'border border-zinc-300'
              : 'bg-zinc-900 text-white'
          }`}
        >
          + רישום העברה
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">הוצאות אחרונות</h2>
          <Link href={`/dashboard/relationships/${id}/expenses`} className="text-sm underline">
            לכל ההוצאות
          </Link>
        </div>
        {recentExpenses.length === 0 ? (
          <p className="text-sm text-zinc-600">אין עדיין הוצאות רשומות.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentExpenses.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/dashboard/relationships/${id}/expenses/${e.id}`}
                  className="flex items-center justify-between rounded border border-zinc-200 p-2 text-sm hover:bg-zinc-50"
                >
                  <span>{e.merchantName}</span>
                  <span className="flex items-center gap-2 text-zinc-600">
                    {e.eligibleAmount.toFixed(2)} ₪
                    <span className="text-xs">{EXPENSE_STATUS_LABELS[e.status] ?? e.status}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">העברות אחרונות</h2>
          <Link href={`/dashboard/relationships/${id}/payments`} className="text-sm underline">
            לכל ההעברות
          </Link>
        </div>
        {recentPayments.length === 0 ? (
          <p className="text-sm text-zinc-600">אין עדיין העברות רשומות.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentPayments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded border border-zinc-200 p-2 text-sm"
              >
                <span>{p.paymentDate}</span>
                <span className="flex items-center gap-2 text-zinc-600">
                  {p.amount.toFixed(2)} ₪
                  <span className="text-xs">{PAYMENT_STATUS_LABELS[p.status] ?? p.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href={`/dashboard/relationships/${id}`} className="text-center text-sm underline">
        חזרה לקשר
      </Link>
    </main>
  )
}
