import { requireUser } from '@/lib/auth/dal'
import { InviteForm } from './invite-form'

export default async function InviteRelationshipPage() {
  await requireUser()

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">הזמנת שותף/ה להורות</h1>
      <InviteForm />
    </main>
  )
}
