import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { ToastContainer } from '../components/common/Toast'

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastItem['type']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    const handle = timers.current.get(id)
    if (handle) { clearTimeout(handle); timers.current.delete(id) }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = nextId++
    setToasts(prev => [...prev, { id, message, type }])
    timers.current.set(id, setTimeout(() => { timers.current.delete(id); dismiss(id) }, 4000))
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export type { ToastItem }
