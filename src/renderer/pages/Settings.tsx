import React, { useState, useEffect, useRef } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { ToolsView } from '@shared/types'
import { RunWindowSettings } from '../components/jobs/RunWindowSettings'
import { useLocation } from 'react-router-dom'
import { SETTINGS_SECTIONS, settingsSectionFrom } from '@shared/navigation'
import { SETUP_HIDDEN_KEY } from '@shared/setup'

const scrollTo = (section: string): void => {
  document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start' })
}

/** Anything the user does to move the page ends the follow-the-section scroll. */
const USER_SCROLL = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const

interface FolderSetting {
  key: string
  label: string
  description: string
  value: string
}

const FOLDER_SETTINGS: Array<{ key: string; label: string; description: string }> = [
  {
    key: 'home_folder_path',
    label: 'Home Folder',
    description: 'Root folder with raw/, stacked/, tif/, images/ subdirectories for organized astrophotography data.'
  },
  {
    key: 'fits_master_folder',
    label: 'Master FITS Folder',
    description: 'Root folder containing your astrophotography FITS files. Used as the default path on the FITS files page.'
  },
  {
    key: 'base_folder_path',
    label: 'Base Folder Path',
    description: 'Root folder for generated target directory structures (lights, darks, flats, biases).'
  }
]

const OBSERVER_SETTINGS = [
  { key: 'observer_latitude', label: 'Latitude (°N)', placeholder: 'e.g. 51.5074', min: -90, max: 90 },
  { key: 'observer_longitude', label: 'Longitude (°E)', placeholder: 'e.g. -0.1278', min: -180, max: 180 },
  { key: 'observer_elevation', label: 'Elevation (m)', placeholder: 'e.g. 100', min: 0, max: 10000 }
]

