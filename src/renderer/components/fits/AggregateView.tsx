import React from 'react'
import type { FitsScanAggregates, FitsLinkingStatus } from '@shared/types'

interface AggregateViewProps {
  aggregates: FitsScanAggregates
  linkingStatus?: FitsLinkingStatus | null
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatExposure(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`
  if (sec < 3600) return `${(sec / 60).toFixed(1)}m`
  return `${(sec / 3600).toFixed(1)}h`
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }): React.ReactElement {
  return (
    <div className="bg-astro-bg border border-astro-border rounded-lg p-3">
      <p className="text-xs text-astro-muted uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-1 ${accent ? 'text-astro-accent' : 'text-astro-text'}`}>{value}</p>
    </div>
  )
}

function BreakdownCard({ title, data }: { title: string; data: Record<string, number> }): React.ReactElement | null {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a)
  if (entries.length === 0) return null

  return (
    <div className="bg-astro-bg border border-astro-border rounded-lg p-3">
      <h3 className="text-xs text-astro-muted uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-1.5">
        {entries.map(([name, count]) => (
          <div key={name} className="flex justify-between text-sm">
            <span className="text-astro-text truncate mr-2">{name}</span>
            <span className="text-astro-muted shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AggregateView({ aggregates, linkingStatus }: AggregateViewProps): React.ReactElement {
  const a = aggregates

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Files" value={a.totalFiles} accent />
        <StatCard label="Total Size" value={formatSize(a.totalSizeBytes)} />
        <StatCard label="Total Exposure" value={formatExposure(a.totalExposureSec)} />
        <StatCard label="Avg Exposure" value={a.avgExposureSec ? formatExposure(a.avgExposureSec) : '-'} />
        <StatCard label="Targets" value={a.uniqueObjects.length} />
        <StatCard label="Filters" value={a.uniqueFilters.length} />
        <StatCard label="Stacked" value={a.stackedCount} />
        <StatCard label="Individual" value={a.individualCount} />
      </div>

      {linkingStatus && (
        <div className="flex gap-4 text-sm">
          <span className="text-green-400">Linked: {linkingStatus.linked}</span>
          <span className="text-astro-muted">Unlinked: {linkingStatus.unlinked}</span>
          {Object.keys(linkingStatus.byTarget).length > 0 && (
            <span className="text-astro-muted">
              ({Object.entries(linkingStatus.byTarget).map(([name, count]) => `${name}: ${count}`).join(', ')})
            </span>
          )}
        </div>
      )}

      {a.dateRange.earliest && (
        <div className="text-sm text-astro-muted">
          Date range: <span className="text-astro-text">{a.dateRange.earliest}</span> to <span className="text-astro-text">{a.dateRange.latest}</span>
          {a.avgCcdTemp !== null && (
            <span className="ml-4">Avg CCD temp: <span className="text-astro-text">{a.avgCcdTemp.toFixed(1)}&deg;C</span></span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <BreakdownCard title="Files by Folder (Target)" data={a.filesByFolder} />
        <BreakdownCard title="Files by Session" data={a.filesBySessionFolder} />
        <BreakdownCard title="Files by Object" data={a.filesByObject} />
        <BreakdownCard title="Files by Filter" data={a.filesByFilter} />
        <BreakdownCard title="Files by Type" data={a.filesByImageType} />
        <BreakdownCard title="Exposure by Filter" data={Object.fromEntries(
          Object.entries(a.exposureByFilter).map(([k, v]) => [k, Math.round(v)])
        )} />
        {Object.keys(a.nightsPerObject).length > 0 && (
          <div className="bg-astro-bg border border-astro-border rounded-lg p-3">
            <h3 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Sessions per Target</h3>
            <div className="space-y-2">
              {Object.entries(a.nightsPerObject)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([obj, sessions]) => (
                  <div key={obj}>
                    <div className="flex justify-between text-sm">
                      <span className="text-astro-text truncate mr-2">{obj}</span>
                      <span className="text-astro-accent shrink-0">{sessions.length} nights</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {sessions.map((s) => (
                        <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-astro-surface text-astro-muted">{s}</span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
        {(a.uniqueTelescopes.length > 0 || a.uniqueInstruments.length > 0) && (
          <div className="bg-astro-bg border border-astro-border rounded-lg p-3">
            <h3 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Equipment</h3>
            <div className="space-y-1.5 text-sm">
              {a.uniqueTelescopes.map((t) => (
                <div key={t} className="text-astro-text">{t}</div>
              ))}
              {a.uniqueInstruments.map((i) => (
                <div key={i} className="text-astro-muted">{i}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
