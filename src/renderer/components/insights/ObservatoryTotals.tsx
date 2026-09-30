import React, { useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import { formatExposure } from '../../utils/format'
import { StatCard } from '../common/StatCard'
import { Card, EmptyState } from '../common/Card'
import type { CatalogueProgress, DashboardStats } from '@shared/types'

/**
 * Totals and breakdowns across the whole observatory. They used to sit on the first screen, ahead
 * of what to do next; they are for looking back, so they live on Insights (UX-006).
 */
export function ObservatoryTotals(): React.ReactElement {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [catalogues, setCatalogues] = useState<CatalogueProgress[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    Promise.all([invoke<DashboardStats>('dashboard:stats'), invoke<{ catalogues: CatalogueProgress[] }>('dashboard:catalogue-progress')])
      .then(([s, c]) => {
        if (!current) return
        setStats(s)
        setCatalogues(c.catalogues)
      })
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [])

  if (failed) return <Card title="Your observatory"><EmptyState>The totals could not be worked out.</EmptyState></Card>
  if (!stats) return <Card title="Your observatory"><EmptyState>Adding up your targets and nights…</EmptyState></Card>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Targets" value={stats.totalTargets} />
        <StatCard label="Completed" value={stats.completedTargets} accent />
        <StatCard label="In progress" value={stats.inProgressTargets} />
        <StatCard label="Planned" value={stats.plannedTargets} />
        <StatCard label="Nights" value={stats.observationNights} />
        <StatCard label="Total exposure" value={formatExposure(stats.totalExposureSec)} />
        <StatCard label="With raw data" value={stats.targetsWithRawData} compact />
        <StatCard label="With a stack" value={stats.targetsWithStackedData} compact />
        <StatCard label="With a TIFF" value={stats.targetsWithTifData} compact />
        <StatCard label="With an image" value={stats.targetsWithImageData} compact />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Card title="Catalogue progress">
          {catalogues.length === 0 ? (
            <EmptyState>No catalogues loaded yet.</EmptyState>
          ) : (
            <div className="space-y-3">
              {catalogues.map(c => {
                const pct = c.total > 0 ? Math.round((c.observed / c.total) * 100) : 0
                return (
                  <div key={c.catalogueId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-astro-text">{c.catalogueName}</span>
                      <span className="text-astro-muted">
                        {c.observed}/{c.total} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-astro-bg rounded-full overflow-hidden">
                      <div className="h-full bg-astro-accent rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="Objects by type">
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
        </Card>

        <Card title="Most used equipment">
          {stats.mostUsedEquipment.length === 0 ? (
            <EmptyState>Log a night with its equipment to see which you use most.</EmptyState>
          ) : (
            <div className="space-y-2">
              {stats.mostUsedEquipment.map(eq => (
                <div key={eq.name} className="flex justify-between text-sm">
                  <span className="text-astro-text">{eq.name}</span>
                  <span className="text-astro-muted">{eq.sessionCount} nights</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