export function Settings(): React.ReactElement {
  const [folders, setFolders] = useState<FolderSetting[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [observer, setObserver] = useState<Record<string, string>>({})
  const [observerSaving, setObserverSaving] = useState(false)
  const [narrowband, setNarrowband] = useState(true)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetStatus, setResetStatus] = useState<string | null>(null)

  async function loadSettings(): Promise<void> {
    const results = await Promise.all(
      FOLDER_SETTINGS.map(async (s) => {
        const result = await invoke<{ value: string | null }>('settings:get', { key: s.key })
        return { ...s, value: result.value ?? '' }
      })
    )
    setFolders(results)

    const obsResults = await Promise.all(
      OBSERVER_SETTINGS.map(async s => {
        const result = await invoke<{ value: string | null }>('settings:get', { key: s.key })
        return [s.key, result.value ?? ''] as const
      })
    )
    setObserver(Object.fromEntries(obsResults))
    const nb = await invoke<{ value: string | null }>('settings:get', { key: 'has_narrowband_filter' })
    setNarrowband(nb.value === null || !['false', '0', 'no'].includes(nb.value.toLowerCase()))
  }

  useEffect(() => {
    loadSettings()
  }, [])

  // A link such as "Change the run window in Settings" opens the page at that section.
  const { search } = useLocation()
  const section = settingsSectionFrom(search)
  // The sections above it (folders, tools, run window) load on their own and grow, so the page
  // follows the section while the content settles, and stops as soon as the user scrolls.
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const content = page.current
    if (!section || !content) return
    scrollTo(section)
    const follow = new ResizeObserver(() => scrollTo(section))
    follow.observe(content)
    const stop = (): void => {
      follow.disconnect()
      for (const e of USER_SCROLL) window.removeEventListener(e, stop)
      clearTimeout(timer)
    }
    const timer = setTimeout(stop, 5000)
    for (const e of USER_SCROLL) window.addEventListener(e, stop, { passive: true })
    return stop
  }, [section])

  async function handleBrowse(key: string): Promise<void> {
    const result = await invoke<{ path: string | null }>('settings:pick-folder')
    if (!result.path) return

    setSaving(key)
    await invoke('settings:set', { key, value: result.path })
    setFolders(prev => prev.map(f => f.key === key ? { ...f, value: result.path! } : f))
    setSaving(null)
  }

  async function handleClear(key: string): Promise<void> {
    setSaving(key)
    await invoke('settings:set', { key, value: '' })
    setFolders(prev => prev.map(f => f.key === key ? { ...f, value: '' } : f))
    setSaving(null)
  }

  return (
    <PageContainer>
      <div ref={page} className="space-y-6 max-w-2xl">
        <nav className="flex flex-wrap gap-2 text-xs">
          {SETTINGS_SECTIONS.map(s => (
            <button key={s.id} onClick={() => scrollTo(s.id)} className="px-2 py-1 border border-astro-border rounded text-astro-muted hover:text-astro-text hover:border-astro-accent">
              {s.label}
            </button>
          ))}
        </nav>

        <div id="settings-location" className="scroll-mt-6 bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Your site</h2>
          <p className="text-xs text-astro-muted mb-4">Used by the Sky planner and Home's coming-nights card for seasons, moon windows, twilight times and altitude curves.</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {OBSERVER_SETTINGS.map(s => (
              <label key={s.key} className="block">
                <span className="text-xs text-astro-muted">{s.label}</span>
                <input
                  type="number"
                  step="any"
                  min={s.min}
                  max={s.max}
                  value={observer[s.key] ?? ''}
                  onChange={e => setObserver(prev => ({ ...prev, [s.key]: e.target.value }))}
                  placeholder={s.placeholder}
                  className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent"
                />
              </label>
            ))}
          </div>
          <button
            onClick={async () => {
              setObserverSaving(true)
              await Promise.all(
                // A cleared field is saved blank, which clears the site rather than keeping the old value.
                OBSERVER_SETTINGS.map(s => invoke('settings:set', { key: s.key, value: (observer[s.key] ?? '').trim() }))
              )
              setObserverSaving(false)
            }}
            disabled={observerSaving}
            className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 disabled:opacity-50"
          >
            {observerSaving ? 'Saving...' : 'Save location'}
          </button>
          <label className="flex items-start gap-2 mt-4 text-sm text-astro-text">
            <input
              type="checkbox"
              checked={narrowband}
              onChange={e => {
                const next = e.target.checked
                setNarrowband(next)
                invoke('settings:set', { key: 'has_narrowband_filter', value: String(next) })
              }}
              className="mt-1"
            />
            <span>
              I have a dual-band or narrowband filter
              <span className="block text-xs text-astro-muted">
                The Seestar S50's light-pollution filter counts. With it, emission nebulae are still suggested when the moon is bright.
              </span>
            </span>
          </label>
        </div>

        <div id="settings-folders" className="scroll-mt-6 bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Folders</h2>
          <div className="space-y-5">
            {folders.map((folder) => (
              <div key={folder.key}>
                <label className="block text-sm font-medium text-astro-text mb-1">{folder.label}</label>
                <p className="text-xs text-astro-muted mb-2">{folder.description}</p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-astro-bg border border-astro-border rounded px-3 py-2 text-sm text-astro-text truncate min-h-[38px] flex items-center">
                    {folder.value || <span className="text-astro-muted italic">Not set</span>}
                  </div>
                  <button
                    onClick={() => handleBrowse(folder.key)}
                    disabled={saving === folder.key}
                    className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors disabled:opacity-50"
                  >
                    Browse
                  </button>
                  {folder.value && (
                    <button
                      onClick={() => handleClear(folder.key)}
                      disabled={saving === folder.key}
                      className="px-3 py-2 border border-astro-border text-astro-muted text-sm rounded hover:text-astro-danger hover:border-astro-danger transition-colors disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div id="settings-tools" className="scroll-mt-6">
          <ToolsSection />
        </div>
        <div id="settings-run-window" className="scroll-mt-6">
          <RunWindowSettings />
        </div>

        <div id="settings-import" className="scroll-mt-6 bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Import and export</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm text-astro-text mb-2">Export Data</h3>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => invoke('export:targets-csv')}
                  className="px-3 py-1.5 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors"
                >
                  Export Targets CSV
                </button>
                <button
                  onClick={() => invoke('export:sessions-csv')}
                  className="px-3 py-1.5 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors"
                >
                  Export sessions CSV
                </button>
                <button
                  onClick={() => invoke('export:fits-csv')}
                  className="px-3 py-1.5 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors"
                >
                  Export FITS data CSV
                </button>
              </div>
            </div>
            <div>
              <h3 className="text-sm text-astro-text mb-2">Import</h3>
              <button
                onClick={async () => {
                  const pick = await invoke<{ path: string | null }>('import:pick-file')
                  if (!pick.path) return
                  const result = await invoke<{ created: unknown[]; skipped: string[] }>('import:nina-sequence', { file_path: pick.path })
                  setImportResult(`Imported ${result.created.length} targets.${result.skipped.length > 0 ? ` Skipped: ${result.skipped.join(', ')}` : ''}`)
                }}
                className="px-3 py-1.5 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors"
              >
                Import NINA sequence
              </button>
              {importResult && <p className="text-xs text-astro-muted mt-2">{importResult}</p>}
            </div>
          </div>
        </div>

        <div id="settings-reset" className="scroll-mt-6 bg-astro-surface border border-red-500/30 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-2">Start again</h2>
          <p className="text-xs text-astro-muted mb-3">
            Hid the Get set up checklist on Home?{' '}
            <button onClick={() => void invoke('settings:set', { key: SETUP_HIDDEN_KEY, value: '' })} className="text-astro-accent hover:underline">
              Show it again
            </button>
            .
          </p>
          <p className="text-xs text-astro-muted mb-4">
            Clear all targets, FITS scans, sessions, and scan data from the local database. Folder settings are preserved. Your actual files on disk are not affected.
          </p>

          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 border border-red-500/50 text-red-400 text-sm rounded hover:bg-red-500/10 transition-colors"
            >
              Clear database
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-400">Are you sure? This cannot be undone.</span>
              <button
                onClick={async () => {
                  try {
                    await invoke('db:reset')
                    setResetStatus('Database cleared successfully. Re-run a scan to repopulate.')
                  } catch {
                    setResetStatus('Failed to clear database.')
                  }
                  setShowResetConfirm(false)
                }}
                className="px-4 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
              >
                Yes, clear everything
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border border-astro-border text-astro-muted text-sm rounded hover:text-astro-text transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {resetStatus && (
            <p className="text-xs text-astro-muted mt-3">{resetStatus}</p>
          )}
        </div>
      </div>
    </PageContainer>
  )
}

/** Settings > Tools: the tool hub (specs/015-tool-hub). Saving a path re-checks every tool. */
function ToolsSection(): React.ReactElement {
  const [view, setView] = useState<ToolsView | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})

  const load = (): void => {
    invoke<ToolsView>('tools:list').then(setView).catch(() => setView(null))
  }
  useEffect(load, [])

  async function save(key: string, value: string): Promise<void> {
    await invoke('settings:set', { key, value: value.trim() })
    setEditing(e => {
      const next = { ...e }
      delete next[key]
      return next
    })
    load()
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Tools</h2>
      <p className="text-xs text-astro-muted mb-4">
        Programs the app hands work to. Each is looked for in the path you give here, then on PATH, then in its usual install folder. Nothing is run to check.
        {view && <span className="text-astro-text"> {view.summary}</span>}
      </p>
      <div className="space-y-4">
        {view?.tools.filter(t => !t.notNeeded).map(t => (
          <div key={t.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-astro-text">{t.label}</span>
              <span className={`text-xs ${t.found ? 'text-green-400' : 'text-yellow-400'}`}>{t.found ? t.how : 'Not found'}</span>
            </div>
            <p className="text-xs text-astro-muted">{t.purpose}</p>
            {t.path && <p className="text-xs font-mono text-astro-text break-all">{t.path}</p>}
            {t.settingNote && <p className="text-xs text-yellow-400">{t.settingNote}</p>}
            {t.warning && <p className="text-xs text-yellow-400">{t.warning}</p>}
            {!t.found && t.looked.length > 0 && (
              <details className="text-xs text-astro-muted">
                <summary className="cursor-pointer">Where it looked</summary>
                <ul className="font-mono pl-3">{t.looked.map(l => <li key={l} className="break-all">{l}</li>)}</ul>
              </details>
            )}
            <div className="flex gap-2 mt-1">
              <input
                className="flex-1 bg-astro-bg border border-astro-border rounded px-2 py-1 text-xs text-astro-text"
                placeholder={t.id === 'siril-scripts' ? 'Folder of your Siril_Scripts clone' : 'Full path to the program'}
                value={editing[t.settingKey] ?? ''}
                onChange={e => setEditing(prev => ({ ...prev, [t.settingKey]: e.target.value }))}
              />
              <button
                onClick={() => void save(t.settingKey, editing[t.settingKey] ?? '')}
                disabled={editing[t.settingKey] === undefined}
                className="px-3 py-1 text-xs bg-astro-accent text-white rounded disabled:opacity-50"
              >
                {editing[t.settingKey]?.trim() ? 'Save' : 'Use default'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
