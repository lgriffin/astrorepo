import React, { useCallback, useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'

interface HostStatus {
  enabled: boolean
  running: boolean
  port: number
  addresses: string[]
  problem: string | null
}

interface CompanionView {
  id: string
  name: string
  screen: string
  pairedAt: string
  lastSeenAt: string | null
}

type Refusable<T> = { ok: true; value: T } | { ok: false; error: string }

const SCREENS = [
  { id: 'follow', label: 'Follow this PC' },
  { id: 'home', label: 'Home' },
  { id: 'sky', label: 'Sky planner' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'images', label: 'Gallery' },
  { id: 'messier', label: 'Messier mosaic' }
]

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'not yet')

/**
 * Settings → Companion screens (specs/035-pi-variant, PI-017 to PI-023): serve this PC to screens
 * on the home network, pair one by the code it shows, choose what each shows, and remove them.
 */
export function CompanionSettings(): React.ReactElement {
  const [status, setStatus] = useState<HostStatus | null>(null)
  const [devices, setDevices] = useState<CompanionView[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [port, setPort] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([invoke<HostStatus>('companion:status'), invoke<CompanionView[]>('companion:list')])
      setStatus(s)
      setPort(String(s.port))
      setDevices(d)
    } catch {
      setUnavailable(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(enabled: boolean): Promise<void> {
    setMessage(null)
    const n = Number(port)
    try {
      setStatus(await invoke<HostStatus>('companion:set-enabled', n === status?.port ? { enabled } : { enabled, port: n }))
    } catch {
      setMessage('The port is a whole number from 1024 to 65535.')
    }
  }

  async function pair(): Promise<void> {
    const answer = await invoke<Refusable<CompanionView>>('companion:approve', { code })
    if (answer.ok) {
      setMessage(`Paired "${answer.value.name}". It opens in a moment.`)
      setCode('')
    } else {
      setMessage(answer.error)
    }
    await load()
  }

  async function act(channel: string, args: unknown): Promise<void> {
    const answer = await invoke<Refusable<null>>(channel, args)
    if (!answer.ok) setMessage(answer.error)
    await load()
  }

  if (unavailable) {
    return (
      <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Companion screens</h2>
        <p className="text-xs text-astro-muted">Only the desktop app on your PC can serve companion screens.</p>
      </div>
    )
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Companion screens</h2>
      <p className="text-xs text-astro-muted mb-3">
        A Raspberry Pi touchscreen, a tablet or another computer on your home network can be a second screen for this PC. It shows the
        same library and can do what you can do here, except pair or remove screens, so only pair screens you own.
      </p>
      <label className="flex items-center gap-2 text-sm text-astro-text">
        <input type="checkbox" checked={status?.enabled ?? false} onChange={e => void toggle(e.target.checked)} />
        Allow companion screens
      </label>
      <label className="block text-xs text-astro-muted mt-2">
        Port
        <input
          value={port}
          inputMode="numeric"
          onChange={e => setPort(e.target.value)}
          onBlur={() => status?.enabled && Number(port) !== status.port && void toggle(true)}
          className="ml-2 w-24 bg-astro-bg border border-astro-border rounded px-2 py-1 text-sm text-astro-text"
        />
      </label>
      {status?.problem && <p className="text-xs text-astro-warning mt-2">{status.problem}</p>}
      {status?.running && (
        <div className="mt-3 text-xs text-astro-muted">
          <p>On the screen, open one of these addresses:</p>
          <ul className="mt-1 space-y-0.5 font-mono text-astro-text">
            {status.addresses.map(a => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <div className="flex gap-2 mt-3 items-center">
            <input
              value={code}
              placeholder="Code shown on the screen"
              inputMode="numeric"
              onChange={e => setCode(e.target.value)}
              className="w-48 bg-astro-bg border border-astro-border rounded px-2 py-1 text-sm text-astro-text"
            />
            <button onClick={() => void pair()} className="px-3 py-1 text-xs bg-astro-accent text-white rounded">
              Pair
            </button>
          </div>
        </div>
      )}
      {message && <p className="text-xs text-astro-muted mt-2">{message}</p>}
      {devices.length > 0 && (
        <ul className="mt-4 divide-y divide-astro-border">
          {devices.map(d => (
            <li key={d.id} className="py-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-astro-text font-medium">{d.name}</span>
              <span className="text-xs text-astro-muted">Paired {when(d.pairedAt)}, last seen {when(d.lastSeenAt)}</span>
              <select
                value={d.screen}
                aria-label={`What ${d.name} shows`}
                onChange={e => void act('companion:set-screen', { id: d.id, screen: e.target.value })}
                className="ml-auto bg-astro-bg border border-astro-border rounded px-2 py-1 text-xs text-astro-text"
              >
                {SCREENS.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void act('companion:remove', { id: d.id })}
                className="px-2 py-1 text-xs border border-astro-border text-astro-muted rounded hover:text-astro-danger hover:border-astro-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
