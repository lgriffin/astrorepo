import React, { useState, useEffect } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'

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
    description: 'Root folder containing your astrophotography FITS files. Used as the default path in the FITS Analyzer.'
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

  const homeFolderPath = folders.find(f => f.key === 'home_folder_path')?.value

  return (
    <PageContainer title="Settings" subtitle="Configure your observatory application">
      <div className="space-y-6 max-w-2xl">
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Folder Paths</h2>
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

        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Observer Location</h2>
          <p className="text-xs text-astro-muted mb-4">Used by the Sky Planner and the dashboard's coming-nights card for seasons, moon windows, twilight times and altitude curves.</p>
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
                OBSERVER_SETTINGS.map(s =>
                  observer[s.key]
                    ? invoke('settings:set', { key: s.key, value: observer[s.key] })
                    : Promise.resolve()
                )
              )
              setObserverSaving(false)
            }}
            disabled={observerSaving}
            className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 disabled:opacity-50"
          >
            {observerSaving ? 'Saving...' : 'Save Location'}
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

        {homeFolderPath && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Library Scanning</h2>
            <p className="text-sm text-astro-muted">
              Use the{' '}
              <a href="#/library" className="text-astro-accent hover:underline">Library</a>{' '}
              page to scan your home folder and discover targets.
            </p>
          </div>
        )}

        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Import / Export</h2>
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
                  Export Sessions CSV
                </button>
                <button
                  onClick={() => invoke('export:fits-csv')}
                  className="px-3 py-1.5 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors"
                >
                  Export FITS Data CSV
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
                Import NINA Sequence
              </button>
              {importResult && <p className="text-xs text-astro-muted mt-2">{importResult}</p>}
            </div>
          </div>
        </div>

        <div className="bg-astro-surface border border-red-500/30 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-2">Danger Zone</h2>
          <p className="text-xs text-astro-muted mb-4">
            Clear all targets, FITS scans, sessions, and scan data from the local database. Folder settings are preserved. Your actual files on disk are not affected.
          </p>

          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 border border-red-500/50 text-red-400 text-sm rounded hover:bg-red-500/10 transition-colors"
            >
              Clear Database
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
