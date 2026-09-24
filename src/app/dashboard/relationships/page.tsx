import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipsForCurrentUser } from '@/lib/relationships/data'

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">קשרים משותפים</h1>
        <Link
          href="/dashboard/relationships/invite"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white"
        >
          + הזמנה חדשה
        </Link>
      </div>

      {relationships.length === 0 ? (
        <p className="text-zinc-600">עדיין אין קשר משותף. אפשר להתחיל בהזמנת שותף/ה להורות.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {relationships.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/relationships/${r.id}`}
                className="flex flex-col gap-1 rounded border border-zinc-200 p-3 hover:bg-zinc-50"
              >
                <span className="font-medium">
                  {r.counterpartName ?? r.invitation?.invitedEmail ?? 'שותף/ה'}
                </span>
                <span className="text-sm text-zinc-600">{STATUS_LABELS[r.status] ?? r.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
