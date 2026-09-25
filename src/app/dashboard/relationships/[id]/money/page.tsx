import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { SETTLEABLE_RELATIONSHIP_STATUSES } from '@/lib/relationships/constants'
import { getExpensesForRelationship } from '@/lib/expenses/data'
import { getPaymentsForRelationship } from '@/lib/payments/data'
import { getBalanceForCurrentUser } from '@/lib/money/balance'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { BalanceCard } from '@/components/ui/BalanceCard'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  submitted: 'ממתין לאישור',
  approved: 'אושר',
  partially_approved: 'אושר חלקית',
  rejected: 'נדחה',
  changes_requested: 'נדרשים שינויים',
}

const EXPENSE_STATUS_TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'success',
  partially_approved: 'success',
  rejected: 'danger',
  changes_requested: 'warning',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לאישור העברה',
  approved: 'אושר',
  rejected: 'נדחה',
}

const PAYMENT_STATUS_TONES: Record<string, StatusTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
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
        <p className="text-foreground">מרכז הכספים זמין רק לאחר שהקשר היה פעיל.</p>
        <Link href={`/dashboard/relationships/${id}`} className="text-center text-sm text-primary underline">
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
      <PageHeader title="מרכז הכספים" />

      <BalanceCard direction={balance.direction} netAmount={balance.netAmount} counterpartName={counterpartName} />

      <div className="flex gap-2">
        {relationship.status === 'active' && (
          <Link href={`/dashboard/relationships/${id}/expenses/new`} className="flex-1">
            <Button fullWidth>+ הוצאה חדשה</Button>
          </Link>
        )}
        <Link href={`/dashboard/relationships/${id}/payments/new`} className="flex-1">
          <Button variant={relationship.status === 'active' ? 'secondary' : 'primary'} fullWidth>
            + רישום העברה
          </Button>
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">הוצאות אחרונות</h2>
          <Link href={`/dashboard/relationships/${id}/expenses`} className="text-sm text-primary underline">
            לכל ההוצאות
          </Link>
        </div>
        {recentExpenses.length === 0 ? (
          <EmptyState message="אין עדיין הוצאות רשומות." />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentExpenses.map((e) => (
              <li key={e.id}>
                <Link href={`/dashboard/relationships/${id}/expenses/${e.id}`} className="block">
                  <Card className="flex items-center justify-between p-2 text-sm hover:bg-surface-muted">
                    <span>{e.merchantName}</span>
                    <span className="flex items-center gap-2 text-muted">
                      {e.eligibleAmount.toFixed(2)} ₪
                      <StatusBadge tone={EXPENSE_STATUS_TONES[e.status] ?? 'neutral'}>
                        {EXPENSE_STATUS_LABELS[e.status] ?? e.status}
                      </StatusBadge>
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">העברות אחרונות</h2>
          <Link href={`/dashboard/relationships/${id}/payments`} className="text-sm text-primary underline">
            לכל ההעברות
          </Link>
        </div>
        {recentPayments.length === 0 ? (
          <EmptyState message="אין עדיין העברות רשומות." />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentPayments.map((p) => (
              <li key={p.id}>
                <Card className="flex items-center justify-between p-2 text-sm">
                  <span>{p.paymentDate}</span>
                  <span className="flex items-center gap-2 text-muted">
                    {p.amount.toFixed(2)} ₪
                    <StatusBadge tone={PAYMENT_STATUS_TONES[p.status] ?? 'neutral'}>
                      {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                    </StatusBadge>
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href={`/dashboard/relationships/${id}`} className="text-center text-sm text-primary underline">
        חזרה לקשר
      </Link>
    </main>
  )
}
