import type { NextAction, StackingSuggestion } from '@astro/domain'
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
