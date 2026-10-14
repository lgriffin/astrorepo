import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, LinkButton } from '../components/common/Card'
import { invoke } from '../hooks/useIPC'
import { IngestPanel } from '../components/vespera/IngestPanel'
import type { VesperaSettingsView } from '@shared/types'
import { settingsLink } from '@shared/navigation'

type Format = VesperaSettingsView['formats'][number]

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: 'fits', label: 'FITS frames', hint: 'the raw frames, for stacking in Siril' },
  { id: 'tiff', label: 'TIFF', hint: "the scope's own 16-bit stack" },
  { id: 'jpeg', label: 'JPEG', hint: 'previews' },
  { id: 'json', label: 'JSON metadata', hint: 'what the scope recorded about each observation' }
]

/**
 * The Vespera page (specs/033-vespera-ftp and 034-vespera-ingest): where the scope is, where its
 * copies land and which kinds of file to copy, then one flow: scan the scope, review each session,
 * and copy the chosen ones, each into a folder named for what it holds. Nothing on the scope is
 * changed or removed, and nothing on the PC is overwritten.
 */
export function Vespera(): React.ReactElement {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<VesperaSettingsView | null>(null)
  const [address, setAddress] = useState('')

  const loadSettings = async (): Promise<void> => {
    const s = await invoke<VesperaSettingsView>('vespera:settings')
    setSettings(s)
    setAddress(s.address)
  }

  useEffect(() => {
    void loadSettings()
  }, [])

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

  return (
    <PageContainer>
      <div className="space-y-4 max-w-3xl">
        <Card title="Connection" action={<LinkButton onClick={() => navigate(settingsLink('folders'))}>Folders in Settings</LinkButton>}>
          <p className="text-xs text-astro-muted mb-3">
            Join the PC to the Vespera's Wi-Fi, then scan the scope below. The scope's files are read over FTP and copied; nothing on the scope is changed or removed.
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
        </Card>

        <IngestPanel kinds={settings?.formats ?? []} />
      </div>
    </PageContainer>
  )
}
