import type { ReactNode } from 'react'

export function EmptyState({
  message,
  icon,
  action,
}: {
  message: ReactNode
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-muted px-4 py-8 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm text-muted">{message}</p>
      {action}
    </div>
  )
}
