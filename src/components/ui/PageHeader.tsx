import type { ReactNode } from 'react'

export function PageHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      {action}
    </div>
  )
}
