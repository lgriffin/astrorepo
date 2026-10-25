import React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-astro-accent text-astro-on-accent hover:bg-astro-accent/85 border border-transparent',
  secondary: 'bg-astro-raised text-astro-text hover:bg-astro-raised/70 border border-astro-border',
  ghost: 'bg-transparent text-astro-muted hover:text-astro-text hover:bg-astro-raised border border-transparent',
  danger: 'bg-astro-danger text-astro-on-accent hover:bg-astro-danger/85 border border-transparent'
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2'
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** An icon drawn before the label. */
  icon?: React.ReactNode
  /** Shows the action is under way and stops a second press. */
  busy?: boolean
}

/**
 * The one button (specs/041-look-and-feel, LF-006): primary for the page's main action, secondary
 * for the rest, ghost for quiet actions in a row, danger for what removes something.
 */
export function Button({ variant = 'secondary', size = 'md', icon, busy = false, disabled, className = '', children, type = 'button', ...rest }: ButtonProps): React.ReactElement {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {icon && <span aria-hidden className="shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      {children}
    </button>
  )
}
