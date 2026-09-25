import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipsForCurrentUser } from '@/lib/relationships/data'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

const STATUS_LABELS: Record<string, string> = {
  pending_invitee: 'ממתין לתשובת המוזמן/ת',
  pending_inviter: 'התקבלה הצעה נגדית — ממתין לתשובתך',
  active: 'פעיל',
  rejected: 'נדחה',
  archive_requested: 'התבקש ארכוב',
  archived: 'בארכיון',
}

export default async function RelationshipsPage() {
  await requireUser()
  const relationships = await getRelationshipsForCurrentUser()

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <PageHeader
        title="קשרים משותפים"
        action={
          <Link href="/dashboard/relationships/invite">
            <Button size="sm">+ הזמנה חדשה</Button>
          </Link>
        }
      />

      {relationships.length === 0 ? (
        <EmptyState message="עדיין אין קשר משותף. אפשר להתחיל בהזמנת שותף/ה להורות." />
      ) : (
        <ul className="flex flex-col gap-3">
          {relationships.map((r) => (
            <li key={r.id}>
              <Link href={`/dashboard/relationships/${r.id}`} className="block">
                <Card className="flex flex-col gap-1 hover:bg-surface-muted">
                  <span className="font-medium text-foreground">
                    {r.counterpartName ?? r.invitation?.invitedEmail ?? 'שותף/ה'}
                  </span>
                  <span className="text-sm text-muted">{STATUS_LABELS[r.status] ?? r.status}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
