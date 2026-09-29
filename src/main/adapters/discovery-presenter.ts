import type { DuplicateReport, HiddenDataReport, OrphanCalibrationGroup, ProgressState, TargetDiscovery } from '@astro/domain'
import type { DiscoveryOverview } from '@astro/application'
import type { CockpitOverview, DuplicateView, HiddenDataItem, TargetDiscoveryView } from '@shared/types'
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

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`
}

/** The duplicate check's result, for the renderer. */
export function toDuplicateView(r: DuplicateReport & { stats: { indexed: number; reused: number; sampled: number; fullyHashed: number } }): DuplicateView {
  return {
    duplicateFiles: r.duplicateFiles,
    reclaimableBytes: r.reclaimableBytes,
    groups: r.groups.slice(0, 50).map(g => ({ sizeBytes: g.sizeBytes, paths: g.paths })),
    stats: r.stats,
    summary:
      r.duplicateFiles === 0
        ? `No duplicates among ${plural(r.stats.indexed, 'indexed file')}.`
        : `${plural(r.duplicateFiles, 'duplicate file')}, ${formatBytes(r.reclaimableBytes)} reclaimable. Nothing was deleted.`
  }
}

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
  if (r.quarantined.count > 0) {
    const examples = r.quarantined.examples.map(q => `${fileName(q.path)} (${q.error})`).join('; ')
    items.push({
      id: 'quarantined',
      kind: 'quarantined',
      title: `${plural(r.quarantined.count, 'file')} could not be read`,
      detail: `Set aside instead of indexed: ${examples}${r.quarantined.count > r.quarantined.examples.length ? ', and more' : ''}.`,
      link: '/fits-analyzer'
    })
  }
  if (r.duplicates.files > 0) {
    items.push({
      id: 'duplicates',
      kind: 'duplicates',
      title: `${plural(r.duplicates.files, 'duplicate file')}, ${formatBytes(r.duplicates.reclaimableBytes)} reclaimable`,
      detail: `${plural(r.duplicates.groups, 'file')} ${r.duplicates.groups === 1 ? 'exists' : 'exist'} at more than one path. Nothing has been deleted.`,
      link: null
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
