import React from 'react'
import type { ToastItem } from '../../contexts/ToastContext'

const borderColors: Record<ToastItem['type'], string> = {
  success: 'border-l-green-500',
  error: 'border-l-red-500',
  info: 'border-l-astro-accent'
}

export function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }): React.ReactElement {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 bg-astro-surface border border-astro-border border-l-4 ${borderColors[toast.type]} rounded-lg shadow-lg min-w-[280px] max-w-[400px] animate-slide-in`}>
      <span className="text-sm text-astro-text flex-1">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="text-astro-muted hover:text-astro-text text-sm leading-none mt-0.5"
      >
        ✕
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }): React.ReactElement | null {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}
