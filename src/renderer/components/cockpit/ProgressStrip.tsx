import React from 'react'
import type { CockpitOverview } from '@shared/types'

/** How many targets sit at each stage, derived from their files (DSC-009). */
export function ProgressStrip({ progress }: { progress: CockpitOverview['progress'] }): React.ReactElement {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2" aria-label="Targets by progress">
      {progress.map((p, i) => (
        <div key={p.state} className="bg-astro-bg border border-astro-border rounded-lg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-astro-muted">
            {i + 1}. {p.label}
          </div>
          <div className="text-xl font-semibold text-astro-text">{p.count}</div>
        </div>
      ))}
    </div>
  )
}
