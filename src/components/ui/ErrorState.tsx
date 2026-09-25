'use client'

import { Button } from './Button'

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-foreground">{message}</p>
      <Button onClick={onRetry}>ניסיון חוזר</Button>
    </main>
  )
}
