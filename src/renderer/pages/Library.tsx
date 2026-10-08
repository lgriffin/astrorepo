import React, { useState, useEffect, useRef, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState } from '../components/common/Card'
import { settingsLink } from '@shared/navigation'
import { invoke } from '../hooks/useIPC'
import type { HomeScanProgress, HomeScanResult, HomeScanPhaseProgress, ScanFileCounts } from '@shared/types'

const PHASE_LABELS: Record<string, { title: string; description: string }> = {
  raw: { title: 'Raw', description: 'FITS files from capture sessions' },
  stacked: { title: 'Stacked', description: 'Processed/stacked FITS files' },
  tif: { title: 'TIF', description: 'Exported TIF images' },
  images: { title: 'Images', description: 'Final PNG/JPG/TIF images' },
}

export function Library(): React.ReactElement {
  const [homeFolderSet, setHomeFolderSet] = useState<boolean | null>(null)
  const [scanProgress, setScanProgress] = useState<HomeScanProgress | null>(null)
  const [scanResult, setScanResult] = useState<HomeScanResult | null>(null)
  const [lastScanTime, setLastScanTime] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** False once the page has gone, so an answer still in flight schedules no further polls. */
  const mountedRef = useRef(true)
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set())

  // One poll at a time: the next is asked for only after the last answer, so polls never pile up.
  const poll = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current)
    const next = (): void => {
      pollRef.current = setTimeout(async () => {
        const progress = await invoke<HomeScanProgress>('home:scan-progress')
        if (!mountedRef.current) return
        setScanProgress(progress)
        if (progress.status === 'scanning' || progress.status === 'cancelling') {
          next()
          return
        }
        pollRef.current = null
        if (progress.status === 'done' && progress.result) {
          setScanResult(progress.result)
          invoke<{ value: string | null }>('settings:get', { key: 'last_library_scan' }).then(r => {
            setLastScanTime(r.value)
          })
        }
      }, 500)
    }
    next()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    invoke<{ value: string | null }>('settings:get', { key: 'home_folder_path' }).then(r => {
      setHomeFolderSet(!!r.value)
    })
    invoke<{ value: string | null }>('settings:get', { key: 'last_library_scan' }).then(r => {
      setLastScanTime(r.value)
    })
    invoke<HomeScanProgress>('home:scan-progress').then(progress => {
      if (progress.status === 'done' && progress.result) {
        setScanProgress(progress)
        setScanResult(progress.result)
      } else if (progress.status === 'scanning' || progress.status === 'cancelling') {
        // A scan started before this page was opened carries on; follow it.
        setScanProgress(progress)
        poll()
      }
    })
    return () => {
      mountedRef.current = false
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [poll])

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
      files: null,
      result: null,
      error: null
    })
    const resp = await invoke<{ started: boolean; reason?: string }>('home:scan-start')
    if (!resp.started) {
      setScanProgress(null)
      return
    }
    poll()
  }, [poll])

  const cancelScan = useCallback(async () => {
    const { cancelled } = await invoke<{ cancelled: boolean }>('home:scan-cancel')
    // A scan that finished while the click was on its way has nothing to stop.
    if (cancelled) setScanProgress(prev => prev && prev.status === 'scanning' ? { ...prev, status: 'cancelling' } : prev)
  }, [])

  const isScanning = scanProgress?.status === 'scanning' || scanProgress?.status === 'cancelling'

  function toggleExpand(targetId: string): void {
    setExpandedTargets(prev => {
      const next = new Set(prev)
      if (next.has(targetId)) next.delete(targetId)
      else next.add(targetId)
      return next
    })
  }

  if (homeFolderSet === null) {
    return (
      <PageContainer>
        <div className="text-astro-muted">Loading...</div>
      </PageContainer>
    )
  }

  if (!homeFolderSet) {
    return (
      <PageContainer>
        <Card title="Home folder" className="max-w-lg">
          <EmptyState action={<a href={`#${settingsLink('folders')}`} className="text-xs text-astro-accent hover:underline">Choose it in Settings</a>}>
            Choose the folder that holds your raw, stacked and finished data, then scan it here.
          </EmptyState>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="space-y-6 max-w-4xl">
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider">Library Scanner</h2>
            <button
              onClick={startScan}
              disabled={isScanning}
              className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors disabled:opacity-50"
            >
              {isScanning ? 'Scanning...' : 'Scan Library'}
            </button>
          </div>
          <p className="text-xs text-astro-muted">
            Scans your home folder for raw FITS, stacked masters, TIF exports, and final images.
            Discovered targets are auto-linked to catalogue collections.
          </p>
          {lastScanTime && !isScanning && (
            <p className="text-xs text-astro-muted mt-2">
              Last scanned: {new Date(lastScanTime + 'Z').toLocaleString()}
            </p>
          )}
        </div>

        {isScanning && scanProgress && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-astro-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-astro-text font-medium flex-1">
                {scanProgress.status === 'cancelling' ? 'Stopping the scan...' : 'Scanning home folder...'}
              </p>
              <button
                onClick={cancelScan}
                disabled={scanProgress.status === 'cancelling'}
                className="px-3 py-1 text-xs border border-astro-border rounded text-astro-muted hover:text-astro-text disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-astro-muted">
              The scan runs gently in the background so your PC stays usable. A big library can take a
              while. If you cancel, files already read are kept and the next scan carries on from there.
            </p>

            <div className="w-full h-1.5 bg-astro-border rounded-full overflow-hidden">
              <div
                className="h-full bg-astro-accent rounded-full transition-all duration-500"
                style={{ width: `${Math.max(5, (scanProgress.phases.filter(p => p.status === 'complete').length / 4) * 100)}%` }}
              />
            </div>

            <div className="bg-astro-bg border border-astro-border rounded-lg p-3 space-y-2">
              {scanProgress.phases.map((phase) => (
                <PhaseRow key={phase.name} phase={phase} files={phase.status === 'scanning_fits' ? scanProgress.files : null} />
              ))}
            </div>

            {scanProgress.totalTargetsFound > 0 && (
              <p className="text-xs text-astro-muted">
                {scanProgress.totalTargetsFound} targets discovered so far
              </p>
            )}
          </div>
        )}

        {scanProgress?.status === 'cancelled' && (
          <div className="p-3 bg-astro-surface border border-astro-border rounded text-sm text-astro-muted">
            Scan cancelled. Files read so far are kept; scan again to carry on from there.
          </div>
        )}

        {scanProgress?.status === 'error' && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">
            Scan failed: {scanProgress.error}
          </div>
        )}

        {scanResult && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4 space-y-3">
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
                                <ExpandedSubfolders label="Raw" subfolders={t.rawSubfolders} totalFiles={t.rawFiles} />
                                <ExpandedSubfolders label="Stacked" subfolders={t.stackedSubfolders} totalFiles={t.stackedFiles} />
                                <ExpandedSubfolders label="TIF" subfolders={t.tifSubfolders} totalFiles={t.tifFiles} />
                                <ExpandedSubfolders label="Images" subfolders={t.imageSubfolders} totalFiles={t.imageFiles} />
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
    </PageContainer>
  )
}

function fileCountsText(files: ScanFileCounts | null): string {
  if (!files) return 'Reading FITS metadata...'
  if (files.filesToRead === 0 && files.filesRead === 0 && files.filesUnchanged === 0) return `Finding FITS files: ${files.filesFound.toLocaleString()} so far`
  const parts = [`Read ${files.filesRead.toLocaleString()} of ${files.filesToRead.toLocaleString()} new or changed files`]
  if (files.filesUnchanged > 0) parts.push(`${files.filesUnchanged.toLocaleString()} unchanged`)
  if (files.quarantined > 0) parts.push(`${files.quarantined.toLocaleString()} unreadable`)
  return parts.join(', ')
}

function PhaseRow({ phase, files = null }: { phase: HomeScanPhaseProgress; files?: ScanFileCounts | null }): React.ReactElement {
  const label = PHASE_LABELS[phase.name] ?? { title: phase.name, description: '' }
  const isActive = phase.status === 'discovering' || phase.status === 'scanning_fits'
  const statusText = phase.status === 'discovering' ? 'Searching for target folders...'
    : phase.status === 'scanning_fits' ? fileCountsText(files)
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
