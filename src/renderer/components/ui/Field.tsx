import React, { useId } from 'react'

const CONTROL =
  'w-full rounded-md border border-astro-border bg-astro-bg px-3 text-sm text-astro-text transition-colors focus:outline-none focus:border-astro-accent focus:ring-1 focus:ring-astro-accent disabled:opacity-50 aria-[invalid=true]:border-astro-danger'

interface FieldProps {
  label: string
  /** A line under the control saying what the value is for. */
  hint?: React.ReactNode
  /** Says what is wrong with the value; the control is marked invalid while it is set. */
  error?: string | null
  className?: string
  /** Draws the control, given the id and the ids describing it. */
  children: (control: { id: string; describedBy: string | undefined; invalid: boolean }) => React.ReactNode
}

/** A labelled control with its hint and error, wired for screen readers (LF-006). */
export function Field({ label, hint, error, className = '', children }: FieldProps): React.ReactElement {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-astro-muted">{label}</label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && <p id={hintId} className="text-xs text-astro-muted">{hint}</p>}
      {error && <p id={errorId} className="text-xs text-astro-danger">{error}</p>}
    </div>
  )
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`${CONTROL} h-9 ${className}`} {...rest} />
})

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', ...rest }, ref) {
  return <select ref={ref} className={`${CONTROL} h-9 ${className}`} {...rest} />
})

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`${CONTROL} py-2 ${className}`} {...rest} />
})

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode
  hint?: React.ReactNode
}

/** A checkbox with its label beside it and an optional line under it. */
export function Checkbox({ label, hint, className = '', ...rest }: CheckboxProps): React.ReactElement {
  return (
    <label className={`flex items-start gap-2 text-sm text-astro-text cursor-pointer ${className}`}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-astro-accent" {...rest} />
      <span>
        {label}
        {hint && <span className="block text-xs text-astro-muted">{hint}</span>}
      </span>
    </label>
  )
}
