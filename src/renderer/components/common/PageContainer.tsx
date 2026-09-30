import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { locate } from '@shared/navigation'

interface PageContainerProps {
  /** Only a detail page names itself (a target's name); a place takes its name from the sidebar. */
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

/**
 * Every page's frame: where it sits (the sidebar group, or a link back to the place a detail page
 * belongs to), its title and what it answers, and its actions.
 */
export function PageContainer({ title, subtitle, actions, children }: PageContainerProps): React.ReactElement {
  const here = locate(useLocation().pathname)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          {here?.detail ? (
            <Link to={here.item.to} className="text-xs text-astro-muted hover:text-astro-accent">
              ← {here.item.label}
            </Link>
          ) : (
            here?.group.label && <p className="text-xs text-astro-muted">{here.group.label}</p>
          )}
          <h1 className="text-2xl font-bold text-astro-text">{title ?? here?.item.label ?? ''}</h1>
          {(subtitle ?? (here?.detail ? undefined : here?.item.hint)) && (
            <p className="mt-1 text-sm text-astro-muted">{subtitle ?? here?.item.hint}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
