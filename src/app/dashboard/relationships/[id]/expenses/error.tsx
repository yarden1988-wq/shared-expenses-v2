'use client'

import { ErrorState } from '@/components/ui/ErrorState'

export default function ExpensesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState message="אירעה שגיאה בטעינת ההוצאות." onRetry={reset} />
}
