import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { JobsView, JobView } from '@shared/types'
import { settingsLink, targetLink } from '@shared/navigation'
import { Card, EmptyState, LinkButton } from '../components/common/Card'

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
          <button onClick={() => navigate(targetLink(job.targetId, 'process'))} className="px-2 py-1 text-xs border border-astro-border rounded text-astro-muted hover:text-astro-text">
            Open target
          </button>
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
      {job.progress && <p className="text-xs text-astro-text mt-1">{job.progress}</p>}
      {job.note && <p className={`text-xs mt-1 ${job.state === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>{job.note}</p>}
      {job.outputs.map(o => (
        <p key={o.path} className="text-xs text-astro-muted mt-1 break-all" title={o.manifest}>
          Published {o.path}, with its manifest beside it.
        </p>
      ))}
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
        <Card title="Run window" action={<LinkButton onClick={() => navigate(settingsLink('run-window'))}>Change the run window in Settings</LinkButton>}>
          <p className="text-sm text-astro-text">{view?.windowStatus ?? 'Loading the queue…'}</p>
          {view && <p className="text-xs text-astro-muted mt-1">{view.rules} {view.load}</p>}
          {message && <p className="text-xs text-red-400 mt-2">{message}</p>}
        </Card>

        <Card title="Running">{view?.running ? row(view.running) : <EmptyState>Nothing is running.</EmptyState>}</Card>

        <Card title="Queued">
          {view && view.queue.length > 0 ? (
            view.queue.map(row)
          ) : (
            <EmptyState action={<LinkButton onClick={() => navigate('/targets')}>Open Targets</LinkButton>}>
              Nothing is queued. Queue a stack or post-processing run from a target's page.
            </EmptyState>
          )}
        </Card>

        {view && view.history.length > 0 && <Card title="Finished">{view.history.map(row)}</Card>}
      </div>
    </PageContainer>
  )
}
