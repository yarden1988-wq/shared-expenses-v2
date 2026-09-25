import type { InputHTMLAttributes, ReactNode } from 'react'

export interface CheckboxFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string
  label: ReactNode
  error?: string
}

export function CheckboxField({ id, label, error, className = '', ...props }: CheckboxFieldProps) {
  const errorId = `${id}-error`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-sm text-foreground">
        <input
          id={id}
          type="checkbox"
          className={`h-4 w-4 rounded border-border text-primary focus:ring-primary ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
        {label}
      </label>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  )
}
