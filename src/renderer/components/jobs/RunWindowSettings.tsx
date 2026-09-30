import React, { useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { JobsView } from '@shared/types'

const FIELDS = [
  { key: 'job_window_start', name: 'windowStart', label: 'Window opens', type: 'time' },
  { key: 'job_window_end', name: 'windowEnd', label: 'Window closes', type: 'time' },
  { key: 'job_idle_minutes', name: 'idleMinutes', label: 'Idle for (minutes)', type: 'number' },
  { key: 'job_max_cpu_percent', name: 'maxCpuPercent', label: 'CPU below (%)', type: 'number' }
] as const

/** Settings > Run window: when queued jobs may start (specs/016-job-runner). */
export function RunWindowSettings(): React.ReactElement {
  const [view, setView] = useState<JobsView | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const load = (): void => {
    invoke<JobsView>('jobs:list')
      .then(v => {
        setView(v)
        setValues(Object.fromEntries(FIELDS.map(f => [f.key, String(v.settings[f.name])])))
      })
      .catch(() => setView(null))
  }
  useEffect(load, [])

  async function save(): Promise<void> {
    await Promise.all(FIELDS.map(f => invoke('settings:set', { key: f.key, value: (values[f.key] ?? '').trim() })))
    setSaved(true)
    load()
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Run window</h2>
      <p className="text-xs text-astro-muted mb-3">
        When queued Siril and Siril_Scripts jobs may start. Set the same time for both ends to allow any time of day. The app must be open for a job to start.
        {view && <span className="text-astro-text"> {view.rules}</span>}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {FIELDS.map(f => (
          <label key={f.key} className="text-xs text-astro-muted">
            {f.label}
            <input
              type={f.type}
              min={f.type === 'number' ? 0 : undefined}
              className="mt-1 w-full bg-astro-bg border border-astro-border rounded px-2 py-1 text-sm text-astro-text"
              value={values[f.key] ?? ''}
              onChange={e => {
                setSaved(false)
                setValues(prev => ({ ...prev, [f.key]: e.target.value }))
              }}
            />
          </label>
        ))}
      </div>
      <button onClick={() => void save()} className="mt-3 px-3 py-1 text-xs bg-astro-accent text-white rounded">
        {saved ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}
