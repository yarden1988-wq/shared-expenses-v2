import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { SETTLEABLE_RELATIONSHIP_STATUSES } from '@/lib/relationships/constants'
import { getPaymentsForRelationship } from '@/lib/payments/data'
import { ApprovePaymentForm, RejectPaymentForm } from './actions-forms'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לאישור העברה',
  approved: 'אושר',
  rejected: 'נדחה',
}

const STATUS_TONES: Record<string, StatusTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

export default async function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const relationship = await getRelationshipById(id)

  if (!relationship) {
    notFound()
  }

  if (!SETTLEABLE_RELATIONSHIP_STATUSES.includes(relationship.status)) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-4 px-4 py-8">
        <p className="text-foreground">ניתן לנהל העברות כספים רק לאחר שהקשר היה פעיל.</p>
        <Link href={`/dashboard/relationships/${id}`} className="text-center text-sm text-primary underline">
          חזרה לקשר
        </Link>
      </main>
    )
  }

  const payments = await getPaymentsForRelationship(id)
  const counterpartName = relationship.counterpartName ?? 'השותף/ה'

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <PageHeader
        title="היסטוריית העברות"
        action={
          <Link href={`/dashboard/relationships/${id}/payments/new`}>
            <Button size="sm">+ רישום העברה</Button>
          </Link>
        }
      />

      {payments.length === 0 ? (
        <EmptyState message="אין עדיין העברות רשומות." />
      ) : (
        <ul className="flex flex-col gap-3">
          {payments.map((p) => {
            const isPayer = p.payerUserId === user.id
            const isRecipient = p.recipientUserId === user.id

            return (
              <li key={p.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{p.amount.toFixed(2)} ₪</span>
                    <StatusBadge tone={STATUS_TONES[p.status] ?? 'neutral'}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted">
                    {isPayer ? `העברת ל${counterpartName}` : `קיבלת מ${counterpartName}`} · {p.paymentDate}
                  </p>
                  {p.note && <p className="text-sm text-foreground">{p.note}</p>}

                  {p.status === 'rejected' && p.statusReason && (
                    <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-surface)] p-2 text-sm text-[var(--color-danger)]">
                      <p className="font-medium">סיבת הדחייה:</p>
                      <p>{p.statusReason}</p>
                    </div>
                  )}

                  {p.status === 'pending' && isRecipient && (
                    <div className="flex flex-col gap-2 pt-1">
                      <ApprovePaymentForm paymentId={p.id} relationshipId={id} />
                      <RejectPaymentForm paymentId={p.id} relationshipId={id} />
                    </div>
                  )}

                  {p.status === 'pending' && isPayer && (
                    <p className="text-sm text-muted">ממתין לאישור {counterpartName}.</p>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Link href={`/dashboard/relationships/${id}/money`} className="text-center text-sm text-primary underline">
        חזרה למרכז הכספים
      </Link>
    </main>
  )
}
