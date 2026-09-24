import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { logoutAction } from '@/app/actions/auth'
import { getRelationshipsForCurrentUser } from '@/lib/relationships/data'

export default async function DashboardPage() {
  await requireUser()
  const relationships = await getRelationshipsForCurrentUser()

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">לוח בקרה</h1>

      {relationships.length === 0 ? (
        <>
          <p className="text-zinc-600">עדיין אין קשר משותף.</p>
          <Link href="/dashboard/relationships/invite" className="rounded bg-zinc-900 px-4 py-2 text-white">
            הזמנת שותף/ה להורות
          </Link>
        </>
      ) : (
        <Link href="/dashboard/relationships" className="rounded bg-zinc-900 px-4 py-2 text-white">
          צפייה בקשרים המשותפים
        </Link>
      )}

      <form action={logoutAction}>
        <button type="submit" className="rounded bg-zinc-900 px-4 py-2 text-white">
          התנתקות
        </button>
      </form>
    </main>
  )
}
