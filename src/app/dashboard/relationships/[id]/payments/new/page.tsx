import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { SETTLEABLE_RELATIONSHIP_STATUSES } from '@/lib/relationships/constants'
import { RecordPaymentForm } from '../record-payment-form'

export default async function NewPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireUser()
  const relationship = await getRelationshipById(id)

  if (!relationship) {
    notFound()
  }

  if (!SETTLEABLE_RELATIONSHIP_STATUSES.includes(relationship.status)) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-4 px-4 py-8">
        <p className="text-zinc-700">ניתן לרשום העברות כספים רק לאחר שהקשר היה פעיל.</p>
        <Link href={`/dashboard/relationships/${id}`} className="text-center text-sm underline">
          חזרה לקשר
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">רישום העברה</h1>
      <RecordPaymentForm relationshipId={id} recipientName={relationship.counterpartName ?? 'השותף/ה'} />
    </main>
  )
}
