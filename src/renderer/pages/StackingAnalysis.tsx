import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { useToast } from '../contexts/ToastContext'
import { invoke } from '../hooks/useIPC'
import type {
  StackingSummary, StackingSummaryRow, StackedWithSubFrames, SubFrameInfo,
  TargetIntegrationProgress, FilterProgress
} from '@shared/types'

function formatHours(seconds: number): string {
  const h = seconds / 3600
  return h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(seconds / 60)}m`
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function StackingAnalysis(): React.ReactElement {
  const [summary, setSummary] = useState<StackingSummary | null>(null)
  const [progressTargets, setProgressTargets] = useState<TargetIntegrationProgress[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [sumResult, progResult] = await Promise.all([
        invoke<StackingSummary>('stacking:summary'),
        invoke<{ targets: TargetIntegrationProgress[] }>('stacking:integration-progress')
      ])
      setSummary(sumResult)
      setProgressTargets(progResult.targets)
    } catch {
      setSummary(null)
      setProgressTargets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <PageContainer title="Stacking Analysis" subtitle="Loading...">
        <div className="text-center py-12 text-astro-muted">Loading stacking data...</div>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="Stacking Analysis" subtitle="Integration summary, sub-frame breakdown, and progress tracking">
      <div className="space-y-8">
        <StackingSummarySection summary={summary} />
        <SubFrameBreakdownSection rows={summary?.rows ?? []} />
        <IntegrationProgressSection targets={progressTargets} onGoalChanged={loadData} />
      </div>
    </PageContainer>
  )
}

// Section 1: Stacking Summary Dashboard

function StackingSummarySection({ summary }: { summary: StackingSummary | null }): React.ReactElement {
  const [targetFilter, setTargetFilter] = useState('')
  const [filterFilter, setFilterFilter] = useState('')

  if (!summary || summary.totalStacked === 0) {
    return (
      <Section title="Stacking Summary">
        <p className="text-astro-muted text-sm">No stacked files found. Run a FITS scan to detect stacked masters.</p>
      </Section>
    )
  }

  const targets = [...new Set(summary.rows.map(r => r.targetName).filter(Boolean))] as string[]

  const filtered = summary.rows.filter(r => {
    if (targetFilter && r.targetName !== targetFilter) return false
    if (filterFilter && r.filter !== filterFilter) return false
    return true
  })

  return (
    <Section title="Stacking Summary">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="Stacked Masters" value={summary.totalStacked} />
        <StatCard label="Combined Subs" value={summary.totalNcombine} />
        <StatCard label="Total Integration" value={formatHours(summary.totalIntegrationSec)} />
        <StatCard label="Software" value={summary.softwareUsed.join(', ') || 'Unknown'} small />
        <StatCard label="Filters" value={summary.filtersUsed.join(', ') || 'None'} small />
      </div>

      <div className="flex gap-3 mb-3">
        <select value={targetFilter} onChange={e => setTargetFilter(e.target.value)}
          className="px-3 py-2 bg-astro-surface border border-astro-border rounded-lg text-astro-text text-sm">
          <option value="">All Targets</option>
          {targets.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterFilter} onChange={e => setFilterFilter(e.target.value)}
          className="px-3 py-2 bg-astro-surface border border-astro-border rounded-lg text-astro-text text-sm">
          <option value="">All Filters</option>
          {summary.filtersUsed.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-astro-muted border-b border-astro-border">
              <th className="py-2 pr-3">Target</th>
              <th className="py-2 pr-3">Filter</th>
              <th className="py-2 pr-3">Ncombine</th>
              <th className="py-2 pr-3">Integration</th>
              <th className="py-2 pr-3">Software</th>
              <th className="py-2 pr-3">Session</th>
              <th className="py-2 pr-3">Date</th>
              <th className="py-2">Size</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <StackedFileRow key={row.fileId} row={row} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center py-4 text-astro-muted text-sm">No stacked files match the selected filters.</p>
        )}
      </div>
    </Section>
  )
}

function StackedFileRow({ row }: { row: StackingSummaryRow }): React.ReactElement {
  return (
    <tr className="border-b border-astro-border/50 hover:bg-astro-bg/50">
      <td className="py-2 pr-3 text-astro-text">
        {row.targetId ? (
          <Link to={`/targets/${row.targetId}`} className="text-astro-accent hover:underline">{row.targetName}</Link>
        ) : (
          <span className="text-astro-muted">Unlinked</span>
        )}
      </td>
      <td className="py-2 pr-3 text-astro-text">{row.filter ?? '—'}</td>
      <td className="py-2 pr-3 text-astro-text">{row.ncombine ?? '—'}</td>
      <td className="py-2 pr-3 text-astro-text">{row.totalExposureSec ? formatHours(row.totalExposureSec) : '—'}</td>
      <td className="py-2 pr-3 text-astro-muted text-xs">{row.software ?? '—'}</td>
      <td className="py-2 pr-3 text-astro-muted text-xs">{row.sessionFolder ?? '—'}</td>
      <td className="py-2 pr-3 text-astro-muted text-xs">{row.dateObs?.split('T')[0] ?? '—'}</td>
      <td className="py-2 text-astro-muted text-xs">{formatSize(row.fileSizeBytes)}</td>
    </tr>
  )
}

// Section 2: Sub-frame Breakdown

function SubFrameBreakdownSection({ rows }: { rows: StackingSummaryRow[] }): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [subFrameData, setSubFrameData] = useState<Map<string, StackedWithSubFrames>>(new Map())
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleExpand = useCallback(async (fileId: string) => {
    if (expandedId === fileId) {
      setExpandedId(null)
      return
    }
    setExpandedId(fileId)
    if (!subFrameData.has(fileId)) {
      setLoadingId(fileId)
      try {
        const result = await invoke<StackedWithSubFrames>('stacking:sub-frames', { stacked_file_id: fileId })
        if (result) {
          setSubFrameData(prev => new Map(prev).set(fileId, result))
        }
      } catch { /* ignore */ }
      setLoadingId(null)
    }
  }, [expandedId, subFrameData])

  if (rows.length === 0) {
    return (
      <Section title="Sub-frame Breakdown">
        <p className="text-astro-muted text-sm">No stacked files to analyze.</p>
      </Section>
    )
  }

  return (
    <Section title="Sub-frame Breakdown">
      <p className="text-astro-muted text-xs mb-3">Click a stacked master to see its constituent sub-frames.</p>
      <div className="space-y-1">
        {rows.map(row => {
          const isExpanded = expandedId === row.fileId
          const data = subFrameData.get(row.fileId)
          const isLoading = loadingId === row.fileId

          return (
            <div key={row.fileId} className="border border-astro-border rounded-lg overflow-hidden">
              <button
                onClick={() => handleExpand(row.fileId)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-astro-bg/50 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-astro-accent">{isExpanded ? '▾' : '▸'}</span>
                  <span className="text-astro-text font-medium">{row.targetName ?? row.fileName}</span>
                  {row.filter && <span className="px-1.5 py-0.5 bg-astro-bg rounded text-xs text-astro-muted">{row.filter}</span>}
                </div>
                <div className="flex items-center gap-4 text-xs text-astro-muted">
                  <span>Ncombine: {row.ncombine ?? '?'}</span>
                  <span>{row.totalExposureSec ? formatHours(row.totalExposureSec) : '—'}</span>
                  <span>{row.sessionFolder ?? ''}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 border-t border-astro-border/50">
                  {isLoading ? (
                    <p className="py-3 text-astro-muted text-sm">Loading sub-frames...</p>
                  ) : data ? (
                    <SubFrameTable data={data} />
                  ) : (
                    <p className="py-3 text-astro-muted text-sm">Could not load sub-frame data.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function SubFrameTable({ data }: { data: StackedWithSubFrames }): React.ReactElement {
  const mismatch = data.ncombine != null && data.matchedCount !== data.ncombine

  return (
    <div className="pt-2">
      <div className="flex items-center gap-3 mb-2 text-xs">
        <span className="text-astro-muted">Matched {data.matchedCount} sub-frames</span>
        {mismatch && (
          <span className="text-yellow-400">Expected {data.ncombine} (ncombine)</span>
        )}
      </div>
      {data.subFrames.length === 0 ? (
        <p className="text-astro-muted text-sm py-2">No matching sub-frames found in the database.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-astro-muted border-b border-astro-border/50">
              <th className="py-1.5 pr-3">File</th>
              <th className="py-1.5 pr-3">Exposure</th>
              <th className="py-1.5 pr-3">Date</th>
              <th className="py-1.5 pr-3">Quality</th>
              <th className="py-1.5 pr-3">FWHM</th>
              <th className="py-1.5">Noise</th>
            </tr>
          </thead>
          <tbody>
            {data.subFrames.map(sf => (
              <SubFrameRow key={sf.fileId} sf={sf} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SubFrameRow({ sf }: { sf: SubFrameInfo }): React.ReactElement {
  const qColor = sf.qualityFlag === 'good' ? 'text-green-400'
    : sf.qualityFlag === 'warning' ? 'text-yellow-400'
    : sf.qualityFlag === 'reject' ? 'text-red-400'
    : 'text-astro-muted'

  return (
    <tr className="border-b border-astro-border/30 hover:bg-astro-bg/30">
      <td className="py-1.5 pr-3 text-astro-text">{sf.fileName}</td>
      <td className="py-1.5 pr-3 text-astro-text">{sf.exposureSec ? `${sf.exposureSec}s` : '—'}</td>
      <td className="py-1.5 pr-3 text-astro-muted">{sf.dateObs?.split('T')[0] ?? '—'}</td>
      <td className="py-1.5 pr-3">
        {sf.qualityScore != null ? (
          <span className={qColor}>{sf.qualityScore.toFixed(0)}</span>
        ) : (
          <span className="text-astro-muted">—</span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-astro-muted">{sf.fwhmEstimate?.toFixed(1) ?? '—'}</td>
      <td className="py-1.5 text-astro-muted">{sf.noiseLevel?.toFixed(1) ?? '—'}</td>
    </tr>
  )
}

// Section 3: Integration Progress

function IntegrationProgressSection({ targets, onGoalChanged }: {
  targets: TargetIntegrationProgress[]
  onGoalChanged: () => void
}): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (targets.length === 0) {
    return (
      <Section title="Integration Progress">
        <p className="text-astro-muted text-sm">No linked light frames found. Run a FITS scan and link files to targets.</p>
      </Section>
    )
  }

  return (
    <Section title="Integration Progress">
      <p className="text-astro-muted text-xs mb-3">Per-target integration time by filter. Set goals to track progress.</p>
      <div className="space-y-1">
        {targets.map(target => (
          <div key={target.targetId} className="border border-astro-border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedId(expandedId === target.targetId ? null : target.targetId)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-astro-bg/50 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-astro-accent">{expandedId === target.targetId ? '▾' : '▸'}</span>
                <Link to={`/targets/${target.targetId}`} className="text-astro-accent hover:underline font-medium"
                  onClick={e => e.stopPropagation()}>
                  {target.targetName}
                </Link>
              </div>
              <div className="flex items-center gap-4 text-xs text-astro-muted">
                <span>{formatHours(target.totalIntegrationSec)} total</span>
                <span>{target.filters.length} filter{target.filters.length !== 1 ? 's' : ''}</span>
                <span>{target.sessionCount} session{target.sessionCount !== 1 ? 's' : ''}</span>
              </div>
            </button>

            {expandedId === target.targetId && (
              <div className="px-4 pb-3 border-t border-astro-border/50">
                <div className="space-y-2 pt-2">
                  {target.filters.map(fp => (
                    <FilterProgressRow key={fp.filter} fp={fp} targetId={target.targetId} onGoalChanged={onGoalChanged} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

function FilterProgressRow({ fp, targetId, onGoalChanged }: {
  fp: FilterProgress
  targetId: string
  onGoalChanged: () => void
}): React.ReactElement {
  const { addToast } = useToast()
  const [goalInput, setGoalInput] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSetGoal = async () => {
    const hours = parseFloat(goalInput)
    if (!hours || hours <= 0) return
    setSaving(true)
    try {
      await invoke('stacking:set-goal', { target_id: targetId, filter: fp.filter, goal_hours: hours })
      addToast(`Goal set: ${hours}h ${fp.filter}`, 'success')
      setGoalInput('')
      onGoalChanged()
    } catch {
      addToast('Failed to set goal', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGoal = async () => {
    try {
      const goals = await invoke<{ goals: Array<{ id: string; filter: string }> }>('stacking:goals', { target_id: targetId })
      const goal = goals.goals.find(g => g.filter === fp.filter)
      if (goal) {
        await invoke('stacking:delete-goal', { id: goal.id })
        addToast(`Goal cleared for ${fp.filter}`, 'info')
        onGoalChanged()
      }
    } catch {
      addToast('Failed to clear goal', 'error')
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-sm text-astro-text font-medium shrink-0">{fp.filter}</span>

      <div className="flex-1">
        {fp.goalSec != null ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-astro-muted">
                {formatHours(fp.integrationSec)} / {formatHours(fp.goalSec)} ({fp.percentComplete}%)
              </span>
              <span className="text-astro-muted">{fp.frameCount} frames, {fp.stackedCount} stacked</span>
            </div>
            <div className="w-full h-2 bg-astro-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${(fp.percentComplete ?? 0) >= 100 ? 'bg-green-500' : 'bg-astro-accent'}`}
                style={{ width: `${Math.min(100, fp.percentComplete ?? 0)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs">
            <span className="text-astro-text">{formatHours(fp.integrationSec)}</span>
            <span className="text-astro-muted">{fp.frameCount} frames, {fp.stackedCount} stacked</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {fp.goalSec != null ? (
          <button onClick={handleDeleteGoal} className="text-astro-muted hover:text-red-400 text-xs px-1" title="Clear goal">
            x
          </button>
        ) : (
          <>
            <input
              type="number"
              min="0.1"
              step="0.5"
              placeholder="hrs"
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSetGoal()}
              className="w-16 px-2 py-1 bg-astro-bg border border-astro-border rounded text-astro-text text-xs"
            />
            <button
              onClick={handleSetGoal}
              disabled={saving || !goalInput}
              className="px-2 py-1 bg-astro-accent/20 text-astro-accent rounded text-xs hover:bg-astro-accent/30 disabled:opacity-40"
            >
              Set
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// Shared UI components

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-5">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  )
}

function StatCard({ label, value, small }: { label: string; value: string | number; small?: boolean }): React.ReactElement {
  return (
    <div className="bg-astro-bg rounded-lg p-3 border border-astro-border/50">
      <p className="text-xs text-astro-muted mb-1">{label}</p>
      <p className={`text-astro-text font-semibold ${small ? 'text-xs' : 'text-lg'}`}>{value}</p>
    </div>
  )
}
