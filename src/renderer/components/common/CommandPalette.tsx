import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { matchEntries, paletteEntries, paletteKeyTarget, targetEntry, type PaletteEntry } from '@shared/command-palette'
import type { TargetSummary } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { ACTION_ICON, NAV_ICONS } from './nav-icons'

const ENTRIES = paletteEntries()
/** Targets asked of the index per query, and the most shown. */
const TARGET_POOL = 40
const TARGETS_SHOWN = 6

/** The icon beside an entry: the page's own, or the actions' one. */
function EntryIcon({ entry }: { entry: PaletteEntry }): React.ReactElement {
  const Icon = entry.kind === 'action' ? ACTION_ICON : NAV_ICONS[entry.icon] ?? ACTION_ICON
  return <Icon aria-hidden className="h-4 w-4 shrink-0 text-astro-muted" strokeWidth={1.75} />
}

/**
 * Go anywhere by typing (LF-013): every page, Settings section and common action, and targets by
 * name once two letters are typed. Arrows move, Enter opens, Escape closes and gives focus back.
 */
export function CommandPalette({ onClose }: { onClose: () => void }): React.ReactElement {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  // Targets found for one query; shown only while that query is still the one typed.
  const [found, setFound] = useState<{ query: string; targets: PaletteEntry[] }>({ query: '', targets: [] })
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const opener = useRef<Element | null>(null)
  const went = useRef(false)

  // Closing gives focus back to where it was; opening a page puts it on that page instead, since
  // the control that opened the palette may have gone with the old page.
  useEffect(() => {
    opener.current = document.activeElement
    input.current?.focus()
    return () => {
      if (went.current) document.getElementById('main')?.focus()
      else if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus()
    }
  }, [])

  // Targets are looked up as the user types; an older answer never replaces a newer one.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    let current = true
    const timer = setTimeout(() => {
      // Ask for more than are shown, so the palette's own ranking, not the database's order, picks them.
      invoke<{ targets: TargetSummary[] }>('targets:search', { query: q, limit: TARGET_POOL })
        .then(r => current && setFound({ query: q, targets: (r?.targets ?? []).map(targetEntry) }))
        .catch(() => current && setFound({ query: q, targets: [] }))
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  // Targets rank with everything else under the same word-start rule.
  const shown = useMemo(() => {
    if (!query.trim()) return ENTRIES
    const targets = found.query === query.trim() ? found.targets : []
    return matchEntries([...ENTRIES, ...matchEntries(targets, query, TARGETS_SHOWN)], query, 14)
  }, [query, found])
  const active = Math.min(index, Math.max(0, shown.length - 1))

  const open = (entry: PaletteEntry): void => {
    went.current = true
    onClose()
    navigate(entry.to)
  }

  // On the dialog, so Escape works wherever focus is in it; Tab stays on the input, the one stop.
  const onDialogKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      input.current?.focus()
    }
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (shown[active]) open(shown[active])
      return
    }
    const next = paletteKeyTarget(e.key, active, shown.length)
    if (next === null) return
    e.preventDefault()
    setIndex(next)
    document.getElementById(`palette-${next}`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-astro-scrim/50 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-astro-border bg-astro-surface shadow-2xl"
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={onDialogKey}
      >
        <div className="flex items-center gap-3 border-b border-astro-border px-4">
          <Search aria-hidden className="h-4 w-4 text-astro-muted" strokeWidth={1.75} />
          <input
            ref={input}
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={shown[active] ? `palette-${active}` : undefined}
            aria-label="Go to a page, setting or target"
            placeholder="Go to a page, setting or target"
            className="w-full bg-transparent py-3 text-sm text-astro-text focus-visible:outline-none"
          />
        </div>
        <ul id="palette-list" role="listbox" aria-label="Places" className="max-h-[50vh] overflow-y-auto py-1">
          {shown.map((entry, i) => (
            <li
              key={entry.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setIndex(i)}
              onClick={() => open(entry)}
              className={`mx-1 flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm ${i === active ? 'bg-astro-raised text-astro-text' : 'text-astro-text'}`}
            >
              <EntryIcon entry={entry} />
              <span className="flex-1 truncate">{entry.label}</span>
              <span className="font-condensed text-xs text-astro-muted">{entry.where}</span>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-3 text-sm text-astro-muted">Nothing matches “{query.trim()}”.</li>}
        </ul>
        <p className="border-t border-astro-border px-4 py-2 text-xs text-astro-muted">Up and down to move, Enter to open, Esc to close</p>
      </div>
    </div>
  )
}
