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

export function Settings(): React.ReactElement {
  const [folders, setFolders] = useState<FolderSetting[]>([])
  const [saving, setSaving] = useState<string | null>(null)
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
