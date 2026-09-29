import { observingNightOf } from './observing-night'
import {
  DEFAULT_STACKING_POLICY,
  totalSec,
  usableSubs,
  type LightSub,
  type StackingPolicy,
  type TargetFrames
} from './stacking-readiness'

/** Integration grouped under one key: a filter, a scope or an observing night. */
export interface IntegrationBucket {
  key: string
  integrationSec: number
  subCount: number
}

/**
 * Where a target stands, worked out from its files rather than typed in by hand.
 * Ordered from least to most finished.
 */
export const PROGRESS_STATES = ['planned', 'capturing', 'enough-data', 'stacked', 'processed', 'final'] as const
export type ProgressState = (typeof PROGRESS_STATES)[number]

export interface TargetDiscovery {
  targetId: string
  targetName: string
  integrationSec: number
  subCount: number
  rejectedSubCount: number
  byFilter: IntegrationBucket[]
  byScope: IntegrationBucket[]
  byNight: IntegrationBucket[]
  lastCapturedAt: Date | null
  stackCount: number
  lastStackedAt: Date | null
  /** Observing nights with subs newer than the newest stack (every night when never stacked). */
  unstackedNights: string[]
  unstackedSec: number
  goalSec: number | null
  processedCount: number
  finalCount: number
  progress: ProgressState
}

/** Label for subs whose header left the grouping key out. */
export const UNKNOWN_KEY = 'Unknown'

function bucketBy(subs: LightSub[], keyOf: (s: LightSub) => string | null): IntegrationBucket[] {
  const buckets = new Map<string, IntegrationBucket>()
  for (const s of subs) {
    const key = keyOf(s)?.trim() || UNKNOWN_KEY
    const b = buckets.get(key) ?? { key, integrationSec: 0, subCount: 0 }
    b.integrationSec += s.exposureSec
    b.subCount += 1
    buckets.set(key, b)
  }
  return [...buckets.values()].sort((a, b) => b.integrationSec - a.integrationSec || a.key.localeCompare(b.key))
}

function latest(dates: (Date | null)[]): Date | null {
  let best: Date | null = null
  for (const d of dates) if (d && (!best || d.getTime() > best.getTime())) best = d
  return best
}

/**
 * Usable subs a stack does not yet include: all of them before the first stack, newer ones after.
 * Rejected subs never count as waiting to be stacked.
 */
export function unstackedSubs(target: TargetFrames): LightSub[] {
  const usable = usableSubs(target)
  const lastStackedAt = latest(target.stacks.map(s => s.producedAt))
  if (!lastStackedAt) return usable
  return usable.filter(s => s.capturedAt !== null && s.capturedAt.getTime() > lastStackedAt.getTime())
}

/**
 * Progress from the evidence, taking the furthest stage reached: a final image beats a processed
 * file, which beats a stack, and so on. Subs count as enough data at the ready-to-stack threshold.
 */
export function deriveProgress(target: TargetFrames, policy: StackingPolicy = DEFAULT_STACKING_POLICY): ProgressState {
  if (target.finalCount > 0) return 'final'
  if (target.processedCount > 0) return 'processed'
  if (target.stacks.length > 0) return 'stacked'
  if (target.subs.length === 0) return 'planned'
  return totalSec(usableSubs(target)) >= policy.readyToStackSec ? 'enough-data' : 'capturing'
}

/** Everything the files say about one target. Pure: no I/O, no clock. */
export function discoverTarget(target: TargetFrames, policy: StackingPolicy = DEFAULT_STACKING_POLICY): TargetDiscovery {
  const pending = unstackedSubs(target)
  const nights = new Set<string>()
  for (const s of pending) if (s.capturedAt) nights.add(observingNightOf(s.capturedAt))

  return {
    targetId: target.targetId,
    targetName: target.targetName,
    integrationSec: totalSec(target.subs),
    subCount: target.subs.length,
    rejectedSubCount: target.subs.filter(s => s.rejected).length,
    byFilter: bucketBy(target.subs, s => s.filter),
    byScope: bucketBy(target.subs, s => s.scope),
    byNight: bucketBy(target.subs, s => (s.capturedAt ? observingNightOf(s.capturedAt) : null)).sort((a, b) =>
      a.key.localeCompare(b.key)
    ),
    lastCapturedAt: latest(target.subs.map(s => s.capturedAt)),
    stackCount: target.stacks.length,
    lastStackedAt: latest(target.stacks.map(s => s.producedAt)),
    unstackedNights: [...nights].sort(),
    unstackedSec: totalSec(pending),
    goalSec: target.goalSec,
    processedCount: target.processedCount,
    finalCount: target.finalCount,
    progress: deriveProgress(target, policy)
  }
}

/** 32-bit FNV-1a, enough to notice a change; not a security hash. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * A short digest of a target's data. It changes whenever a sub, stack or output is added, removed
 * or re-read with a different filter, scope, exposure or quality verdict, which is what lets a
 * dismissed suggestion come back once there is something new.
 */
export function dataFingerprint(target: TargetFrames): string {
  const subs = target.subs
    .map(s => [s.capturedAt?.toISOString() ?? '-', s.exposureSec, s.filter ?? '', s.scope ?? '', s.rejected ? 1 : 0].join(','))
    .sort()
    .join(';')
  const stacks = target.stacks.map(s => s.producedAt.toISOString()).sort().join(';')
  return [target.subs.length, target.stacks.length, target.processedCount, target.finalCount, fnv1a(subs), fnv1a(stacks)].join('|')
}
