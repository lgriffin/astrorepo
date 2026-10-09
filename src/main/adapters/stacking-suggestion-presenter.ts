import type { ChannelGap, Job, NextAction, StackingSuggestion } from '@astro/domain'
import { mosaicPlannerLink } from '@shared/navigation'
import type { Recommendation } from '@shared/types'
import { targetLink } from '@shared/navigation'

export function formatDuration(sec: number): string {
  const totalMin = Math.round(sec / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} m`
  return m === 0 ? `${h} h` : `${h} h ${m} m`
}

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

/** "Capture OIII: it has 40 m against 6 h of Ha." (ADV-010) */
export function channelLine(gap: ChannelGap): string {
  const have = gap.haveSec > 0 ? formatDuration(gap.haveSec) : 'nothing yet'
  return `Capture ${gap.filter}: it has ${have} against ${formatDuration(gap.leadSec)} of ${gap.leadFilter}.`
}

/** Presents a core suggestion in the shape the existing Dashboard already renders. */
export function toRecommendation(s: StackingSuggestion): Recommendation {
  if (s.kind === 'ready-to-stack') {
    return {
      id: s.id,
      category: 'stacking',
      priority: 'high',
      title: `${s.targetName} · ${formatDuration(s.integrationSec)}, never stacked`,
      description: `${plural(s.subCount, 'sub')} across ${plural(s.nights, 'night')} are waiting to be stacked.`,
      targetId: s.targetId,
      targetName: s.targetName,
      actionLabel: 'Open the stacking plan',
      actionTo: targetLink(s.targetId, 'process'),
      dismissible: true
    }
  }
  return {
    id: s.id,
    category: 'stacking',
    priority: 'medium',
    title: `${s.targetName} · +${formatDuration(s.addedSec)} since last stack`,
    description: `${plural(s.addedSubCount, 'newer sub')} captured after the stack of ${s.lastStackedAt.toISOString().slice(0, 10)}. A restack would include them.`,
    targetId: s.targetId,
    targetName: s.targetName,
    actionLabel: 'Open the stacking plan',
    actionTo: targetLink(s.targetId, 'process'),
    dismissible: true
  }
}

/** A ranked next action in the Recommendations shape; captures lead, stacking follows. */
export function toNextActionRecommendation(a: NextAction): Recommendation {
  if (a.kind === 'stack') return toRecommendation(a.suggestion)
  if (a.kind === 'mosaic-tile') return toMosaicTileRecommendation(a)
  const hours = formatDuration(Math.round(a.usableHours * 3600))
  const parts: string[] = []
  if (a.closesInDays !== null) parts.push(`Its season closes in ${plural(a.closesInDays, 'day')}.`)
  if (a.shortOfGoalSec !== null && a.shortOfGoalSec > 0) parts.push(`${formatDuration(a.shortOfGoalSec)} short of your goal.`)
  if (a.channel) parts.push(channelLine(a.channel))
  parts.push(a.moonSeparationDeg === null ? 'The moon is down while it is up.' : `The moon comes within ${a.moonSeparationDeg}°.`)
  return {
    id: a.id,
    category: 'capture',
    priority: a.closesInDays !== null ? 'high' : 'medium',
    title: `${a.targetName} · shoot tonight${a.channel ? ` in ${a.channel.filter}` : ''}, ${hours} above 30°`,
    description: parts.join(' '),
    targetId: a.targetId,
    targetName: a.targetName,
    actionLabel: 'Open target',
    dismissible: false
  }
}

/**
 * Marks each stacking suggestion whose target already has a stack job queued or running (UX-007),
 * so Home says where the work is instead of asking for it again, and its action opens Jobs.
 */
export function withQueuedJobs(recommendations: Recommendation[], jobs: Pick<Job, 'targetId' | 'kind' | 'state' | 'timing'>[]): Recommendation[] {
  const active = new Map<string, Pick<Job, 'state' | 'timing'>>()
  for (const job of jobs) {
    if (job.kind !== 'stack' || (job.state !== 'queued' && job.state !== 'running')) continue
    // A running job says more than a queued one for the same target.
    if (!active.has(job.targetId) || job.state === 'running') active.set(job.targetId, job)
  }
  return recommendations.map(r => {
    const job = r.category === 'stacking' && r.targetId ? active.get(r.targetId) : undefined
    if (!job) return r
    const queued =
      job.state === 'running'
        ? 'Stacking now. The live log is in Jobs.'
        : job.timing === 'now'
          ? 'Queued in Jobs to run as soon as it can.'
          : 'Queued in Jobs for the run window.'
    return { ...r, queued, actionLabel: 'Open Jobs', actionTo: '/jobs' }
  })
}

const shortDate = (night: string) => {
  const [, m, d] = night.split('-').map(Number)
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`
}

/** "M 31 · tile 3 of 6 has no lights" with the coming nights it clears the altitude limit (SKY-012). */
export function toMosaicTileRecommendation(a: Extract<NextAction, { kind: 'mosaic-tile' }>): Recommendation {
  const visible =
    a.lookedAt === 0
      ? 'Set your site in Settings to see the nights it is visible.'
      : a.nights.length === 0
        ? `It does not clear 30° for an hour on any of the next ${a.lookedAt} nights.`
        : `It is up for at least an hour above 30° on ${plural(a.nights.length, 'night')} of the next ${a.lookedAt}, first on ${shortDate(a.nights[0])}${a.nights.length > 1 ? ` and last on ${shortDate(a.nights[a.nights.length - 1])}` : ''}.`
  const goal = a.goalSec ? ` Each panel needs ${formatDuration(a.goalSec)} for your goal.` : ''
  return {
    id: a.id,
    category: 'capture',
    priority: 'medium',
    title: `${a.targetName} · tile ${a.tile} of ${a.of} has no lights`,
    description: `${visible}${goal}`,
    targetId: a.targetId,
    targetName: a.targetName,
    actionLabel: 'Open the mosaic plan',
    actionTo: mosaicPlannerLink(a.targetId),
    dismissible: false
  }
}
