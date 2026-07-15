import React, { useState, useEffect } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { DashboardStats, CatalogueProgress } from '@shared/types'

export function Dashboard(): React.ReactElement {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [catalogues, setCatalogues] = useState<CatalogueProgress[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      invoke<DashboardStats>('dashboard:stats'),
      invoke<{ catalogues: CatalogueProgress[] }>('dashboard:catalogue-progress')
    ])
      .then(([s, c]) => {
        setStats(s)
        setCatalogues(c.catalogues)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !stats) {
    return (
      <PageContainer title="Dashboard">
        <div className="text-astro-muted">Loading statistics...</div>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="Observatory Dashboard" subtitle="Overview of your astrophotography observatory">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Targets" value={stats.totalTargets} />
        <StatCard label="Completed" value={stats.completedTargets} accent />
        <StatCard label="In Progress" value={stats.inProgressTargets} />
        <StatCard label="Planned" value={stats.plannedTargets} />
        <StatCard label="Observation Nights" value={stats.observationNights} />
        <StatCard label="Total Exposure" value={formatExposure(stats.totalExposureSec)} />
        <StatCard label="Object Types" value={Object.keys(stats.objectsByType).length} />
        <StatCard label="Catalogues" value={Object.keys(stats.objectsByCatalogue).length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Catalogue Progress</h2>
          <div className="space-y-3">
            {catalogues.map((c) => {
              const pct = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0
              return (
                <div key={c.catalogueId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-astro-text">{c.catalogueName}</span>
                    <span className="text-astro-muted">{c.completed}/{c.total} ({pct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-astro-bg rounded-full overflow-hidden">
                    <div className="h-full bg-astro-accent rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {catalogues.length === 0 && <p className="text-sm text-astro-muted">No catalogues loaded yet.</p>}
          </div>
        </div>

        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Objects by Type</h2>
          <div className="space-y-2">
            {Object.entries(stats.objectsByType)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-astro-text capitalize">{type.replace(/_/g, ' ')}</span>
                  <span className="text-astro-muted">{count}</span>
                </div>
              ))}
          </div>
        </div>

        {stats.mostUsedEquipment.length > 0 && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Most Used Equipment</h2>
            <div className="space-y-2">
              {stats.mostUsedEquipment.map((eq) => (
                <div key={eq.name} className="flex justify-between text-sm">
                  <span className="text-astro-text">{eq.name}</span>
                  <span className="text-astro-muted">{eq.sessionCount} sessions</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }): React.ReactElement {
  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <p className="text-xs text-astro-muted uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ? 'text-astro-accent' : 'text-astro-text'}`}>{value}</p>
    </div>
  )
}

function formatExposure(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${(sec / 60).toFixed(0)}m`
  return `${(sec / 3600).toFixed(1)}h`
}
