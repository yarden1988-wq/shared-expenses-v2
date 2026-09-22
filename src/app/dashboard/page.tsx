import { requireUser } from '@/lib/auth/dal'

export default async function DashboardPage() {
  await requireUser()

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-2xl font-semibold">לוח בקרה</h1>
      <p className="text-zinc-600">בקרוב.</p>
    </main>
  )
}
