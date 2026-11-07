import React, { useEffect, useRef } from 'react'
import { SHORTCUTS } from '@shared/keyboard'

/**
 * The keyboard shortcuts, opened with ? or from the sidebar (specs/046-everyday-ux EUX-011). Focus
 * goes to Close; Escape or Close shuts it and gives focus back to where it was.
 */
export function ShortcutsSheet({ onClose }: { onClose: () => void }): React.ReactElement {
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement
    close.current?.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  const onKey = (e: React.KeyboardEvent): void => {
    // Keys stop here, so a dialog underneath (the picture viewer listens on the window) does not act on them too.
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Tab') {
      // Close is the sheet's one control, so focus stays on it.
      e.preventDefault()
      close.current?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-astro-scrim/50 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-lg rounded-lg border border-astro-border bg-astro-surface p-5 shadow-2xl"
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-base font-semibold text-astro-text">Keyboard shortcuts</h2>
          <button ref={close} type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-astro-muted hover:text-astro-text">
            Close
          </button>
        </div>
        <dl className="divide-y divide-astro-border text-sm">
          {SHORTCUTS.map(s => (
            <div key={s.keys.join('+')} className="flex items-start gap-4 py-2">
              <dt className="w-24 shrink-0">
                {s.keys.map((k, i) => (
                  <React.Fragment key={k}>
                    {i > 0 && <span className="px-0.5 text-astro-muted">+</span>}
                    <kbd className="rounded border border-astro-border bg-astro-bg px-1.5 py-0.5 font-condensed text-xs text-astro-text">{k}</kbd>
                  </React.Fragment>
                ))}
              </dt>
              <dd className="text-astro-text">
                {s.does}
                <span className="block text-xs text-astro-muted">{s.where}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
