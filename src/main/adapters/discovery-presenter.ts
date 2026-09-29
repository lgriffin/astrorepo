import type { HiddenDataReport, OrphanCalibrationGroup, ProgressState, TargetDiscovery } from '@astro/domain'
import type { DiscoveryOverview } from '@astro/application'
import type { CockpitOverview, HiddenDataItem, TargetDiscoveryView } from '@shared/types'
import { formatDuration, plural } from './stacking-suggestion-presenter'

const PROGRESS_LABELS: Record<ProgressState, string> = {
  planned: 'Planned',
  capturing: 'Capturing',
  'enough-data': 'Enough data',
  stacked: 'Stacked',
  processed: 'Processed',
  final: 'Final'
}

export function toTargetDiscoveryView(d: TargetDiscovery): TargetDiscoveryView {
  return {
    ...d,
    lastCapturedAt: d.lastCapturedAt?.toISOString() ?? null,
    lastStackedAt: d.lastStackedAt?.toISOString() ?? null
  }
}

function describeSettings(g: OrphanCalibrationGroup): string {
  const parts: string[] = []
  if (g.kind === 'flat') parts.push(g.filter ? `filter ${g.filter}` : 'no filter')
  if (g.kind !== 'flat' && g.gain !== null) parts.push(`gain ${g.gain}`)
  if (g.kind === 'dark' && g.exposureSec !== null) parts.push(`${g.exposureSec} s`)
  if (g.kind === 'dark' && g.sensorTempC !== null) parts.push(`${g.sensorTempC} °C`)
  return parts.join(', ')
}

const KIND_NAME = { dark: 'dark', flat: 'flat', bias: 'bias frame' } as const

function rejectedWhere(r: HiddenDataReport['rejected']): string {
  const parts: string[] = []
  if (r.targets > 0) parts.push(`across ${plural(r.targets, 'target')}`)
  if (r.unassigned > 0) parts.push(`${r.targets > 0 ? 'and ' : ''}${r.unassigned} with no target`)
  return parts.join(' ')
}

/** The "hidden in your files" card, one line per kind of forgotten data, biggest first. */
export function toHiddenDataItems(r: HiddenDataReport): HiddenDataItem[] {
  const items: HiddenDataItem[] = []
  if (r.unstackedNights > 0) {
    const top = r.neverStacked.slice(0, 3).map(t => `${t.targetName} (${plural(t.nights, 'night')})`).join(', ')
    items.push({
      id: 'never-stacked',
      kind: 'never-stacked',
      title: `${plural(r.unstackedNights, 'night')} of subs never stacked`,
      detail: `${formatDuration(r.unstackedSec)} across ${plural(r.neverStacked.length, 'target')}, most in ${top}.`,
      link: r.neverStacked.length === 1 ? `/targets/${r.neverStacked[0].targetId}` : '/stacking'
    })
  }
  if (r.unassigned.subCount > 0) {
    const top = r.unassigned.byFolder.slice(0, 3).map(f => f.folder).join(', ')
    items.push({
      id: 'unassigned',
      kind: 'unassigned',
      title: `${plural(r.unassigned.subCount, 'sub')} with no target`,
      detail: `${formatDuration(r.unassigned.integrationSec)} over ${plural(r.unassigned.nights, 'night')}, in ${top}. Link them to a target to count them.`,
      link: '/fits-analyzer'
    })
  }
  for (const g of r.orphanCalibration) {
    items.push({
      id: `orphan-${g.kind}-${describeSettings(g)}`,
      kind: 'orphan-calibration',
      title: `${plural(g.count, KIND_NAME[g.kind])} that match no lights`,
      detail: `Taken at ${describeSettings(g) || 'unrecorded settings'}. No light frames share those settings.`,
      link: '/calibration'
    })
  }
  if (r.rejected.subCount > 0) {
    items.push({
      id: 'rejected',
      kind: 'rejected',
      title: `${plural(r.rejected.subCount, 'sub')} rejected by quality checks`,
      detail: `${formatDuration(r.rejected.integrationSec)} ${rejectedWhere(r.rejected)}. Leave them out of the next stack.`,
      link: '/fits-analyzer'
    })
  }
  return items
}

export function toCockpitOverview(discovery: DiscoveryOverview, hidden: HiddenDataReport): CockpitOverview {
  return {
    progress: discovery.progress.map(p => ({ ...p, label: PROGRESS_LABELS[p.state] })),
    hidden: toHiddenDataItems(hidden)
  }
}
