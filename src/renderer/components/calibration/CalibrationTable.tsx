import React from 'react'
import type { CalibrationGroup } from '@shared/types'

interface CalibrationTableProps {
  groups: CalibrationGroup[]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function typeLabel(type: string): string {
  switch (type) {
    case 'dark': return 'Darks'
    case 'flat': return 'Flats'
    case 'bias': return 'Biases'
    default: return type
  }
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case 'dark': return 'bg-purple-500/20 text-purple-300'
    case 'flat': return 'bg-sky-500/20 text-sky-300'
    case 'bias': return 'bg-amber-500/20 text-amber-300'
    default: return 'bg-astro-surface text-astro-muted'
  }
}

export function CalibrationTable({ groups }: CalibrationTableProps): React.ReactElement {
  if (groups.length === 0) {
    return (
      <div className="bg-astro-surface border border-astro-border rounded-lg p-6 text-center text-astro-muted">
        No calibration frames found. Run a FITS scan to detect calibration files.
      </div>
    )
  }

  const sorted = [...groups].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    return b.fileCount - a.fileCount
  })

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-astro-border">
        <h3 className="text-sm font-medium text-astro-text">Calibration Library</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-astro-border text-left text-astro-muted">
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Exposure</th>
              <th className="px-4 py-2 font-medium">Filter</th>
              <th className="px-4 py-2 font-medium">Gain</th>
              <th className="px-4 py-2 font-medium">Temp</th>
              <th className="px-4 py-2 font-medium">Binning</th>
              <th className="px-4 py-2 font-medium text-right">Frames</th>
              <th className="px-4 py-2 font-medium text-right">Size</th>
              <th className="px-4 py-2 font-medium">Date Range</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((group, i) => (
              <tr key={i} className="border-b border-astro-border/50 hover:bg-astro-bg/30">
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeBadgeClass(group.type)}`}>
                    {typeLabel(group.type)}
                  </span>
                </td>
                <td className="px-4 py-2 text-astro-text">
                  {group.exposureSec != null ? `${group.exposureSec}s` : '--'}
                </td>
                <td className="px-4 py-2 text-astro-text">
                  {group.filter ?? '--'}
                </td>
                <td className="px-4 py-2 text-astro-text">
                  {group.gain != null ? group.gain : '--'}
                </td>
                <td className="px-4 py-2 text-astro-text">
                  {group.ccdTemp != null ? `${group.ccdTemp}C` : '--'}
                </td>
                <td className="px-4 py-2 text-astro-text">
                  {group.binning ?? '--'}
                </td>
                <td className="px-4 py-2 text-right text-astro-text font-medium">
                  {group.fileCount}
                </td>
                <td className="px-4 py-2 text-right text-astro-muted">
                  {formatBytes(group.totalSizeBytes)}
                </td>
                <td className="px-4 py-2 text-astro-muted text-xs">
                  {group.dateRange.earliest
                    ? group.dateRange.earliest === group.dateRange.latest
                      ? group.dateRange.earliest.split('T')[0]
                      : `${group.dateRange.earliest.split('T')[0]} - ${group.dateRange.latest?.split('T')[0]}`
                    : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
