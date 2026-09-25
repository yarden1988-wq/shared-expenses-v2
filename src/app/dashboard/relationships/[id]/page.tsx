import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { AcceptRejectForm, RespondToProposalForm } from './actions-forms'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'

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
      <PageHeader title={`קשר עם ${relationship.counterpartName ?? invitation?.invitedEmail ?? 'שותף/ה'}`} />

      {relationship.revision && (
        <p className="text-foreground">
          חלוקת הוצאות מוצעת: {relationship.revision.parentOnePercentage}% /{' '}
          {relationship.revision.parentTwoPercentage}%
        </p>
      )}

      {relationship.status === 'active' && (
        <>
          <p className="text-[var(--color-success)]">הקשר פעיל.</p>
          <Link href={`/dashboard/relationships/${relationship.id}/children`}>
            <Button fullWidth>צפייה בילדים</Button>
          </Link>
          <Link href={`/dashboard/relationships/${relationship.id}/money`}>
            <Button variant="secondary" fullWidth>
              מרכז הכספים
            </Button>
          </Link>
        </>
      )}

      {relationship.status === 'rejected' && (
        <p className="text-[var(--color-danger)]">ההזמנה נדחתה.</p>
      )}

      {relationship.status === 'archive_requested' && (
        <>
          <p className="text-muted">התקבלה בקשה לארכוב הקשר, ממתינה לאישור הצד השני.</p>
          <Link href={`/dashboard/relationships/${relationship.id}/money`}>
            <Button variant="secondary" fullWidth>
              מרכז הכספים
            </Button>
          </Link>
        </>
      )}

      {relationship.status === 'archived' && (
        <>
          <p className="text-muted">הקשר הועבר לארכיון.</p>
          <Link href={`/dashboard/relationships/${relationship.id}/money`}>
            <Button variant="secondary" fullWidth>
              מרכז הכספים
            </Button>
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
          <p className="text-muted">ממתין לתשובת המוזמן/ת.</p>
        ))}

      {relationship.status === 'pending_inviter' &&
        invitation &&
        (isInviter ? (
          <RespondToProposalForm invitationId={invitation.id} relationshipId={relationship.id} />
        ) : (
          <p className="text-muted">ממתין לתשובת השולח/ת המקורי/ת.</p>
        ))}

      <Link href="/dashboard/relationships" className="text-center text-sm text-primary underline">
        חזרה לרשימת הקשרים
      </Link>
    </main>
  )
}
