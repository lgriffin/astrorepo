import React, { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { NAV_GROUPS, jobsStatus, locate } from '@shared/navigation'
import type { JobsView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { NAV_ICONS } from './nav-icons'
import { Logo } from '../atlas/Logo'

/** The job runner's state, kept in view on every page so a queued run is never out of sight. */
function JobsFooter(): React.ReactElement | null {
  const navigate = useNavigate()
  const [view, setView] = useState<JobsView | null>(null)

  useEffect(() => {
    let current = true
    // Polls can overlap; only the answer to the latest one is shown, so an older snapshot never
    // replaces a newer one.
    let latest = 0
    const load = (): void => {
      const request = ++latest
      const apply = (v: JobsView | null) => current && request === latest && setView(v)
      invoke<JobsView>('jobs:list').then(apply).catch(() => apply(null))
    }
    load()
    const timer = setInterval(load, 15000)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [])

  const status = jobsStatus(view)
  if (!status) return null
  return (
    <button
      onClick={() => navigate('/jobs')}
      className="m-2 p-2 text-left text-xs rounded border border-astro-border bg-astro-bg/50 hover:border-astro-accent"
      title="Open Jobs"
    >
      <span className={status.busy ? 'text-astro-accent' : 'text-astro-muted'}>{status.text}</span>
    </button>
  )
}

/** A place's drawn icon, or its text glyph while it has none yet. */
function NavIcon({ id, glyph }: { id: string; glyph: string }): React.ReactElement {
  const Icon = NAV_ICONS[id]
  if (!Icon) return <span aria-hidden className="text-base w-4 text-center">{glyph}</span>
  return <Icon aria-hidden className="w-4 h-4 shrink-0" strokeWidth={1.75} />
}

export function Sidebar(): React.ReactElement {
  const here = locate(useLocation().pathname)

  return (
    <aside className="w-56 bg-astro-surface border-r border-astro-border flex flex-col shrink-0">
      <div className="p-4 border-b border-astro-border">
        <h1 aria-label="AstroRepo"><Logo /></h1>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label ?? i} className={i > 0 ? 'mt-3' : ''}>
            {group.label && (
              <p className="px-4 pt-2 pb-1 text-xs font-medium text-astro-muted font-condensed">{group.label}</p>
            )}
            {group.items.map(item => {
              // A detail page (a target, a collection, the night form) keeps its place lit.
              const active = here?.item.id === item.id
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={`mx-2 flex items-center gap-3 rounded px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-astro-raised text-astro-text font-medium [&>svg]:text-astro-accent'
                      : 'text-astro-muted hover:text-astro-text hover:bg-astro-raised/60'
                  }`}
                >
                  <NavIcon id={item.id} glyph={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>
      <JobsFooter />
    </aside>
  )
}
