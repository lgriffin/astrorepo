import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState, LinkButton } from '../components/common/Card'
import { invoke } from '../hooks/useIPC'
import { IngestPanel } from '../components/vespera/IngestPanel'
import type { VesperaObservationView, VesperaProgressView, VesperaSettingsView, VesperaSurveyView } from '@shared/types'
import { settingsLink } from '@shared/navigation'

type Format = VesperaSettingsView['formats'][number]

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: 'fits', label: 'FITS frames', hint: 'the raw frames, for stacking in Siril' },
  { id: 'tiff', label: 'TIFF', hint: "the scope's own stack" },
  { id: 'jpeg', label: 'JPEG', hint: 'previews' },
  { id: 'json', label: 'JSON metadata', hint: 'what the scope recorded about each observation' }
]

const STATE_COLOUR: Record<VesperaObservationView['state'], string> = {
  new: 'text-astro-accent',
  partly: 'text-yellow-400',
  copied: 'text-green-400',
  empty: 'text-astro-muted'
}

const keyOf = (o: { kind: string; folder: string }) => `${o.kind}:${o.folder}`

/**
 * The Vespera control page (specs/033-vespera-ftp): where the scope is and where its copies land,
 * what it holds observation by observation, and a copy that runs while you watch. Copies only add
 * files: nothing on the scope is removed and nothing on the PC is overwritten.
 */
