import type { ReactNode } from 'react'

export type StatusTone = 'neutral' | 'warning' | 'success' | 'danger' | 'info'

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-[var(--color-neutral-surface)] text-[var(--color-neutral-text)]',
  warning: 'bg-[var(--color-warning-surface)] text-[var(--color-warning)]',
  success: 'bg-[var(--color-success-surface)] text-[var(--color-success)]',
  danger: 'bg-[var(--color-danger-surface)] text-[var(--color-danger)]',
  info: 'bg-[var(--color-info-surface)] text-[var(--color-info)]',
}

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  )
}
