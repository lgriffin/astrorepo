import type { StackingSuggestion } from '@astro/domain'
import type { Recommendation } from '@shared/types'

export function formatDuration(sec: number): string {
  const totalMin = Math.round(sec / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} m`
  return m === 0 ? `${h} h` : `${h} h ${m} m`
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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