export function Vespera(): React.ReactElement {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<VesperaSettingsView | null>(null)
  const [address, setAddress] = useState('')
  const [survey, setSurvey] = useState<VesperaSurveyView | null>(null)
  const [looking, setLooking] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<VesperaProgressView | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadSettings = async (): Promise<void> => {
    const s = await invoke<VesperaSettingsView>('vespera:settings')
    setSettings(s)
    setAddress(s.address)
  }
  // When a copy ends, the list is read again so each observation shows what is now on the PC.
  const wasRunning = useRef(false)
  const lookAgain = useRef<() => Promise<void>>(async () => undefined)
  const loadProgress = (): void => {
    invoke<VesperaProgressView>('vespera:progress')
      .then(p => {
        if (wasRunning.current && !p.running) void lookAgain.current()
        wasRunning.current = p.running
        setProgress(p)
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    void loadSettings()
    loadProgress()
  }, [])

  // Follows the copy while it runs and while its copies are being indexed.
  const following = progress?.running || (progress?.indexing ?? '').endsWith('…')
  useEffect(() => {
    if (!following) return
    const timer = setInterval(loadProgress, 1000)
    return () => clearInterval(timer)
  }, [following])

  async function save(key: string, value: string): Promise<void> {
    await invoke('settings:set', { key, value })
    await loadSettings()
  }

  async function chooseLanding(): Promise<void> {
    const r = await invoke<{ path: string | null }>('settings:pick-folder')
    if (r.path) await save('vespera_landing', r.path)
  }

  async function toggleFormat(id: Format): Promise<void> {
    if (!settings) return
    const next = settings.formats.includes(id) ? settings.formats.filter(f => f !== id) : [...settings.formats, id]
    await save('vespera_formats', next.join(','))
  }

  async function look(): Promise<void> {
    setLooking(true)
    setMessage(null)
    try {
      const s = await invoke<VesperaSurveyView>('vespera:survey')
      setSurvey(s)
      if (s.ok) {
        setPicked(new Set(s.observations.filter(o => o.state === 'new' || o.state === 'partly').map(keyOf)))
        setTargets(prev => Object.fromEntries(s.observations.map(o => [keyOf(o), prev[keyOf(o)] ?? o.suggestedTarget])))
      }
    } finally {
      setLooking(false)
    }
  }

  useEffect(() => {
    lookAgain.current = look
  })

  async function copy(): Promise<void> {
    if (!survey?.ok) return
    const choices = survey.observations
      .filter(o => picked.has(keyOf(o)))
      .map(o => ({ folder: o.folder, kind: o.kind, target: targets[keyOf(o)] ?? null }))
    const r = await invoke<{ started: boolean; reason?: string }>('vespera:start', { choices })
    setMessage(r.started ? null : r.reason ?? 'The copy did not start.')
    loadProgress()
  }

  const toggle = (o: VesperaObservationView) =>
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(keyOf(o))) next.delete(keyOf(o))
      else next.add(keyOf(o))
      return next
    })

  const running = progress?.running ?? false
  const observations = survey?.ok ? survey.observations : []

  return (
    <PageContainer>
      <div className="space-y-4 max-w-3xl">
        <Card title="Connection" action={<LinkButton onClick={() => navigate(settingsLink('folders'))}>Folders in Settings</LinkButton>}>
          <p className="text-xs text-astro-muted mb-3">
            Join the PC to the Vespera's Wi-Fi, then look for observations. The scope's files are read over FTP and copied; nothing on the scope is changed or removed.
          </p>
          <label className="block text-xs text-astro-muted">Scope address</label>
          <div className="flex gap-2 mt-1">
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="10.0.0.1"
              className="flex-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent"
            />
            <button
              onClick={() => void save('vespera_host', address.trim())}
              disabled={!settings || address.trim() === settings.address}
              className="px-4 py-2 border border-astro-border text-sm rounded text-astro-text hover:border-astro-accent disabled:opacity-50"
            >
              Save address
            </button>
          </div>

          <label className="block text-xs text-astro-muted mt-4">Copies land in</label>
          <div className="flex gap-2 mt-1 items-center">
            <div className="flex-1 bg-astro-bg border border-astro-border rounded px-3 py-2 text-sm text-astro-text truncate min-h-[38px] flex items-center">
              {settings?.landingRoot ?? <span className="text-astro-muted italic">Not set: choose a folder, or set the home folder in Settings</span>}
            </div>
            <button onClick={() => void chooseLanding()} className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80">
              Browse
            </button>
            {settings && !settings.landingIsDefault && settings.landingRoot && (
              <button onClick={() => void save('vespera_landing', '')} className="px-3 py-2 border border-astro-border text-astro-muted text-sm rounded hover:text-astro-text">
                Use the home folder
              </button>
            )}
          </div>
          {settings?.landingIsDefault && (
            <p className="text-xs text-astro-muted mt-1">The home folder's raw folder, so each observation lands in its target's folder and the home scan finds it.</p>
          )}

          <p className="text-xs text-astro-muted mt-4">Kinds of file to copy</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-1">
            {FORMATS.map(f => (
              <label key={f.id} className="flex items-center gap-2 text-sm text-astro-text" title={f.hint}>
                <input type="checkbox" checked={settings?.formats.includes(f.id) ?? false} onChange={() => void toggleFormat(f.id)} />
                {f.label}
              </label>
            ))}
          </div>
          {settings?.notes.map(n => <p key={n} className="text-xs text-yellow-400 mt-2">{n}</p>)}

          <div className="mt-4">
            <button
              onClick={() => void look()}
              disabled={looking || running}
              className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 disabled:opacity-50"
            >
              {looking ? 'Looking…' : 'Look for observations'}
            </button>
          </div>
        </Card>

        <Card
          title="On the Vespera"
          action={
            survey?.ok && observations.length > 0 ? (
              <button
                onClick={() => void copy()}
                disabled={running || picked.size === 0 || !survey.landingRoot}
                className="px-3 py-1 bg-astro-accent text-white text-xs rounded hover:bg-astro-accent/80 disabled:opacity-50"
              >
                Copy selected
              </button>
            ) : undefined
          }
        >
          {!survey && <EmptyState>Look for observations to see what the scope holds and what is already on the PC.</EmptyState>}
          {survey && !survey.ok && <p className="text-sm text-red-400">{survey.error}</p>}
          {survey?.ok && (
            <>
              <p className="text-sm text-astro-text">{survey.summary}</p>
              {survey.spaceLine && <p className={`text-xs mt-1 ${survey.spaceShort ? 'text-red-400' : 'text-astro-muted'}`}>{survey.spaceLine}</p>}
              {observations.length === 0 && <EmptyState>The scope holds no observations yet.</EmptyState>}
              <div className="mt-3">
                {observations.map(o => (
                  <div key={keyOf(o)} className="border-t border-astro-border py-3 first:border-t-0 flex gap-3">
                    <input type="checkbox" className="mt-1" checked={picked.has(keyOf(o))} disabled={o.state === 'copied' || o.state === 'empty'} onChange={() => toggle(o)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-astro-text truncate" title={o.folder}>{o.title}</span>
                        <span className={`text-xs shrink-0 ${STATE_COLOUR[o.state]}`}>{o.stateLine}</span>
                      </div>
                      <p className="text-xs text-astro-muted mt-0.5">{[o.takenAt, o.contents].filter(Boolean).join(' · ')}</p>
                      {picked.has(keyOf(o)) && (
                        <label className="flex items-center gap-2 text-xs text-astro-muted mt-2">
                          Target folder
                          <input
                            value={targets[keyOf(o)] ?? o.suggestedTarget}
                            onChange={e => setTargets(prev => ({ ...prev, [keyOf(o)]: e.target.value }))}
                            className="px-2 py-1 bg-astro-bg border border-astro-border rounded text-xs text-astro-text focus:outline-none focus:border-astro-accent"
                          />
                        </label>
                      )}
                      {o.warning && <p className="text-xs text-yellow-400 mt-1">{o.warning}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {message && <p className="text-xs text-red-400 mt-2">{message}</p>}
        </Card>

        <IngestPanel />

        {progress && progress.state !== 'idle' && (
          <Card
            title="Copy"
            action={
              running ? (
                <button onClick={() => void invoke('vespera:cancel').then(loadProgress)} className="px-2 py-1 text-xs border border-astro-border rounded text-red-400 hover:border-red-400">
                  Cancel
                </button>
              ) : undefined
            }
          >
            <p className="text-sm text-astro-text">{progress.headline}</p>
            {running && (
              <div className="h-2 bg-astro-bg rounded mt-2 overflow-hidden">
                <div className="h-full bg-astro-accent" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
              </div>
            )}
            {progress.detail && <p className="text-xs text-astro-muted mt-1">{progress.detail}</p>}
            {running && progress.current && <p className="text-xs text-astro-muted mt-1 break-all">{progress.current}</p>}
            {progress.error && <p className="text-xs text-red-400 mt-1">{progress.error}</p>}
            {progress.indexing && <p className="text-xs text-astro-muted mt-1">{progress.indexing}</p>}
          </Card>
        )}
      </div>
    </PageContainer>
  )
}
