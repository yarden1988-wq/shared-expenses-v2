import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { SETTLEABLE_RELATIONSHIP_STATUSES } from '@/lib/relationships/constants'
import { getPaymentsForRelationship } from '@/lib/payments/data'
import { ApprovePaymentForm, RejectPaymentForm } from './actions-forms'

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לאישור העברה',
  approved: 'אושר',
  rejected: 'נדחה',
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
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
        <p className="text-zinc-700">ניתן לנהל העברות כספים רק לאחר שהקשר היה פעיל.</p>
        <Link href={`/dashboard/relationships/${id}`} className="text-center text-sm underline">
          חזרה לקשר
        </Link>
      </main>
    )
  }

  const payments = await getPaymentsForRelationship(id)
  const counterpartName = relationship.counterpartName ?? 'השותף/ה'

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">היסטוריית העברות</h1>
        <Link
          href={`/dashboard/relationships/${id}/payments/new`}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white"
        >
          + רישום העברה
        </Link>
      </div>

      {payments.length === 0 ? (
        <p className="text-zinc-600">אין עדיין העברות רשומות.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {payments.map((p) => {
            const isPayer = p.payerUserId === user.id
            const isRecipient = p.recipientUserId === user.id

            return (
              <li key={p.id} className="flex flex-col gap-2 rounded border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.amount.toFixed(2)} ₪</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[p.status] ?? 'bg-zinc-200 text-zinc-700'}`}
                  >
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </div>
                <p className="text-sm text-zinc-600">
                  {isPayer ? `העברת ל${counterpartName}` : `קיבלת מ${counterpartName}`} · {p.paymentDate}
                </p>
                {p.note && <p className="text-sm text-zinc-700">{p.note}</p>}

                {p.status === 'rejected' && p.statusReason && (
                  <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">
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
                  <p className="text-sm text-zinc-500">ממתין לאישור {counterpartName}.</p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Link href={`/dashboard/relationships/${id}/money`} className="text-center text-sm underline">
        חזרה למרכז הכספים
      </Link>
    </main>
  )
}
