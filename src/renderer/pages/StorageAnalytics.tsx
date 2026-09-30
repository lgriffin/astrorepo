import React, { useState, useEffect, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { StatCard } from '../components/common/StatCard'
import { StorageBreakdownChart } from '../components/analytics/StorageBreakdownChart'
import { GrowthTrendChart } from '../components/analytics/GrowthTrendChart'
import { invoke } from '../hooks/useIPC'
import type { StorageCurrentStats, StorageGrowthProjection, StorageSnapshot } from '@shared/types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function StorageAnalytics(): React.ReactElement {
  const [stats, setStats] = useState<StorageCurrentStats | null>(null)
  const [projection, setProjection] = useState<StorageGrowthProjection | null>(null)
  const [snapshots, setSnapshots] = useState<StorageSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.all([
      invoke<StorageCurrentStats>('storage:current'),
      invoke<StorageGrowthProjection>('storage:projection'),
      invoke<{ snapshots: StorageSnapshot[] }>('storage:history')
    ])
      .then(([s, p, h]) => {
        setStats(s)
        setProjection(p)
        setSnapshots(h.snapshots)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCaptureSnapshot = async (): Promise<void> => {
    setCapturing(true)
    try {
      await invoke('storage:snapshot')
      loadData()
    } finally {
      setCapturing(false)
    }
  }

  if (loading || !stats) {
    return (
      <PageContainer>
        <div className="text-astro-muted">Loading storage analytics...</div>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      actions={
        <button
          onClick={handleCaptureSnapshot}
          disabled={capturing}
          className="px-4 py-2 bg-astro-accent text-astro-bg rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {capturing ? 'Capturing...' : 'Capture snapshot'}
        </button>
      }
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Storage" value={formatBytes(stats.totalSizeBytes)} accent />
        <StatCard label="Total Files" value={stats.totalFiles.toLocaleString()} />
        <StatCard
          label="Daily growth"
          value={projection ? formatBytes(projection.dailyGrowthBytes) : '--'}
        />
        <StatCard
          label="Monthly growth"
          value={projection ? formatBytes(projection.monthlyGrowthBytes) : '--'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Growth Trend */}
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Growth Trend</h2>
          <GrowthTrendChart snapshots={snapshots} />
        </div>

        {/* By Image Type */}
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">By Image Type</h2>
          <StorageBreakdownChart
            data={stats.byImageType.map((t) => ({ label: t.type, value: t.sizeBytes }))}
            formatValue={formatBytes}
          />
        </div>

        {/* By Target */}
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">By Target</h2>
          <StorageBreakdownChart
            data={stats.byTarget.slice(0, 10).map((t) => ({ label: t.name, value: t.sizeBytes }))}
            formatValue={formatBytes}
          />
        </div>

        {/* By Filter */}
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">By Filter</h2>
          <StorageBreakdownChart
            data={stats.byFilter.map((f) => ({ label: f.filter, value: f.sizeBytes }))}
            formatValue={formatBytes}
          />
        </div>
      </div>

      {/* Snapshot History */}
      {snapshots.length > 0 && (
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Snapshot History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-astro-border">
                  <th className="text-left py-2 text-astro-muted font-medium">Date</th>
                  <th className="text-right py-2 text-astro-muted font-medium">Files</th>
                  <th className="text-right py-2 text-astro-muted font-medium">Total Size</th>
                  <th className="text-right py-2 text-astro-muted font-medium">Lights</th>
                  <th className="text-right py-2 text-astro-muted font-medium">Darks</th>
                  <th className="text-right py-2 text-astro-muted font-medium">Flats</th>
                  <th className="text-right py-2 text-astro-muted font-medium">Bias</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-b border-astro-border/50">
                    <td className="py-2 text-astro-text">{s.snapshotDate}</td>
                    <td className="py-2 text-right text-astro-text">{s.totalFiles.toLocaleString()}</td>
                    <td className="py-2 text-right text-astro-text">{formatBytes(s.totalSizeBytes)}</td>
                    <td className="py-2 text-right text-astro-muted">{formatBytes(s.lightsSizeBytes)}</td>
                    <td className="py-2 text-right text-astro-muted">{formatBytes(s.darksSizeBytes)}</td>
                    <td className="py-2 text-right text-astro-muted">{formatBytes(s.flatsSizeBytes)}</td>
                    <td className="py-2 text-right text-astro-muted">{formatBytes(s.biasSizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

