import React, { useState, useEffect, useRef, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { HomeScanProgress, HomeScanResult } from '@shared/types'

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
  const [scanProgress, setScanProgress] = useState<HomeScanProgress | null>(null)
  const [scanResult, setScanResult] = useState<HomeScanResult | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetStatus, setResetStatus] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  async function loadSettings(): Promise<void> {
    const results = await Promise.all(
      FOLDER_SETTINGS.map(async (s) => {
        const result = await invoke<{ value: string | null }>('settings:get', { key: s.key })
        return { ...s, value: result.value ?? '' }
      })
    )
    setFolders(results)
  }

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

  const startScan = useCallback(async () => {
    setScanResult(null)
    const resp = await invoke<{ started: boolean; reason?: string }>('home:scan-start')
    if (!resp.started) return

    pollRef.current = setInterval(async () => {
      const progress = await invoke<HomeScanProgress>('home:scan-progress')
      setScanProgress(progress)

      if (progress.status === 'done' || progress.status === 'error') {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = null
        if (progress.status === 'done' && progress.result) {
          setScanResult(progress.result)
        }
      }
    }, 500)
  }, [])

  const isScanning = scanProgress?.status === 'scanning'
  const progressPct = scanProgress && scanProgress.totalTargets > 0
    ? Math.round((scanProgress.targetsProcessed / scanProgress.totalTargets) * 100)
    : 0

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
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Home Folder Scanner</h2>

            <button
              onClick={startScan}
              disabled={isScanning}
              className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors disabled:opacity-50"
            >
              {isScanning ? 'Scanning...' : 'Scan Home Folder'}
            </button>

            {isScanning && scanProgress && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-astro-muted">
                  <span>{scanProgress.phase}</span>
                  <span>{scanProgress.targetsProcessed} / {scanProgress.totalTargets}</span>
                </div>
                {scanProgress.currentTarget && (
                  <p className="text-sm text-astro-text">{scanProgress.currentTarget}</p>
                )}
                <div className="w-full h-2 bg-astro-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-astro-accent rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {scanProgress?.status === 'error' && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">
                Scan failed: {scanProgress.error}
              </div>
            )}

            {scanResult && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-astro-text font-medium">Scan Complete</span>
                  <span className="text-astro-muted">
                    {scanResult.targets.length} targets found
                    {scanResult.advanced > 0 && ` · ${scanResult.advanced} stages advanced`}
                  </span>
                </div>

                {scanResult.targets.length > 0 && (
                  <div className="bg-astro-bg border border-astro-border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-astro-border text-astro-muted">
                          <th className="text-left px-3 py-2 font-medium">Target</th>
                          <th className="text-right px-3 py-2 font-medium">Raw</th>
                          <th className="text-right px-3 py-2 font-medium">Stacked</th>
                          <th className="text-right px-3 py-2 font-medium">TIF</th>
                          <th className="text-right px-3 py-2 font-medium">Images</th>
                          <th className="text-left px-3 py-2 font-medium">Stage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.targets.map((t) => (
                          <tr key={t.targetId} className="border-b border-astro-border/50 last:border-0">
                            <td className="px-3 py-1.5 text-astro-text font-medium">{t.targetName}</td>
                            <td className="px-3 py-1.5 text-right text-astro-muted">{t.rawFiles || '-'}</td>
                            <td className="px-3 py-1.5 text-right text-astro-muted">{t.stackedFiles || '-'}</td>
                            <td className="px-3 py-1.5 text-right text-astro-muted">{t.tifFiles || '-'}</td>
                            <td className="px-3 py-1.5 text-right text-astro-muted">{t.imageFiles || '-'}</td>
                            <td className="px-3 py-1.5 text-astro-accent capitalize">{t.suggestedStage.replace(/_/g, ' ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
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
                    setScanResult(null)
                    setScanProgress(null)
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
