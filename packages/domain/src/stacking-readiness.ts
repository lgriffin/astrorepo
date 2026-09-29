import { observingNightOf } from './observing-night'

export interface LightSub {
  exposureSec: number
  capturedAt: Date | null
  /** FILTER header, as written by the capture software. */
  filter: string | null
  /** The instrument that took it (TELESCOP, else INSTRUME). */
  scope: string | null
  /** True when quality analysis flagged the sub for rejection. */
  rejected: boolean
}

export interface StackedImage {
  /** When the stack was produced, not the DATE-OBS it inherits from its first sub. */
  producedAt: Date
}

export interface TargetFrames {
  targetId: string
  targetName: string
  subs: LightSub[]
  stacks: StackedImage[]
  /** Sum of the user's integration goals for the target, if any are set. */
  goalSec: number | null
  /** Processed files (for example TIFFs out of Siril) found for the target. */
  processedCount: number
  /** Finished images (JPEG, PNG) found for the target. */
  finalCount: number
}

export interface StackingPolicy {
  /** Unstacked integration needed before a target is worth stacking. */
  readyToStackSec: number
  /** New integration since the last stack needed before a restack is worth it. */
  restackSec: number
}

export const DEFAULT_STACKING_POLICY: StackingPolicy = {
  readyToStackSec: 2 * 3600,
  restackSec: 3600
}

export type StackingSuggestion =
  | {
      kind: 'ready-to-stack'
      id: string
      targetId: string
      targetName: string
      integrationSec: number
      subCount: number
      nights: number
    }
  | {
      kind: 'restack'
      id: string
      targetId: string
      targetName: string
      addedSec: number
      addedSubCount: number
      lastStackedAt: Date
    }

/** Stable across runs, so a dismissal can find the suggestion again. */
export function suggestionId(kind: StackingSuggestion['kind'], targetId: string): string {
  return `${kind}:${targetId}`
}

function nightsSpanned(subs: LightSub[]): number {
  const nights = new Set<string>()
  for (const s of subs) if (s.capturedAt) nights.add(observingNightOf(s.capturedAt))
  return nights.size
}

export function totalSec(subs: LightSub[]): number {
  return subs.reduce((sum, s) => sum + s.exposureSec, 0)
}

/** What stacking work a target is ready for, if any. Pure: no I/O, no clock. */
export function assessStackingReadiness(
  target: TargetFrames,
  policy: StackingPolicy = DEFAULT_STACKING_POLICY
): StackingSuggestion | null {
  if (target.stacks.length === 0) {
    const integrationSec = totalSec(target.subs)
    if (integrationSec < policy.readyToStackSec) return null
    return {
      kind: 'ready-to-stack',
      id: suggestionId('ready-to-stack', target.targetId),
      targetId: target.targetId,
      targetName: target.targetName,
      integrationSec,
      subCount: target.subs.length,
      nights: nightsSpanned(target.subs)
    }
  }

  const lastStackedAt = new Date(Math.max(...target.stacks.map(s => s.producedAt.getTime())))
  const newer = target.subs.filter(s => s.capturedAt !== null && s.capturedAt.getTime() > lastStackedAt.getTime())
  const addedSec = totalSec(newer)
  if (addedSec < policy.restackSec) return null
  return {
    kind: 'restack',
    id: suggestionId('restack', target.targetId),
    targetId: target.targetId,
    targetName: target.targetName,
    addedSec,
    addedSubCount: newer.length,
    lastStackedAt
  }
}

/** Unprocessed integration first: the most photons waiting to become an image. */
export function unprocessedSec(s: StackingSuggestion): number {
  return s.kind === 'ready-to-stack' ? s.integrationSec : s.addedSec
}
