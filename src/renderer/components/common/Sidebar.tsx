import React, { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ListChecks, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { NAV_PLACES, jobsStatus, locate } from '@shared/navigation'
import { startsAsRail } from '@shared/layout'
import type { JobsView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { PLACE_ICONS } from './nav-icons'
import { Logo, LogoMark } from '../atlas/Logo'

/** The job runner's state, kept in view on every page so a queued run is never out of sight. */
function JobsFooter({ rail }: { rail: boolean }): React.ReactElement | null {
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
  // Folded, the line becomes an icon that still says it, to screen readers and on hover.
  if (rail) {
    return (
      <button
        onClick={() => navigate('/jobs')}
        aria-label={status.text}
        title={status.text}
        className="mx-2 mb-2 flex justify-center rounded p-2 hover:bg-astro-raised/60"
      >
        <ListChecks aria-hidden className={`w-4 h-4 ${status.busy ? 'text-astro-accent' : 'text-astro-muted'}`} strokeWidth={1.75} />
      </button>
    )
  }
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

const RAIL_KEY = 'astrorepo.rail'

function railCached(): boolean {
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(RAIL_KEY)
  } catch {
    // Blocked storage falls back to the screen's width.
  }
  return startsAsRail(saved, window.innerWidth)
}

/**
 * The eight places (LF-011), each opening on its first page and lit while any of its pages or
 * their detail pages is open, a way into the command palette, and the job runner's state. It
 * folds to a rail of icons, remembered on this screen.
 */
export function Sidebar({ onSearch }: { onSearch: () => void }): React.ReactElement {
  const here = locate(useLocation().pathname)
  const [rail, setRail] = useState(railCached)

  const fold = (next: boolean): void => {
    setRail(next)
    try {
      window.localStorage.setItem(RAIL_KEY, next ? '1' : '0')
    } catch {
      // Blocked storage only forgets the choice on the next start.
    }
  }

  const Fold = rail ? PanelLeftOpen : PanelLeftClose
  const item = 'flex items-center gap-3 rounded text-sm transition-colors'
  const pad = rail ? 'justify-center mx-2 p-2' : 'mx-2 px-3 py-2'

  return (
    <aside className={`${rail ? 'w-16' : 'w-56'} bg-astro-surface border-r border-astro-border flex flex-col shrink-0 transition-[width]`}>
      <div className={`flex items-center border-b border-astro-border ${rail ? 'justify-center p-3' : 'justify-between p-4'}`}>
        {rail ? <h1 aria-label="AstroRepo"><LogoMark size={28} /></h1> : <h1 aria-label="AstroRepo"><Logo /></h1>}
      </div>
      <button
        type="button"
        onClick={onSearch}
        title="Go to (Ctrl+K)"
        aria-keyshortcuts="Control+K"
        className={`${item} ${pad} mt-3 border border-astro-border text-astro-muted hover:text-astro-text hover:border-astro-muted`}
      >
        <Search aria-hidden className="w-4 h-4 shrink-0" strokeWidth={1.75} />
        {!rail && (
          <>
            <span className="flex-1 text-left">Go to</span>
            <kbd className="font-condensed text-xs">Ctrl K</kbd>
          </>
        )}
      </button>
      <nav aria-label="Places" className="flex-1 py-3 overflow-y-auto space-y-0.5">
        {NAV_PLACES.map(place => {
          const active = here?.place.id === place.id
          const Icon = PLACE_ICONS[place.id]
          return (
            <NavLink
              key={place.id}
              to={place.pages[0].to}
              title={rail ? place.label : undefined}
              aria-label={rail ? place.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={`${item} ${pad} ${
                active
                  ? 'bg-astro-raised text-astro-text font-medium [&>svg]:text-astro-accent'
                  : 'text-astro-muted hover:text-astro-text hover:bg-astro-raised/60'
              }`}
            >
              <Icon aria-hidden className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
              {!rail && <span>{place.label}</span>}
            </NavLink>
          )
        })}
      </nav>
      <JobsFooter rail={rail} />
      <button
        type="button"
        onClick={() => fold(!rail)}
        aria-label={rail ? 'Show the sidebar' : 'Fold the sidebar to icons'}
        title={rail ? 'Show the sidebar' : 'Fold the sidebar to icons'}
        className={`${item} ${pad} mb-3 text-astro-muted hover:text-astro-text`}
      >
        <Fold aria-hidden className="w-4 h-4 shrink-0" strokeWidth={1.75} />
        {!rail && <span>Fold</span>}
      </button>
    </aside>
  )
}
