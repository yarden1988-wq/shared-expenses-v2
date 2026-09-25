import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { SETTLEABLE_RELATIONSHIP_STATUSES } from '@/lib/relationships/constants'
import { getExpensesForRelationship } from '@/lib/expenses/data'
import { getBalanceForCurrentUser } from '@/lib/money/balance'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { BalanceCard } from '@/components/ui/BalanceCard'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'

const STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  submitted: 'ממתין לאישור',
  approved: 'אושר',
  partially_approved: 'אושר חלקית',
  rejected: 'נדחה',
  changes_requested: 'נדרשים שינויים',
}

const STATUS_TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'success',
  partially_approved: 'success',
  rejected: 'danger',
  changes_requested: 'warning',
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
        <p className="text-foreground">ניתן לצפות בהוצאות רק לאחר שהקשר היה פעיל.</p>
        <Link href={`/dashboard/relationships/${id}`} className="text-center text-sm text-primary underline">
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
      <PageHeader
        title="הוצאות"
        action={
          relationship.status === 'active' ? (
            <Link href={`/dashboard/relationships/${id}/expenses/new`}>
              <Button size="sm">+ הוצאה חדשה</Button>
            </Link>
          ) : undefined
        }
      />

      <BalanceCard direction={balance.direction} netAmount={balance.netAmount} counterpartName={counterpartName} />

      {expenses.length === 0 ? (
        <EmptyState message="אין עדיין הוצאות רשומות." />
      ) : (
        <ul className="flex flex-col gap-3">
          {expenses.map((e) => (
            <li key={e.id}>
              <Link href={`/dashboard/relationships/${id}/expenses/${e.id}`} className="block">
                <Card className="flex items-center justify-between hover:bg-surface-muted">
                  <div className="flex flex-col gap-1 text-right">
                    <span className="font-medium text-foreground">{e.merchantName}</span>
                    <span className="text-sm text-muted">
                      {e.categoryName ?? ''} · {e.expenseDate}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-medium text-foreground">{e.eligibleAmount.toFixed(2)} ₪</span>
                    <StatusBadge tone={STATUS_TONES[e.status] ?? 'neutral'}>
                      {STATUS_LABELS[e.status] ?? e.status}
                    </StatusBadge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href={`/dashboard/relationships/${id}/money`} className="text-center text-sm text-primary underline">
        חזרה למרכז הכספים
      </Link>
    </main>
  )
}
