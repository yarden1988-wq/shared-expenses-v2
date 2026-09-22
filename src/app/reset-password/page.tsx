import Link from 'next/link'
import { getUser } from '@/lib/auth/dal'
import { ResetPasswordForm } from './reset-password-form'

export default async function ResetPasswordPage() {
  const user = await getUser()

  if (!user) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-semibold">הקישור אינו תקין</h1>
        <p className="text-zinc-700">
          הקישור פג תוקף או שאינו תקין. יש לבקש קישור חדש לאיפוס סיסמה.
        </p>
        <Link href="/forgot-password" className="underline">
          בקשת קישור חדש
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">איפוס סיסמה</h1>
      <ResetPasswordForm />
    </main>
  )
}
