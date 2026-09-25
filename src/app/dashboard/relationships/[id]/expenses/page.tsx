import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { SETTLEABLE_RELATIONSHIP_STATUSES } from '@/lib/relationships/constants'
import { getExpensesForRelationship } from '@/lib/expenses/data'
import { getBalanceForCurrentUser } from '@/lib/money/balance'

const STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  submitted: 'ממתין לאישור',
  approved: 'אושר',
  partially_approved: 'אושר חלקית',
  rejected: 'נדחה',
  changes_requested: 'נדרשים שינויים',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-200 text-zinc-700',
  submitted: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  partially_approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  changes_requested: 'bg-orange-100 text-orange-800',
}

// Historical expenses remain viewable after a relationship archives (they
// still affect the balance payments settle against) — only *creating* a
// new one requires genuine 'active' status, matching create_expense's own
// RPC gate. Viewing is blocked only for the pre-active/terminal-without-
// history states, where no expense could ever have existed yet.

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const relationship = await getRelationshipById(id)

  if (!relationship) {
    notFound()
  }

  if (!SETTLEABLE_RELATIONSHIP_STATUSES.includes(relationship.status)) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-4 px-4 py-8">
        <p className="text-zinc-700">ניתן לצפות בהוצאות רק לאחר שהקשר היה פעיל.</p>
        <Link href={`/dashboard/relationships/${id}`} className="text-center text-sm underline">
          חזרה לקשר
        </Link>
      </main>
    )
  }

  const [expenses, balance] = await Promise.all([
    getExpensesForRelationship(id),
    getBalanceForCurrentUser(id, user.id),
  ])

  const counterpartName = relationship.counterpartName ?? 'השותף/ה'

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">הוצאות</h1>
        {relationship.status === 'active' && (
          <Link
            href={`/dashboard/relationships/${id}/expenses/new`}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white"
          >
            + הוצאה חדשה
          </Link>
        )}
      </div>

      <div className="rounded border border-zinc-200 p-4 text-center">
        {balance.direction === 'settled' && <p className="font-medium text-zinc-700">מאוזן</p>}
        {balance.direction === 'owed_to_me' && (
          <p className="font-medium text-green-700">
            חייבים לך {balance.netAmount.toFixed(2)} ₪ מאת {counterpartName}
          </p>
        )}
        {balance.direction === 'i_owe' && (
          <p className="font-medium text-red-700">
            את/ה חייב/ת {balance.netAmount.toFixed(2)} ₪ ל{counterpartName}
          </p>
        )}
      </div>

      {expenses.length === 0 ? (
        <p className="text-zinc-600">אין עדיין הוצאות רשומות.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {expenses.map((e) => (
            <li key={e.id}>
              <Link
                href={`/dashboard/relationships/${id}/expenses/${e.id}`}
                className="flex items-center justify-between rounded border border-zinc-200 p-3 hover:bg-zinc-50"
              >
                <div className="flex flex-col gap-1 text-right">
                  <span className="font-medium">{e.merchantName}</span>
                  <span className="text-sm text-zinc-600">
                    {e.categoryName ?? ''} · {e.expenseDate}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-medium">{e.eligibleAmount.toFixed(2)} ₪</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[e.status] ?? 'bg-zinc-200 text-zinc-700'}`}
                  >
                    {STATUS_LABELS[e.status] ?? e.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href={`/dashboard/relationships/${id}/money`} className="text-center text-sm underline">
        חזרה למרכז הכספים
      </Link>
    </main>
  )
}
