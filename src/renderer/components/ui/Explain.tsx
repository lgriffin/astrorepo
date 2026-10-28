import React, { useEffect, useId, useRef, useState } from 'react'
import { CircleHelp, ExternalLink, X } from 'lucide-react'
import { conceptAtLevel } from '@shared/learning'
import { useLearning } from '../../contexts/LearningContext'

/**
 * The one "Why?" (specs/042-learning, LRN-001): a quiet button beside a number or a word that opens
 * the idea behind it, at the user's learning level, with related ideas to follow and the sources
 * it rests on. Escape or a click outside closes it and gives focus back to the button. Hidden when
 * learning is off, or when the concept is not in the knowledge base.
 */
export function Explain({ concept: id, label = 'Why?' }: { concept: string; label?: string }): React.ReactElement | null {
  const { level, concept, source, openSource } = useLearning()
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(id)
  const panelId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => setShown(id), [id])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const root = concept(id)
  const current = concept(shown) ?? root
  if (!root || !current) return null
  const text = conceptAtLevel(current, level)
  if (!text) return null

  const close = (): void => {
    setOpen(false)
    setShown(id)
    button.current?.focus()
  }

  return (
    <span className="relative inline-block align-baseline">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex items-center gap-1 rounded px-1 text-xs text-astro-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-astro-accent"
      >
        <CircleHelp aria-hidden className="h-3.5 w-3.5" />
        {label}
        <span className="sr-only"> {root.title}</span>
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          role="region"
          aria-label={current.title}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              close()
            }
          }}
          className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-astro-border bg-astro-raised p-3 text-left shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-condensed text-sm font-semibold text-astro-text">{current.title}</p>
            <button type="button" onClick={close} className="text-astro-muted hover:text-astro-text" aria-label="Close">
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-sm text-astro-text">{text.short}</p>
          {text.detail && <p className="mt-2 text-sm text-astro-muted">{text.detail}</p>}
          {text.formula && <p className="mt-2 rounded bg-astro-bg px-2 py-1 font-mono text-xs text-astro-text">{text.formula}</p>}
          {current.related.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
              <span className="text-astro-muted">Next:</span>
              {current.related.map(r => {
                const c = concept(r)
                return c ? (
                  <button key={r} type="button" onClick={() => setShown(r)} className="rounded border border-astro-border px-1.5 py-0.5 text-astro-accent hover:bg-astro-surface">
                    {c.title}
                  </button>
                ) : null
              })}
            </div>
          )}
          <ul className="mt-2 space-y-0.5 text-xs">
            {current.sources.map(s => {
              const src = source(s)
              return src ? (
                <li key={s}>
                  <button type="button" onClick={() => openSource(s)} className="inline-flex items-center gap-1 text-astro-muted hover:text-astro-accent hover:underline">
                    <ExternalLink aria-hidden className="h-3 w-3" />
                    {src.title}, {src.publisher}
                  </button>
                </li>
              ) : null
            })}
          </ul>
        </div>
      )}
    </span>
  )
}
