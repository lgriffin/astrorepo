import React, { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { NAV_GROUPS, jobsStatus, locate } from '@shared/navigation'
import type { JobsView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'

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

export function Sidebar(): React.ReactElement {
  const here = locate(useLocation().pathname)

  return (
    <aside className="w-56 bg-astro-surface border-r border-astro-border flex flex-col shrink-0">
      <div className="p-4 border-b border-astro-border">
        <h1 className="text-lg font-bold text-astro-accent tracking-wide">AstroRepo</h1>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label ?? i} className={i > 0 ? 'mt-3' : ''}>
            {group.label && (
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-astro-muted/70 uppercase tracking-wider">{group.label}</p>
            )}
            {group.items.map(item => {
              // A detail page (a target, a collection, the night form) keeps its place lit.
              const active = here?.item.id === item.id
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-astro-accent/10 text-astro-accent border-r-2 border-astro-accent'
                      : 'text-astro-muted hover:text-astro-text hover:bg-astro-bg/50'
                  }`}
                >
                  <span className="text-base w-5 text-center">{item.icon}</span>
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
