import React from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import type { ToastItem } from '../../contexts/ToastContext'

/** Each kind's mark and colour; the icon says it too, so colour is never the only sign (LF-029). */
const KIND: Record<ToastItem['type'], { icon: typeof Info; tone: string; word: string }> = {
  success: { icon: CircleCheck, tone: 'text-astro-success', word: 'Done' },
  error: { icon: CircleAlert, tone: 'text-astro-danger', word: 'Problem' },
  info: { icon: Info, tone: 'text-astro-info', word: 'Note' }
}

export function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }): React.ReactElement {
  const { icon: Icon, tone, word } = KIND[toast.type]
  return (
    <div
      role={toast.type === 'error' ? 'alert' : undefined}
      className="flex w-[22rem] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border border-astro-border bg-astro-surface px-4 py-3 shadow-lg animate-slide-in"
    >
      <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} strokeWidth={2} />
      <p className="flex-1 text-sm text-astro-text">
        <span className="sr-only">{word}: </span>
        {toast.message}
      </p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 rounded p-1 text-astro-muted hover:text-astro-text">
        <X aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}

/**
 * Where toasts appear, bottom right. The region is always there, even empty, so screen readers
 * hear each new message as it arrives.
 */
export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }): React.ReactElement {
  return (
    <div aria-live="polite" aria-label="Messages" className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}
