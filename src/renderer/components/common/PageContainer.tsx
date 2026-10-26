import React, { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { locate, type NavPlace } from '@shared/navigation'
import { windowTitle } from '@shared/layout'

interface PageContainerProps {
  /** Only a detail page names itself (a target's name); a place takes its name from the sidebar. */
  title?: string
  /**
   * On a detail page, the line under its title. On a place, a second line of live detail (a
   * count, the site) under the place's own description, which is always shown.
   */
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

/**
 * The pages of a place as a row of links above the title (LF-012), the open one marked; a place
 * with one page has no row.
 */
export function PlacePages({ place, current }: { place: NavPlace; current: string }): React.ReactElement | null {
  if (place.pages.length < 2) return null
  return (
    <nav aria-label={`${place.label} pages`} className="mb-5 flex gap-1 overflow-x-auto border-b border-astro-border">
      {place.pages.map(page => {
        const open = page.id === current
        return (
          <Link
            key={page.id}
            to={page.to}
            aria-current={open ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
              open ? 'border-astro-accent font-medium text-astro-text' : 'border-transparent text-astro-muted hover:text-astro-text'
            }`}
          >
            {page.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Every page's frame: the other pages of its place, or a link back to the page a detail page
 * belongs to; its title and what it answers; and its actions.
 */
export function PageContainer({ title, subtitle, actions, children }: PageContainerProps): React.ReactElement {
  const here = locate(useLocation().pathname)
  const heading = title ?? here?.item.label ?? ''

  useEffect(() => { document.title = windowTitle(heading) }, [heading])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {here && !here.detail && <PlacePages place={here.place} current={here.item.id} />}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          {here?.detail && (
            <Link to={here.item.to} className="inline-flex items-center gap-1 text-xs text-astro-muted hover:text-astro-accent">
              <ChevronLeft aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
              {here.item.label}
            </Link>
          )}
          <h1 className="text-2xl font-bold text-astro-text">{heading}</h1>
          {here && !here.detail && <p className="mt-1 text-sm text-astro-muted">{here.item.hint}</p>}
          {subtitle && <p className={`text-sm text-astro-muted ${here && !here.detail ? 'text-xs mt-0.5' : 'mt-1'}`}>{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
