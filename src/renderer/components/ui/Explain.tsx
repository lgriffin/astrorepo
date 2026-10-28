import React, { useEffect, useId, useRef, useState } from 'react'
import { CircleHelp, ExternalLink, X } from 'lucide-react'
import { conceptAtLevel } from '@shared/learning'
import { useLearning } from '../../contexts/LearningContext'

/**
 * The one "Why?" (specs/042-learning, LRN-001): a quiet button beside a number or a word that opens
 * the idea behind it, at the user's learning level, with related ideas to follow and the sources
 * it rests on. Escape (from the button or the panel) or Close shuts it and gives focus back to the
 * button; a click outside shuts it too. Built of phrasing elements only, so it can sit inside a
 * sentence. The panel is placed against the window, not its parent, so a scrolling table or card
 * never cuts it off; it opens above the button when there is more room there, and scrolling shuts it. Hidden when learning is off, or when the concept is not in the knowledge base.
 */
export function Explain({ concept: id, label = 'Why?' }: { concept: string; label?: string }): React.ReactElement | null {
  const { level, concept, source, openSource, remember } = useLearning()
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(id)
  // Where the panel sits in the window: towards the side with more room, so it never runs off screen.
  const [place, setPlace] = useState<React.CSSProperties>({})
  const panelId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLSpanElement>(null)

  useEffect(() => setShown(id), [id])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (panel.current?.contains(t) || button.current?.contains(t)) return
      setOpen(false)
      setShown(id)
    }
    // The panel is fixed to the window, so it would drift from its button: scrolling anything else shuts it.
    const onScroll = (e: Event): void => {
      if (panel.current?.contains(e.target as Node)) return
      setOpen(false)
      setShown(id)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, id])

  // Each idea read joins the trail on the Learn page (LRN-025).
  useEffect(() => {
    if (open && concept(shown)) remember(shown)
  }, [open, shown, concept, remember])

  const root = concept(id)
  const current = concept(shown) ?? root
  if (!root || !current) return null
  const text = conceptAtLevel(current, level)
  if (!text) return null

  const show = (): void => {
    const box = button.current?.getBoundingClientRect()
    if (box) {
      const w = window.innerWidth
      const h = window.innerHeight
      const across: React.CSSProperties = box.left > w / 2 ? { right: Math.max(8, w - box.right) } : { left: Math.max(8, box.left) }
      const down = h - box.bottom >= box.top
      setPlace({ ...across, ...(down ? { top: box.bottom + 4 } : { bottom: h - box.top + 4 }), maxHeight: (down ? h - box.bottom : box.top) - 12 })
    }
    setOpen(true)
  }

  const close = (): void => {
    setOpen(false)
    setShown(id)
    button.current?.focus()
  }

  return (
    <span
      className="relative inline-block align-baseline"
      onKeyDown={e => {
        if (open && e.key === 'Escape') {
          e.stopPropagation()
          close()
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : show())}
        className="inline-flex items-center gap-1 rounded px-1 text-xs text-astro-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-astro-accent"
      >
        <CircleHelp aria-hidden className="h-3.5 w-3.5" />
        {label}
        <span className="sr-only"> {root.title}</span>
      </button>
      {open && (
        <span
          ref={panel}
          id={panelId}
          role="region"
          aria-label={current.title}
          style={place}
          className="fixed z-50 block w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-astro-border bg-astro-raised p-3 text-left font-sans shadow-lg"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="font-condensed text-sm font-semibold text-astro-text">{current.title}</span>
            <button type="button" onClick={close} className="text-astro-muted hover:text-astro-text" aria-label="Close">
              <X aria-hidden className="h-4 w-4" />
            </button>
          </span>
          <span className="mt-1 block text-sm text-astro-text">{text.short}</span>
          {text.detail && <span className="mt-2 block text-sm text-astro-muted">{text.detail}</span>}
          {text.formula && <span className="mt-2 block rounded bg-astro-bg px-2 py-1 font-mono text-xs text-astro-text">{text.formula}</span>}
          {current.related.length > 0 && (
            <span className="mt-2 flex flex-wrap items-center gap-1 text-xs">
              <span className="text-astro-muted">Next:</span>
              {current.related.map(r => {
                const c = concept(r)
                return c ? (
                  <button key={r} type="button" onClick={() => setShown(r)} className="rounded border border-astro-border px-1.5 py-0.5 text-astro-accent hover:bg-astro-surface">
                    {c.title}
                  </button>
                ) : null
              })}
            </span>
          )}
          <span className="mt-2 block space-y-0.5 text-xs">
            {current.sources.map(s => {
              const src = source(s)
              return src ? (
                <span key={s} className="block">
                  <button type="button" onClick={() => openSource(s)} className="inline-flex items-center gap-1 text-astro-muted hover:text-astro-accent hover:underline">
                    <ExternalLink aria-hidden className="h-3 w-3" />
                    {src.title}, {src.publisher}
                  </button>
                </span>
              ) : null
            })}
          </span>
        </span>
      )}
    </span>
  )
}
