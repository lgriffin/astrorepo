import React, { useState, useEffect } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { FitsTargetSummary } from '@shared/types'

interface TargetSummariesProps {
  scanId: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatExposure(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`
  if (sec < 3600) return `${(sec / 60).toFixed(1)}m`
  return `${(sec / 3600).toFixed(1)}h`
}

export function TargetSummaries({ scanId }: TargetSummariesProps): React.ReactElement {
  const [targets, setTargets] = useState<FitsTargetSummary[]>([])
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null)

  useEffect(() => {
    invoke<{ targets: FitsTargetSummary[] }>('fits:target-summaries', { scan_id: scanId })
      .then(r => setTargets(r.targets))
  }, [scanId])

  if (targets.length === 0) {
    return <div className="text-sm text-astro-muted">No target folders found.</div>
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-astro-border">
        <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider">Targets ({targets.length})</h2>
      </div>
      <div className="divide-y divide-astro-border">
        {targets.map((t) => (
          <div key={t.folderName}>
            <div
              onClick={() => setExpandedTarget(expandedTarget === t.folderName ? null : t.folderName)}
              className="px-4 py-3 cursor-pointer hover:bg-astro-bg/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-astro-muted text-xs">{expandedTarget === t.folderName ? '▾' : '▸'}</span>
                  <span className="text-sm font-medium text-astro-text">{t.folderName}</span>
                </div>
                <div className="flex gap-4 text-xs text-astro-muted">
                  <span>{t.totalFiles} files</span>
                  <span>{formatSize(t.totalSizeBytes)}</span>
                  <span>{formatExposure(t.totalExposureSec)} total</span>
                  <span className="text-astro-accent">{t.sessions.length} nights</span>
                </div>
              </div>
            </div>

            {expandedTarget === t.folderName && (
              <div className="px-4 pb-4 pt-1 bg-astro-bg/30">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div className="bg-astro-bg border border-astro-border rounded p-2">
                    <p className="text-xs text-astro-muted">Total Files</p>
                    <p className="text-sm font-bold text-astro-text">{t.totalFiles}</p>
                  </div>
                  <div className="bg-astro-bg border border-astro-border rounded p-2">
                    <p className="text-xs text-astro-muted">Total Exposure</p>
                    <p className="text-sm font-bold text-astro-text">{formatExposure(t.totalExposureSec)}</p>
                  </div>
                  <div className="bg-astro-bg border border-astro-border rounded p-2">
                    <p className="text-xs text-astro-muted">Stacked</p>
                    <p className="text-sm font-bold text-astro-text">{t.stackedCount}</p>
                  </div>
                  <div className="bg-astro-bg border border-astro-border rounded p-2">
                    <p className="text-xs text-astro-muted">Individual</p>
                    <p className="text-sm font-bold text-astro-text">{t.individualCount}</p>
                  </div>
                </div>

                {t.sessions.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Sessions / Nights</h4>
                    <div className="space-y-1">
                      {t.sessions.map((s) => (
                        <div key={s} className="flex justify-between text-sm">
                          <span className="text-astro-text">{s}</span>
                          <span className="text-astro-muted">{t.filesBySession[s] ?? 0} files</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(t.exposureByFilter).length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Exposure by Filter</h4>
                    <div className="space-y-1">
                      {Object.entries(t.exposureByFilter)
                        .sort(([, a], [, b]) => b - a)
                        .map(([filter, secs]) => (
                          <div key={filter} className="flex justify-between text-sm">
                            <span className="text-astro-text">{filter}</span>
                            <span className="text-astro-muted">{formatExposure(secs)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {t.filters.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.filters.map((f) => (
                      <span key={f} className="text-xs px-1.5 py-0.5 rounded bg-astro-surface text-astro-muted">{f}</span>
                    ))}
                    {t.imageTypes.map((it) => (
                      <span key={it} className="text-xs px-1.5 py-0.5 rounded bg-astro-accent/10 text-astro-accent">{it}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
