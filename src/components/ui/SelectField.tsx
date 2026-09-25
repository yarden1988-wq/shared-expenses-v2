import type { ReactNode, SelectHTMLAttributes } from 'react'

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string
  label: string
  error?: string
  children: ReactNode
}

export function SelectField({ id, label, error, className = '', children, ...props }: SelectFieldProps) {
  const errorId = `${id}-error`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <select
        id={id}
        className={`rounded-xl border border-border bg-surface px-3 py-2 text-right text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  )
}
