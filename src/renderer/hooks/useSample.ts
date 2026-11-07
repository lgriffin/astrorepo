import { useEffect, useState } from 'react'
import type { SampleStatus } from '@shared/sample'
import { invoke } from './useIPC'

/**
 * Whether the desktop app is on the sample (specs/046-everyday-ux, U5); null until known. Only the
 * desktop app has the sample, so a browser or companion screen never asks (EUX-017).
 */
export function useSampleStatus(): SampleStatus | null {
  const desktop = window.astrorepoMode === 'desktop'
  const [status, setStatus] = useState<SampleStatus | null>(desktop ? null : { active: false })
  useEffect(() => {
    if (!desktop) return
    let current = true
    invoke<SampleStatus>('sample:status')
      .then(s => { if (current) setStatus(s) })
      .catch(() => { if (current) setStatus({ active: false }) })
    return () => {
      current = false
    }
  }, [desktop])
  return status
}

/** Turns the sample on or off; the app restarts once it has answered. Resolves to an error to show, if any. */
export async function switchSample(to: 'start' | 'leave'): Promise<string | null> {
  try {
    const r = await invoke<{ ok: boolean; error?: string }>(`sample:${to}`)
    return r.ok ? null : (r.error ?? 'The sample could not be changed.')
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
