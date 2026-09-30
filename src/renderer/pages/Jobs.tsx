import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { JobsView, JobView } from '@shared/types'
import { settingsLink } from '@shared/navigation'

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '')

const STATE_COLOUR: Record<JobView['state'], string> = {
  queued: 'text-astro-muted',
  running: 'text-astro-accent',
  succeeded: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-yellow-400'
}

/** The job queue (specs/016-job-runner): what waits for the run window, what runs, and what ran. */
export function Jobs(): React.ReactElement {
  const navigate = useNavigate()
  const [view, setView] = useState<JobsView | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [logFor, setLogFor] = useState<string | null>(null)
  const [log, setLog] = useState('')

  const load = (): void => {
    invoke<JobsView>('jobs:list').then(setView).catch(() => setView(null))
  }
  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  const running = view?.running?.id ?? null
  useEffect(() => {
    if (!logFor) return
    let current = true
    const read = (): void => {
      invoke<{ text: string }>('jobs:log', { job_id: logFor }).then(r => current && setLog(r.text)).catch(() => current && setLog(''))
    }
    read()
    const timer = logFor === running ? setInterval(read, 3000) : null
    return () => {
      current = false
      if (timer) clearInterval(timer)
    }
  }, [logFor, running])

  async function act(channel: 'jobs:cancel' | 'jobs:run-now', job: JobView): Promise<void> {
    const r = await invoke<{ ok: boolean; error?: string }>(channel, { job_id: job.id })
    setMessage(r.ok ? null : r.error ?? 'That did not work.')
    load()
  }

  const row = (job: JobView) => (
    <div key={job.id} className="border-t border-astro-border py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <span className="text-sm text-astro-text">{job.title}</span>
          <span className={`ml-2 text-xs ${STATE_COLOUR[job.state]}`}>{job.stateLabel}</span>
          {job.timing === 'now' && job.state === 'queued' && <span className="ml-2 text-xs text-astro-accent">Run now</span>}
        </div>
        <div className="flex gap-2 shrink-0">
          {job.canRunNow && (
            <button onClick={() => void act('jobs:run-now', job)} className="px-2 py-1 text-xs border border-astro-border rounded text-astro-text hover:border-astro-accent">
              Run now
            </button>
          )}
          {job.canCancel && (
            <button onClick={() => void act('jobs:cancel', job)} className="px-2 py-1 text-xs border border-astro-border rounded text-red-400 hover:border-red-400">
              Cancel
            </button>
          )}
          <button onClick={() => setLogFor(logFor === job.id ? null : job.id)} className="px-2 py-1 text-xs border border-astro-border rounded text-astro-muted hover:text-astro-text">
            {logFor === job.id ? 'Hide log' : 'Log'}
          </button>
        </div>
      </div>
      {job.waiting && <p className="text-xs text-astro-muted mt-1">{job.waiting}</p>}
      <p className="text-xs text-astro-muted mt-1">
        {[job.estimate, `needs ${job.needed}`, job.duration && `ran ${job.duration}`, job.finishedAt ? `finished ${time(job.finishedAt)}` : `queued ${time(job.queuedAt)}`]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {job.note && <p className={`text-xs mt-1 ${job.state === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>{job.note}</p>}
      {logFor === job.id && (
        <div className="mt-2">
          <p className="text-xs font-mono text-astro-muted break-all">{job.command}</p>
          <pre className="mt-1 max-h-80 overflow-auto bg-astro-bg border border-astro-border rounded p-2 text-xs text-astro-text whitespace-pre-wrap">{log || 'No output yet.'}</pre>
        </div>
      )}
    </div>
  )

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <p className="text-sm text-astro-text">{view?.windowStatus ?? 'Loading the queue…'}</p>
          {view && <p className="text-xs text-astro-muted mt-1">{view.rules} {view.load}</p>}
          <button onClick={() => navigate(settingsLink('run-window'))} className="mt-2 text-xs text-astro-accent hover:underline">
            Change the run window in Settings
          </button>
          {message && <p className="text-xs text-red-400 mt-2">{message}</p>}
        </div>

        <section className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Running</h2>
          {view?.running ? row(view.running) : <p className="text-xs text-astro-muted">Nothing is running.</p>}
        </section>

        <section className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Queued</h2>
          {view && view.queue.length > 0 ? (
            view.queue.map(row)
          ) : (
            <p className="text-xs text-astro-muted">Nothing is queued. Queue a stack or post-processing run from a target's page.</p>
          )}
        </section>

        {view && view.history.length > 0 && (
          <section className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Finished</h2>
            {view.history.map(row)}
          </section>
        )}
      </div>
    </PageContainer>
  )
}
