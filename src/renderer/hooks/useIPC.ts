import { useState, useCallback } from 'react'

declare global {
  interface Window {
    api: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

interface UseIPCState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface UseIPCReturn<T> extends UseIPCState<T> {
  execute: (...args: unknown[]) => Promise<T>
  reset: () => void
}

export function useIPC<T>(channel: string): UseIPCReturn<T> {
  const [state, setState] = useState<UseIPCState<T>>({
    data: null,
    loading: false,
    error: null
  })

  const execute = useCallback(
    async (...args: unknown[]): Promise<T> => {
      setState({ data: null, loading: true, error: null })
      try {
        const result = (await window.api.invoke(channel, ...args)) as T
        setState({ data: result, loading: false, error: null })
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setState({ data: null, loading: false, error: message })
        throw err
      }
    },
    [channel]
  )

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return { ...state, execute, reset }
}

export async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return (await window.api.invoke(channel, ...args)) as T
}
