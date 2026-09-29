import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { StatCard } from '../components/common/StatCard'
import { invoke } from '../hooks/useIPC'
import { formatExposure } from '../utils/format'
import { ProgressStrip } from '../components/cockpit/ProgressStrip'
import { HiddenDataCard } from '../components/cockpit/HiddenDataCard'
import { useToast } from '../contexts/ToastContext'
import type { DashboardStats, CatalogueProgress, Recommendation, CockpitOverview } from '@shared/types'

export function Dashboard(): React.ReactElement {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [catalogues, setCatalogues] = useState<CatalogueProgress[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [cockpit, setCockpit] = useState<CockpitOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  useEffect(() => {
    Promise.all([
      invoke<DashboardStats>('dashboard:stats'),
      invoke<{ catalogues: CatalogueProgress[] }>('dashboard:catalogue-progress'),
      invoke<{ recommendations: Recommendation[] }>('recommendations:list'),
      invoke<CockpitOverview>('cockpit:overview').catch(() => null)
    ])
      .then(([s, c, r, k]) => {
        setStats(s)
        setCatalogues(c.catalogues)
        setRecommendations(r.recommendations)
        setCockpit(k)
      })
      .finally(() => setLoading(false))
  }, [])

  const dismiss = (rec: Recommendation) => {
    invoke<{ dismissed: boolean }>('cockpit:dismiss', { suggestion_id: rec.id })
      .then(() => {
        setRecommendations(prev => prev.filter(r => r.id !== rec.id))
        addToast(`Hidden until ${rec.targetName ?? 'the target'} gets new data`, 'success')
      })
      .catch(() => addToast('Could not dismiss that suggestion', 'error'))
  }

  if (loading || !stats) {
    return (
      <PageContainer title="Dashboard">
        <div className="text-astro-muted">Loading statistics...</div>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="Observatory Dashboard" subtitle="Overview of your astrophotography observatory">
      {cockpit && (
        <div className="mb-8 space-y-4">
          <ProgressStrip progress={cockpit.progress} />
          <HiddenDataCard items={cockpit.hidden} />
        </div>
      )}

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

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Library Data</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="With Raw Data" value={stats.targetsWithRawData} />
          <StatCard label="With Stacked Data" value={stats.targetsWithStackedData} />
          <StatCard label="With TIF Data" value={stats.targetsWithTifData} />
          <StatCard label="With Image Data" value={stats.targetsWithImageData} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Catalogue Progress</h2>
          <div className="space-y-3">
            {catalogues.map((c) => {
              const obsPct = c.total > 0 ? Math.round((c.observed / c.total) * 100) : 0
              return (
                <div key={c.catalogueId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-astro-text">{c.catalogueName}</span>
                    <span className="text-astro-muted">{c.observed}/{c.total} observed ({obsPct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-astro-bg rounded-full overflow-hidden">
                    <div className="h-full bg-astro-accent rounded-full" style={{ width: `${obsPct}%` }} />
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

      {recommendations.length > 0 && (
        <div className="mt-8 bg-astro-surface border border-astro-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Recommendations</h2>
          <div className="space-y-3">
            {recommendations.slice(0, 8).map(rec => {
              const priorityColor = rec.priority === 'high' ? 'bg-red-500/20 text-red-400' : rec.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
              return (
                <div key={rec.id} className="flex items-start gap-3 p-3 bg-astro-bg rounded-lg">
                  <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityColor}`}>{rec.priority}</span>
                    <span className="text-[10px] text-astro-muted capitalize">{rec.category}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-astro-text font-medium">{rec.title}</p>
                    <p className="text-xs text-astro-muted mt-0.5">{rec.description}</p>
                  </div>
                  {rec.actionLabel && rec.targetId && (
                    <button
                      onClick={() => navigate(`/targets/${rec.targetId}`)}
                      className="shrink-0 text-xs text-astro-accent hover:underline"
                    >
                      {rec.actionLabel}
                    </button>
                  )}
                  {rec.dismissible && (
                    <button
                      onClick={() => dismiss(rec)}
                      className="shrink-0 text-xs text-astro-muted hover:text-astro-text"
                      title="Hide until this target gets new data"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </PageContainer>
  )
}

