import { unprocessedSec, type StackingSuggestion } from './stacking-readiness'
import type { TonightPlan } from './sky'

/** Something worth doing next: capture a target tonight, or stack data already captured. */
export type NextAction =
  | {
      kind: 'capture'
      id: string
      targetId: string
      targetName: string
      night: string
      usableHours: number
      moonSeparationDeg: number | null
      /** Days until the target's season closes, when that is within the planning window. */
      closesInDays: number | null
      shortOfGoalSec: number | null
    }
  | { kind: 'stack'; suggestion: StackingSuggestion }

export function captureActionId(targetId: string, night: string): string {
  return `capture:${targetId}:${night}`
}

/**
 * The cockpit's order of work. Captures come before stacking because a night passes and stacking
 * can happen any day: first targets whose season is closing (soonest first), then tonight's other
 * targets (most usable hours first), then stacking suggestions (most unprocessed integration
 * first). With no usable night, only stacking remains, so a bright or cloudy-season night still
 * leads with something to do.
 */
export function rankNextActions(
  stacking: StackingSuggestion[],
  tonight: TonightPlan | null,
  closing: { targetId: string; daysLeft: number }[]
): NextAction[] {
  const daysLeft = new Map(closing.map(c => [c.targetId, c.daysLeft]))
  const night = tonight?.night ?? ''
  const captures: Extract<NextAction, { kind: 'capture' }>[] = (tonight?.choices ?? []).map(c => ({
    kind: 'capture',
    id: captureActionId(c.targetId, night),
    targetId: c.targetId,
    targetName: c.targetName,
    night,
    usableHours: c.usableHours,
    moonSeparationDeg: c.moonSeparationDeg,
    closesInDays: daysLeft.get(c.targetId) ?? null,
    shortOfGoalSec: c.shortOfGoalSec
  }))
  const urgency = (a: (typeof captures)[number]) => a.closesInDays ?? Number.POSITIVE_INFINITY
  captures.sort(
    (a, b) => urgency(a) - urgency(b) || b.usableHours - a.usableHours || a.targetName.localeCompare(b.targetName)
  )
  const stacks = [...stacking].sort(
    (a, b) => unprocessedSec(b) - unprocessedSec(a) || a.targetName.localeCompare(b.targetName)
  )
  return [...captures, ...stacks.map(suggestion => ({ kind: 'stack' as const, suggestion }))]
}
