import React, { useState, useEffect, useRef, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { HomeScanProgress, HomeScanResult, HomeScanPhaseProgress } from '@shared/types'

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
    setScanProgress({
      status: 'scanning',
      phases: [
        { name: 'raw', status: 'pending', foldersFound: 0 },
        { name: 'stacked', status: 'pending', foldersFound: 0 },
        { name: 'tif', status: 'pending', foldersFound: 0 },
        { name: 'images', status: 'pending', foldersFound: 0 },
      ],
      currentPhaseIndex: 0,
      totalTargetsFound: 0,
      result: null,
      error: null
    })
    const resp = await invoke<{ started: boolean; reason?: string }>('home:scan-start')
    if (!resp.started) {
      setScanProgress(null)
      return
    }

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
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set())

  function toggleExpand(targetId: string): void {
    setExpandedTargets(prev => {
      const next = new Set(prev)
      if (next.has(targetId)) next.delete(targetId)
      else next.add(targetId)
      return next
    })
  }

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
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-astro-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-astro-text font-medium">
                    Scanning home folder...
                  </p>
                </div>

                <div className="w-full h-1.5 bg-astro-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-astro-accent rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(5, (scanProgress.phases.filter(p => p.status === 'complete').length / 4) * 100)}%` }}
                  />
                </div>

                <div className="bg-astro-bg border border-astro-border rounded-lg p-3 space-y-2">
                  {scanProgress.phases.map((phase) => (
                    <PhaseRow key={phase.name} phase={phase} />
                  ))}
                </div>

                {scanProgress.totalTargetsFound > 0 && (
                  <p className="text-xs text-astro-muted">
                    {scanProgress.totalTargetsFound} targets discovered so far
                  </p>
                )}
              </div>
            )}

            {scanProgress?.status === 'error' && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">
                Scan failed: {scanProgress.error}
              </div>
            )}

            {scanResult && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-astro-text font-medium">Scan Complete</span>
                  <span className="text-astro-muted">
                    {scanResult.targets.length} targets found
                    {scanResult.advanced > 0 && ` · ${scanResult.advanced} stages advanced`}
                    {scanResult.created > 0 && ` · ${scanResult.created} new targets created`}
                  </span>
                </div>

                {scanProgress?.status === 'done' && (
                  <div className="bg-astro-bg border border-astro-border rounded-lg p-3 space-y-2">
                    {scanProgress.phases.map((phase) => (
                      <PhaseRow key={phase.name} phase={phase} />
                    ))}
                  </div>
                )}

                {scanResult.targets.length === 0 && (
                  <p className="text-sm text-astro-muted">
                    No astronomical targets found. Check that your home folder has subdirectories like raw/M31/, stacked/NGC7000/, etc.
                  </p>
                )}

                {scanResult.targets.length > 0 && (
                  <div className="bg-astro-bg border border-astro-border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-astro-border text-astro-muted">
                          <th className="text-left px-3 py-2 font-medium w-6"></th>
                          <th className="text-left px-3 py-2 font-medium">Target</th>
                          <th className="text-right px-3 py-2 font-medium">Raw</th>
                          <th className="text-right px-3 py-2 font-medium">Stacked</th>
                          <th className="text-right px-3 py-2 font-medium">TIF</th>
                          <th className="text-right px-3 py-2 font-medium">Images</th>
                          <th className="text-left px-3 py-2 font-medium">Stage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.targets.map((t) => {
                          const id = t.targetId ?? t.targetName
                          const isExpanded = expandedTargets.has(id)
                          const hasSubfolders = t.rawSubfolders.length > 0 || t.stackedSubfolders.length > 0 || t.tifSubfolders.length > 0 || t.imageSubfolders.length > 0
                          return (
                            <React.Fragment key={id}>
                              <tr
                                className={`border-b border-astro-border/50 last:border-0 ${hasSubfolders ? 'cursor-pointer hover:bg-astro-surface/50' : ''}`}
                                onClick={() => hasSubfolders && toggleExpand(id)}
                              >
                                <td className="px-2 py-1.5 text-astro-muted">
                                  {hasSubfolders && <span className="text-[10px]">{isExpanded ? '▼' : '▶'}</span>}
                                </td>
                                <td className="px-3 py-1.5 text-astro-text font-medium">{t.targetName}</td>
                                <td className="px-3 py-1.5 text-right text-astro-muted">{t.rawFiles || '-'}</td>
                                <td className="px-3 py-1.5 text-right text-astro-muted">{t.stackedFiles || '-'}</td>
                                <td className="px-3 py-1.5 text-right text-astro-muted">{t.tifFiles || '-'}</td>
                                <td className="px-3 py-1.5 text-right text-astro-muted">{t.imageFiles || '-'}</td>
                                <td className="px-3 py-1.5 text-astro-accent capitalize">{t.suggestedStage.replace(/_/g, ' ')}</td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={7} className="px-6 py-2 bg-astro-bg/50">
                                    <ExpandedSubfolders
                                      label="Raw" subfolders={t.rawSubfolders} totalFiles={t.rawFiles}
                                    />
                                    <ExpandedSubfolders
                                      label="Stacked" subfolders={t.stackedSubfolders} totalFiles={t.stackedFiles}
                                    />
                                    <ExpandedSubfolders
                                      label="TIF" subfolders={t.tifSubfolders} totalFiles={t.tifFiles}
                                    />
                                    <ExpandedSubfolders
                                      label="Images" subfolders={t.imageSubfolders} totalFiles={t.imageFiles}
                                    />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
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

const PHASE_LABELS: Record<string, { title: string; description: string }> = {
  raw: { title: 'Raw', description: 'FITS files from capture sessions' },
  stacked: { title: 'Stacked', description: 'Processed/stacked FITS files' },
  tif: { title: 'TIF', description: 'Exported TIF images' },
  images: { title: 'Images', description: 'Final PNG/JPG/TIF images' },
}

function PhaseRow({ phase }: { phase: HomeScanPhaseProgress }): React.ReactElement {
  const label = PHASE_LABELS[phase.name] ?? { title: phase.name, description: '' }
  const isActive = phase.status === 'discovering' || phase.status === 'scanning_fits'
  const statusText = phase.status === 'discovering' ? 'Searching for target folders...'
    : phase.status === 'scanning_fits' ? 'Reading FITS metadata (this may take a moment)...'
    : phase.status === 'complete' && phase.foldersFound > 0 ? `Done — ${phase.foldersFound} target${phase.foldersFound !== 1 ? 's' : ''} found`
    : phase.status === 'complete' ? 'Done — no targets found'
    : 'Waiting...'
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-5 flex justify-center">
        {phase.status === 'complete' ? (
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : isActive ? (
          <div className="w-3 h-3 border-2 border-astro-accent border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-3 h-3 rounded-full border border-astro-border" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${isActive ? 'text-astro-text' : phase.status === 'complete' ? 'text-astro-text' : 'text-astro-muted'}`}>
            {label.title}
          </span>
          <span className="text-astro-muted">{label.description}</span>
        </div>
        <p className={`text-[11px] mt-0.5 ${isActive ? 'text-astro-accent' : 'text-astro-muted'}`}>
          {statusText}
        </p>
      </div>
    </div>
  )
}

function ExpandedSubfolders({ label, subfolders, totalFiles }: {
  label: string
  subfolders: Array<{ name: string | null; path: string; fileCount: number }>
  totalFiles: number
}): React.ReactElement | null {
  if (totalFiles === 0) return null
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-[11px] text-astro-muted font-medium uppercase tracking-wide mb-0.5">
        {label} ({totalFiles} files)
      </p>
      <div className="space-y-0.5 pl-2">
        {subfolders.map((sf, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <span className="text-astro-text font-mono">{sf.name ?? '(root)'}/</span>
            <div className="flex items-center gap-2">
              <span className="text-astro-muted">{sf.fileCount} files</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  invoke('home:open-folder', { folder_path: sf.path })
                }}
                className="p-0.5 text-astro-muted hover:text-astro-accent transition-colors"
                title="Open in file explorer"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
