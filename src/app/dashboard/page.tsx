import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { logoutAction } from '@/app/actions/auth'
import { getRelationshipsForCurrentUser } from '@/lib/relationships/data'
import { getBalanceForCurrentUser } from '@/lib/money/balance'
import { getAttentionItemsForCurrentUser } from '@/lib/dashboard/attention'
import { SETTLEABLE_RELATIONSHIP_STATUSES } from '@/lib/relationships/constants'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { BalanceCard } from '@/components/ui/BalanceCard'

export default async function DashboardPage() {
  const user = await requireUser()
  const relationships = await getRelationshipsForCurrentUser()

  const settleableRelationships = relationships.filter((r) =>
    SETTLEABLE_RELATIONSHIP_STATUSES.includes(r.status)
  )

  const [attention, balances] = await Promise.all([
    getAttentionItemsForCurrentUser(user.id),
    Promise.all(
      settleableRelationships.map(async (r) => ({
        relationship: r,
        balance: await getBalanceForCurrentUser(r.id, user.id),
      }))
    ),
  ])

  const hasAttentionItems = attention.expenses.length > 0 || attention.payments.length > 0

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <PageHeader title="לוח בקרה" />

      {relationships.length === 0 ? (
        <EmptyState
          message="עדיין אין קשר משותף."
          action={
            <Link href="/dashboard/relationships/invite">
              <Button>הזמנת שותף/ה להורות</Button>
            </Link>
          }
        />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium text-foreground">דורש את תשומת ליבך</h2>
            {!hasAttentionItems ? (
              <EmptyState message="אין כרגע פעולות שממתינות לך." />
            ) : (
              <ul className="flex flex-col gap-2">
                {attention.expenses.map((item) => (
                  <li key={`expense-${item.id}`}>
                    <Link
                      href={`/dashboard/relationships/${item.relationshipId}/expenses/${item.id}`}
                      className="block"
                    >
                      <Card className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-surface-muted">
                        <span className="flex flex-col gap-0.5 text-right">
                          <span className="font-medium text-foreground">{item.merchantName}</span>
                          <span className="text-xs text-muted">
                            {item.kind === 'awaiting_approval'
                              ? `ממתין לאישורך · ${item.relationshipName}`
                              : `נדרשים שינויים · ${item.relationshipName}`}
                          </span>
                        </span>
                        <span className="font-medium text-foreground">{item.eligibleAmount.toFixed(2)} ₪</span>
                      </Card>
                    </Link>
                  </li>
                ))}
                {attention.payments.map((item) => (
                  <li key={`payment-${item.id}`}>
                    <Link
                      href={`/dashboard/relationships/${item.relationshipId}/payments`}
                      className="block"
                    >
                      <Card className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-surface-muted">
                        <span className="flex flex-col gap-0.5 text-right">
                          <span className="font-medium text-foreground">אישור קבלת העברה</span>
                          <span className="text-xs text-muted">
                            {item.relationshipName} · {item.paymentDate}
                          </span>
                        </span>
                        <span className="font-medium text-foreground">{item.amount.toFixed(2)} ₪</span>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {balances.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-medium text-foreground">מאזן לפי קשר</h2>
              <ul className="flex flex-col gap-3">
                {balances.map(({ relationship, balance }) => (
                  <li key={relationship.id}>
                    <Link href={`/dashboard/relationships/${relationship.id}/money`} className="block">
                      <BalanceCard
                        direction={balance.direction}
                        netAmount={balance.netAmount}
                        counterpartName={relationship.counterpartName ?? 'השותף/ה'}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link href="/dashboard/relationships">
            <Button variant="secondary" fullWidth>
              צפייה בקשרים המשותפים
            </Button>
          </Link>
        </>
      )}

      <form action={logoutAction}>
        <Button type="submit" variant="secondary" fullWidth>
          התנתקות
        </Button>
      </form>
    </main>
  )
}
