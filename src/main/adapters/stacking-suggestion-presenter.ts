import type { Job, NextAction, StackingSuggestion } from '@astro/domain'
import type { Recommendation } from '@shared/types'

export function formatDuration(sec: number): string {
  const totalMin = Math.round(sec / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} m`
  return m === 0 ? `${h} h` : `${h} h ${m} m`
}

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

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
      actionLabel: 'View Target',
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
    actionLabel: 'View Target',
    dismissible: true
  }
}

/** A ranked next action in the Recommendations shape; captures lead, stacking follows. */
export function toNextActionRecommendation(a: NextAction): Recommendation {
  if (a.kind === 'stack') return toRecommendation(a.suggestion)
  const hours = formatDuration(Math.round(a.usableHours * 3600))
  const parts: string[] = []
  if (a.closesInDays !== null) parts.push(`Its season closes in ${plural(a.closesInDays, 'day')}.`)
  if (a.shortOfGoalSec !== null && a.shortOfGoalSec > 0) parts.push(`${formatDuration(a.shortOfGoalSec)} short of your goal.`)
  parts.push(a.moonSeparationDeg === null ? 'The moon is down while it is up.' : `The moon comes within ${a.moonSeparationDeg}°.`)
  return {
    id: a.id,
    category: 'capture',
    priority: a.closesInDays !== null ? 'high' : 'medium',
    title: `${a.targetName} · shoot tonight, ${hours} above 30°`,
    description: parts.join(' '),
    targetId: a.targetId,
    targetName: a.targetName,
    actionLabel: 'View Target',
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
