import React from 'react'
import type { IntegrationBucketView, TargetDiscoveryView } from '@shared/types'
import { formatExposure } from '../../utils/format'

const PROGRESS_LABEL: Record<TargetDiscoveryView['progress'], string> = {
  planned: 'Planned',
  capturing: 'Capturing',
  'enough-data': 'Enough data to stack',
  stacked: 'Stacked',
  processed: 'Processed',
  final: 'Final image'
}

function Buckets({ title, buckets }: { title: string; buckets: IntegrationBucketView[] }): React.ReactElement | null {
  if (buckets.length === 0) return null
  return (
    <div>
      <h3 className="text-xs text-astro-muted uppercase tracking-wider mb-1">{title}</h3>
      <ul className="space-y-0.5 text-sm">
        {buckets.map(b => (
          <li key={b.key} className="flex justify-between gap-2">
            <span className="text-astro-text truncate">{b.key}</span>
            <span className="text-astro-muted whitespace-nowrap">
              {formatExposure(b.integrationSec)} · {b.subCount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What the files say about one target (DSC-001), with its derived progress (DSC-009). */
export function TargetDiscoveryPanel({ discovery }: { discovery: TargetDiscoveryView }): React.ReactElement {
  const d = discovery
  const goalPct = d.goalSec ? Math.min(100, Math.round((d.integrationSec / d.goalSec) * 100)) : null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-astro-text font-medium">{PROGRESS_LABEL[d.progress]}</span>
        <span className="text-astro-muted">
          {formatExposure(d.integrationSec)} in {d.subCount} subs
          {goalPct !== null && ` · ${goalPct}% of goal`}
        </span>
        {d.lastCapturedAt && <span className="text-astro-muted">Last captured {d.lastCapturedAt.slice(0, 10)}</span>}
        <span className="text-astro-muted">
          {d.stackCount === 0 ? 'Never stacked' : `${d.stackCount} stacks, newest ${d.lastStackedAt?.slice(0, 10)}`}
        </span>
      </div>
      {d.unstackedNights.length > 0 && (
        <p className="text-sm text-astro-accent">
          {d.unstackedNights.length} {d.unstackedNights.length === 1 ? 'night' : 'nights'} ({formatExposure(d.unstackedSec)}) not in any stack yet.
        </p>
      )}
      {d.rejectedSubCount > 0 && (
        <p className="text-xs text-astro-muted">{d.rejectedSubCount} subs were rejected by quality checks.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Buckets title="By filter" buckets={d.byFilter} />
        <Buckets title="By scope" buckets={d.byScope} />
        <Buckets title="By night" buckets={d.byNight} />
      </div>
    </div>
  )
}
