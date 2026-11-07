import React from 'react'
import type { FitsScanSummary } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { formatSize } from '../../utils/format'
import { pressable } from '../ui/pressable'

interface ScanHistoryProps {
  scans: FitsScanSummary[]
  selectedScanId: string | null
  onSelectScan: (id: string) => void
  onRefresh: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function statusBadge(status: string): React.ReactElement {
  const colors: Record<string, string> = {
    // Drawn on the card's own ground, so a selected row's tint does not dim them (U4).
    completed: 'bg-astro-surface border border-astro-success/50 text-astro-success',
    running: 'bg-astro-surface border border-astro-warning/50 text-astro-warning',
    failed: 'bg-astro-surface border border-astro-danger/50 text-astro-danger'
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-astro-bg text-astro-muted'}`}>
      {status}
    </span>
  )
}

export function ScanHistory({ scans, selectedScanId, onSelectScan, onRefresh }: ScanHistoryProps): React.ReactElement {
  async function handleDelete(e: React.MouseEvent, scanId: string): Promise<void> {
    e.stopPropagation()
    await invoke('fits:delete-scan', { id: scanId })
    onRefresh()
  }

  if (scans.length === 0) {
    return (
      <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
        <p className="text-sm text-astro-muted">No scans yet. Select a folder and click Scan to get started.</p>
      </div>
    )
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-astro-border">
        <h2 className="text-base font-semibold text-astro-text">Scan history</h2>
      </div>
      <div className="divide-y divide-astro-border">
        {scans.map((scan) => (
          <div
            key={scan.id}
            className={`flex items-center transition-colors ${
              selectedScanId === scan.id
                ? 'bg-astro-accent/10 border-l-2 border-astro-accent'
                : 'hover:bg-astro-bg/50'
            }`}
          >
            {/* The whole row but Delete opens the scan, so Delete is a control of its own beside it (U4). */}
            <div
              className="min-w-0 flex-1 px-4 py-3 cursor-pointer rounded flex items-center justify-between gap-3"
              {...pressable(() => onSelectScan(scan.id), { pressed: selectedScanId === scan.id })}
            >
              <div className="min-w-0">
                <p className="text-sm text-astro-text truncate">{scan.folderPath}</p>
                <div className="flex gap-3 mt-1 text-xs text-astro-muted">
                  <span>{scan.fileCount} files</span>
                  <span>{formatSize(scan.totalSizeBytes)}</span>
                  <span>{formatDate(scan.startedAt)}</span>
                </div>
              </div>
              <span className="shrink-0">{statusBadge(scan.status)}</span>
            </div>
            <button
              onClick={(e) => handleDelete(e, scan.id)}
              className="mr-3 shrink-0 text-astro-muted hover:text-astro-danger transition-colors p-1"
              title="Delete scan"
              aria-label={`Delete the scan of ${scan.folderPath}`}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
