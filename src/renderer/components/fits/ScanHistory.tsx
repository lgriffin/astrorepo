import React from 'react'
import type { FitsScanSummary } from '@shared/types'
import { invoke } from '../../hooks/useIPC'

interface ScanHistoryProps {
  scans: FitsScanSummary[]
  selectedScanId: string | null
  onSelectScan: (id: string) => void
  onRefresh: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function statusBadge(status: string): React.ReactElement {
  const colors: Record<string, string> = {
    completed: 'bg-astro-success/20 text-astro-success',
    running: 'bg-astro-warning/20 text-astro-warning',
    failed: 'bg-astro-danger/20 text-astro-danger'
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
        <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider">Scan History</h2>
      </div>
      <div className="divide-y divide-astro-border">
        {scans.map((scan) => (
          <div
            key={scan.id}
            onClick={() => onSelectScan(scan.id)}
            className={`px-4 py-3 cursor-pointer transition-colors flex items-center justify-between ${
              selectedScanId === scan.id
                ? 'bg-astro-accent/10 border-l-2 border-astro-accent'
                : 'hover:bg-astro-bg/50'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-astro-text truncate">{scan.folderPath}</p>
              <div className="flex gap-3 mt-1 text-xs text-astro-muted">
                <span>{scan.fileCount} files</span>
                <span>{formatSize(scan.totalSizeBytes)}</span>
                <span>{formatDate(scan.startedAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              {statusBadge(scan.status)}
              <button
                onClick={(e) => handleDelete(e, scan.id)}
                className="text-astro-muted hover:text-astro-danger transition-colors p-1"
                title="Delete scan"
              >
                &times;
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
