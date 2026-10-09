import { unprocessedSec, type StackingSuggestion } from './stacking-readiness'
import type { TonightPlan } from './sky'
import type { ChannelGap } from './stacking-advice'

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
      /** The filter to capture because it lags the others (ADV-010). */
      channel: ChannelGap | null
    }
  | { kind: 'stack'; suggestion: StackingSuggestion }
  | {
      kind: 'mosaic-tile'
      id: string
      targetId: string
      targetName: string
      /** The tile with no lights, of how many. */
      tile: number
      of: number
      /** Coming nights the tile clears the altitude limit, and how many nights were looked at. */
      nights: string[]
      lookedAt: number
      goalSec: number | null
    }

/** A planned mosaic tile with no lights yet (specs/024-sky-geometry). */
export interface MosaicTileGap {
  targetId: string
  targetName: string
  tile: number
  of: number
  nights: string[]
  lookedAt: number
  goalSec: number | null
}

export function captureActionId(targetId: string, night: string): string {
  return `capture:${targetId}:${night}`
}

/**
 * The cockpit's order of work. Captures come before stacking because a night passes and stacking
 * can happen any day: first targets whose season is closing (soonest first), then tonight's other
 * targets (most usable hours first), then planned mosaic tiles with no lights yet, then stacking
 * suggestions (most unprocessed integration first). With no usable night, only stacking remains, so a bright or cloudy-season night still
 * leads with something to do.
 */
export function rankNextActions(
  stacking: StackingSuggestion[],
  tonight: TonightPlan | null,
  closing: { targetId: string; daysLeft: number }[],
  tiles: MosaicTileGap[] = []
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
    shortOfGoalSec: c.shortOfGoalSec,
    channel: c.channel
  }))
  const urgency = (a: (typeof captures)[number]) => a.closesInDays ?? Number.POSITIVE_INFINITY
  captures.sort(
    (a, b) => urgency(a) - urgency(b) || b.usableHours - a.usableHours || a.targetName.localeCompare(b.targetName)
  )
  const stacks = [...stacking].sort(
    (a, b) => unprocessedSec(b) - unprocessedSec(a) || a.targetName.localeCompare(b.targetName)
  )
  // A tile with no lights is a capture still to plan: after tonight's captures, before stacking,
  // the one visible soonest first.
  const gaps = [...tiles]
    .sort((a, b) => (a.nights[0] ?? '9999').localeCompare(b.nights[0] ?? '9999') || a.targetName.localeCompare(b.targetName) || a.tile - b.tile)
    .map(t => ({ kind: 'mosaic-tile' as const, id: `mosaic-tile:${t.targetId}:${t.tile}`, ...t }))
  return [...captures, ...gaps, ...stacks.map(suggestion => ({ kind: 'stack' as const, suggestion }))]
}
