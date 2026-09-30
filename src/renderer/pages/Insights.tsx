import React, { useState, useEffect, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { ObservatoryTotals } from '../components/insights/ObservatoryTotals'
import { Card, EmptyState, LinkButton } from '../components/common/Card'
import { StatCard } from '../components/common/StatCard'
import { invoke } from '../hooks/useIPC'
import { formatExposure } from '../utils/format'
import type { InsightsSummary, MonthlyActivity, BestNight, QualityTrendPoint, FilterUsage, TargetProgress } from '@shared/types'

function BarChart({ data, labelKey, valueKey, color = '#6366f1' }: {
  data: Array<Record<string, unknown>>
  labelKey: string
  valueKey: string
  color?: string
}): React.ReactElement {
  const values = data.map(d => Number(d[valueKey]) || 0)
  const max = Math.max(...values, 1)
  const barWidth = Math.max(20, Math.floor(600 / data.length) - 4)

  return (
    <svg viewBox={`0 0 ${Math.max(data.length * (barWidth + 4), 100)} 160`} className="w-full h-40">
      {data.map((d, i) => {
        const h = (values[i] / max) * 120
        const x = i * (barWidth + 4)
        return (
          <g key={i}>
            <rect x={x} y={140 - h} width={barWidth} height={h} fill={color} rx={2} opacity={0.8} />
            <text x={x + barWidth / 2} y={155} textAnchor="middle" className="text-[8px] fill-astro-muted">
              {String(d[labelKey]).slice(-5)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ data, xKey, yKey, color = '#22c55e' }: {
  data: Array<Record<string, unknown>>
  xKey: string
  yKey: string
  color?: string
}): React.ReactElement {
  const values = data.map(d => Number(d[yKey]) || 0).filter(v => v > 0)
  if (values.length < 2) return <p className="text-astro-muted text-sm">Not enough data for trend</p>

  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const range = max - min || 1
  const w = 600
  const h = 120
  const points = data
    .map((d, i) => {
      const v = Number(d[yKey]) || 0
      if (v <= 0) return null
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 20) - 10
      return `${x},${y}`
    })
    .filter(Boolean)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h + 30}`} className="w-full h-40">
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
      {data.map((d, i) => (
        <text key={i} x={(i / (data.length - 1)) * w} y={h + 25} textAnchor="middle" className="text-[8px] fill-astro-muted">
          {String(d[xKey]).slice(-5)}
        </text>
      ))}
    </svg>
  )
}

function FilterPieChart({ data }: { data: FilterUsage[] }): React.ReactElement {
  const total = data.reduce((sum, d) => sum + d.totalExposureSec, 0) || 1
  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

  const arcs = data.reduce<Array<{ startAngle: number; endAngle: number; color: string }>>((acc, d, i) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].endAngle : 0
    const pct = d.totalExposureSec / total
    acc.push({ startAngle: prev, endAngle: prev + pct * 360, color: colors[i % colors.length] })
    return acc
  }, [])

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-32 h-32">
        {arcs.map((arc, i) => {
          const largeArc = (arc.endAngle - arc.startAngle) > 180 ? 1 : 0
          const startRad = (arc.startAngle - 90) * Math.PI / 180
          const endRad = (arc.endAngle - 90) * Math.PI / 180
          const x1 = 50 + 45 * Math.cos(startRad)
          const y1 = 50 + 45 * Math.sin(startRad)
          const x2 = 50 + 45 * Math.cos(endRad)
          const y2 = 50 + 45 * Math.sin(endRad)

          return (
            <path
              key={i}
              d={`M50,50 L${x1},${y1} A45,45 0 ${largeArc},1 ${x2},${y2} Z`}
              fill={arc.color}
              opacity={0.8}
            />
          )
        })}
      </svg>
      <div className="flex flex-col gap-1">
        {data.slice(0, 8).map((d, i) => (
          <div key={d.filter} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-astro-text">{d.filter}</span>
            <span className="text-astro-muted">{formatExposure(d.totalExposureSec)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Insights(): React.ReactElement {
  const [summary, setSummary] = useState<InsightsSummary | null>(null)
  const [monthly, setMonthly] = useState<MonthlyActivity[]>([])
  const [bestNights, setBestNights] = useState<BestNight[]>([])
  const [qualityTrends, setQualityTrends] = useState<QualityTrendPoint[]>([])
  const [filterUsage, setFilterUsage] = useState<FilterUsage[]>([])
  const [targetProgress, setTargetProgress] = useState<TargetProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const [s, m, bn, qt, fu, tp] = await Promise.all([
        invoke<InsightsSummary>('insights:summary'),
        invoke<MonthlyActivity[]>('insights:monthly-activity', { months: 12 }),
        invoke<BestNight[]>('insights:best-nights', { limit: 10 }),
        invoke<QualityTrendPoint[]>('insights:quality-trends', { months: 12 }),
        invoke<FilterUsage[]>('insights:filter-usage'),
        invoke<TargetProgress[]>('insights:target-progress', { limit: 15 })
      ])
      setSummary(s)
      setMonthly(m)
      setBestNights(bn)
      setQualityTrends(qt)
      setFilterUsage(fu)
      setTargetProgress(tp)
    } catch {
      setFailed(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // The totals load on their own, so they show even when the trends below cannot be read.
  if (loading || !summary) {
    return (
      <PageContainer>
        <div className="space-y-6">
          <ObservatoryTotals />
          {loading ? (
            <p className="text-astro-muted text-sm">Loading the trends…</p>
          ) : (
            <Card title="Trends">
              <EmptyState action={<LinkButton onClick={() => void loadData()}>Try again</LinkButton>}>
                {failed ? 'Could not read the seeing, filter and activity trends.' : 'No trends yet.'}
              </EmptyState>
            </Card>
          )}
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <ObservatoryTotals />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Imaging Hours" value={summary.totalImagingHours.toFixed(1)} accent />
          <StatCard label="Light Frames" value={summary.totalFiles.toLocaleString()} />
          <StatCard label="Targets Imaged" value={summary.totalTargets} />
          <StatCard label="Sessions" value={summary.totalSessions} />
        </div>

        {summary.mostImagedTarget && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Most Imaged Target" value={summary.mostImagedTarget} compact />
            {summary.mostUsedFilter && <StatCard label="Most Used Filter" value={summary.mostUsedFilter} compact />}
            {summary.bestNightDate && <StatCard label="Best Night" value={summary.bestNightDate} compact />}
          </div>
        )}

        {/* Monthly Activity */}
        {monthly.length > 0 && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Monthly Imaging Activity</h2>
            <BarChart
              data={monthly as unknown as Array<Record<string, unknown>>}
              labelKey="month"
              valueKey="totalExposureSec"
              color="#6366f1"
            />
            <div className="flex gap-4 mt-2 text-xs text-astro-muted">
              <span>Bars show total exposure time per month</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Filter Usage */}
          {filterUsage.length > 0 && (
            <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Filter Usage</h2>
              <FilterPieChart data={filterUsage} />
            </div>
          )}

          {/* Quality Trends */}
          {qualityTrends.length > 1 && (
            <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Quality Trends (FWHM)</h2>
              <LineChart
                data={qualityTrends as unknown as Array<Record<string, unknown>>}
                xKey="month"
                yKey="medianFwhm"
                color="#22c55e"
              />
            </div>
          )}
        </div>

        {/* Best Nights */}
        {bestNights.length > 0 && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Best Imaging Nights</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-astro-border text-left">
                    <th className="pb-2 pr-3 text-astro-muted font-medium">Date</th>
                    <th className="pb-2 pr-3 text-astro-muted font-medium text-right">Exposure</th>
                    <th className="pb-2 pr-3 text-astro-muted font-medium text-right">Frames</th>
                    <th className="pb-2 pr-3 text-astro-muted font-medium">Targets</th>
                    <th className="pb-2 text-astro-muted font-medium">Filters</th>
                  </tr>
                </thead>
                <tbody>
                  {bestNights.map((n, i) => (
                    <tr key={n.date} className="border-b border-astro-border/50">
                      <td className="py-2 pr-3 text-astro-text">
                        <span className="text-astro-accent mr-2">#{i + 1}</span>{n.date}
                      </td>
                      <td className="py-2 pr-3 text-astro-text text-right">{formatExposure(n.totalExposureSec)}</td>
                      <td className="py-2 pr-3 text-astro-text text-right">{n.fileCount}</td>
                      <td className="py-2 pr-3 text-astro-text">{n.targets.slice(0, 3).join(', ')}</td>
                      <td className="py-2">
                        <div className="flex gap-1 flex-wrap">
                          {n.filters.map(f => (
                            <span key={f} className="px-1.5 py-0.5 bg-astro-bg rounded text-xs text-astro-muted">{f}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Target Progress */}
        {targetProgress.length > 0 && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Target Progress</h2>
            <div className="space-y-3">
              {targetProgress.map(t => {
                const maxExp = Math.max(...targetProgress.map(tp => tp.totalExposureSec), 1)
                const pct = (t.totalExposureSec / maxExp) * 100

                return (
                  <div key={t.targetId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-astro-text font-medium">{t.targetName}</span>
                      <span className="text-astro-muted">
                        {formatExposure(t.totalExposureSec)} / {t.fileCount} frames
                      </span>
                    </div>
                    <div className="w-full bg-astro-bg rounded-full h-2">
                      <div
                        className="bg-astro-accent rounded-full h-2 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex gap-1 mt-1">
                      {Object.entries(t.filterBreakdown).map(([filter, sec]) => (
                        <span key={filter} className="text-[10px] text-astro-muted">
                          {filter}: {formatExposure(sec)}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {summary.totalFiles === 0 && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-8 text-center">
            <p className="text-astro-muted">No imaging data yet. Scan some FITS files to see insights here.</p>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
