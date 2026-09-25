'use client'

import { ErrorState } from '@/components/ui/ErrorState'

export default function MoneyError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState message="אירעה שגיאה בטעינת מרכז הכספים." onRetry={reset} />
}
