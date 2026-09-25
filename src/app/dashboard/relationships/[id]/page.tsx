import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { AcceptRejectForm, RespondToProposalForm } from './actions-forms'

export default async function RelationshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const relationship = await getRelationshipById(id)

  if (!relationship) {
    notFound()
  }

  const isInviter = relationship.createdBy === user.id
  const invitation = relationship.invitation

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">
        קשר עם {relationship.counterpartName ?? invitation?.invitedEmail ?? 'שותף/ה'}
      </h1>

      {relationship.revision && (
        <p className="text-zinc-700">
          חלוקת הוצאות מוצעת: {relationship.revision.parentOnePercentage}% /{' '}
          {relationship.revision.parentTwoPercentage}%
        </p>
      )}

      {relationship.status === 'active' && (
        <>
          <p className="text-green-700">הקשר פעיל.</p>
          <Link
            href={`/dashboard/relationships/${relationship.id}/children`}
            className="rounded bg-zinc-900 px-4 py-2 text-center text-white"
          >
            צפייה בילדים
          </Link>
          <Link
            href={`/dashboard/relationships/${relationship.id}/money`}
            className="rounded border border-zinc-300 px-4 py-2 text-center"
          >
            מרכז הכספים
          </Link>
        </>
      )}

      {relationship.status === 'rejected' && <p className="text-red-700">ההזמנה נדחתה.</p>}

      {relationship.status === 'archive_requested' && (
        <>
          <p className="text-zinc-600">התקבלה בקשה לארכוב הקשר, ממתינה לאישור הצד השני.</p>
          <Link
            href={`/dashboard/relationships/${relationship.id}/money`}
            className="rounded border border-zinc-300 px-4 py-2 text-center"
          >
            מרכז הכספים
          </Link>
        </>
      )}

      {relationship.status === 'archived' && (
        <>
          <p className="text-zinc-600">הקשר הועבר לארכיון.</p>
          <Link
            href={`/dashboard/relationships/${relationship.id}/money`}
            className="rounded border border-zinc-300 px-4 py-2 text-center"
          >
            מרכז הכספים
          </Link>
        </>
      )}

      {relationship.status === 'pending_invitee' &&
        invitation &&
        (!isInviter ? (
          <AcceptRejectForm
            invitationId={invitation.id}
            relationshipId={relationship.id}
            currentRevisionId={invitation.currentRevisionId}
          />
        ) : (
          <p className="text-zinc-600">ממתין לתשובת המוזמן/ת.</p>
        ))}

      {relationship.status === 'pending_inviter' &&
        invitation &&
        (isInviter ? (
          <RespondToProposalForm invitationId={invitation.id} relationshipId={relationship.id} />
        ) : (
          <p className="text-zinc-600">ממתין לתשובת השולח/ת המקורי/ת.</p>
        ))}

      <Link href="/dashboard/relationships" className="text-center text-sm underline">
        חזרה לרשימת הקשרים
      </Link>
    </main>
  )
}
