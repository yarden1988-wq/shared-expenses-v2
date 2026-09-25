'use client'

import { ErrorState } from '@/components/ui/ErrorState'

export default function PaymentsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState message="אירעה שגיאה בטעינת ההעברות." onRetry={reset} />
}
