import React, { useRef } from 'react'

export interface TabItem<T extends string> {
  id: T
  label: string
  /** A count or short note beside the label. */
  badge?: React.ReactNode
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[]
  active: T
  onChange: (id: T) => void
  /** Names the set for screen readers. */
  label: string
}

/** The tab a key moves to from tab `index` of `count` (LF-007), wrapping at the ends; null for other keys. */
export function tabKeyTarget(key: string, index: number, count: number): number | null {
  const to = ({ ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: count - 1 } as Record<string, number>)[key]
  return to === undefined ? null : (to + count) % count
}

/** Where an arrow key moves in a radio group (LF-007): up and left back, down and right on, wrapping. */
export function radioKeyTarget(key: string, index: number, count: number): number | null {
  return tabKeyTarget(({ ArrowDown: 'ArrowRight', ArrowUp: 'ArrowLeft' } as Record<string, string>)[key] ?? key, index, count)
}

/**
 * A row of tabs with the keyboard behaviour people expect (LF-007): arrows move between tabs,
 * Home and End jump to the ends, and only the active tab sits in the tab order.
 */
export function Tabs<T extends string>({ tabs, active, onChange, label }: TabsProps<T>): React.ReactElement {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number): void => {
    const next = tabKeyTarget(e.key, i, tabs.length)
    if (next === null) return
    e.preventDefault()
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-astro-border">
      {tabs.map((t, i) => {
        const selected = t.id === active
        return (
          <button
            key={t.id}
            ref={el => { refs.current[i] = el }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={e => onKey(e, i)}
            className={`-mb-px px-3 py-2 text-sm border-b-2 transition-colors ${
              selected ? 'border-astro-accent text-astro-text font-medium' : 'border-transparent text-astro-muted hover:text-astro-text'
            }`}
          >
            {t.label}
            {t.badge !== undefined && <span className="ml-1.5 text-xs text-astro-muted">{t.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
