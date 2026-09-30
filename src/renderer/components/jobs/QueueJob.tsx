import React, { useState } from 'react'
import { Link } from 'react-router-dom'

export interface QueueResult {
  ok: boolean
  title?: string
  error?: string
}

/**
 * Queue a run after a confirm step that shows what it will do (specs/016-job-runner, JOB-001).
 * The main process works the plan out again before anything is queued.
 */
export function QueueJob({ label, confirm, onQueue }: { label: string; confirm: string[]; onQueue: (timing: 'window' | 'now') => Promise<QueueResult> }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<QueueResult | null>(null)

  async function queue(timing: 'window' | 'now'): Promise<void> {
    setBusy(true)
    try {
      setResult(await onQueue(timing))
      setOpen(false)
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  if (result?.ok) {
    return (
      <p className="text-xs text-green-400">
        Queued: {result.title}. <Link to="/jobs" className="text-astro-accent hover:underline">See Jobs</Link>
      </p>
    )
  }
  return (
    <div className="text-xs">
      {!open ? (
        <button onClick={() => { setResult(null); setOpen(true) }} className="px-3 py-1 bg-astro-accent text-white rounded">
          {label}
        </button>
      ) : (
        <div className="border border-astro-border rounded p-2 space-y-1 bg-astro-bg">
          <p className="font-semibold text-astro-text">Check before queueing</p>
          <ul className="list-disc pl-4 text-astro-muted space-y-0.5">{confirm.map(line => <li key={line}>{line}</li>)}</ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <button disabled={busy} onClick={() => void queue('window')} className="px-3 py-1 bg-astro-accent text-white rounded disabled:opacity-50">
              Queue for the run window
            </button>
            <button disabled={busy} onClick={() => void queue('now')} className="px-3 py-1 border border-astro-border rounded text-astro-text disabled:opacity-50">
              Run as soon as possible
            </button>
            <button disabled={busy} onClick={() => setOpen(false)} className="px-3 py-1 text-astro-muted">
              Back
            </button>
          </div>
        </div>
      )}
      {result?.error && <p className="text-red-400 mt-1">{result.error}</p>}
    </div>
  )
}
