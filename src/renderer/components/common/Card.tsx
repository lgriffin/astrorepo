import React from 'react'

interface CardProps {
  title: string
  /** A link or button beside the title (for example "Seasons" or "Check for duplicates"). */
  action?: React.ReactNode
  tone?: 'normal' | 'danger'
  id?: string
  className?: string
  children: React.ReactNode
}

/**
 * The one card every page draws its sections with (specs/017-unified-ux, UX-008): a surface, a
 * small uppercase title, an optional action on the right, then the content.
 */
export function Card({ title, action, tone = 'normal', id, className = '', children }: CardProps): React.ReactElement {
  const border = tone === 'danger' ? 'border-red-500/30' : 'border-astro-border'
  const heading = tone === 'danger' ? 'text-red-400' : 'text-astro-muted'
  return (
    <section id={id} className={`scroll-mt-6 bg-astro-surface border ${border} rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className={`text-sm font-semibold ${heading} uppercase tracking-wider`}>{title}</h2>
        {action}
      </div>
      <div>{children}</div>
    </section>
  )
}

/** What an empty card says: what would appear here, and what to do to make it appear. */
export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }): React.ReactElement {
  return (
    <div className="text-sm text-astro-muted">
      <p>{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** A text link styled the same everywhere, for card actions and "go there" links. */
export function LinkButton({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }): React.ReactElement {
  return (
    <button onClick={onClick} title={title} className="text-xs text-astro-accent hover:underline disabled:opacity-50">
      {children}
    </button>
  )
}
