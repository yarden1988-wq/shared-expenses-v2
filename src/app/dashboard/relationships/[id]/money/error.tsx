'use client'

export default function MoneyError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-zinc-700">אירעה שגיאה בטעינת מרכז הכספים.</p>
      <button onClick={() => reset()} className="rounded bg-zinc-900 px-4 py-2 text-white">
        ניסיון חוזר
      </button>
    </main>
  )
}
