import {
  DEFAULT_STACKING_POLICY,
  discoverTarget,
  PROGRESS_STATES,
  type ProgressState,
  type StackingPolicy,
  type TargetDiscovery
} from '@astro/domain'
import type { FrameCatalogue } from '../ports/frame-catalogue'

export interface DiscoverTargetsDeps {
  frames: FrameCatalogue
}

export interface DiscoveryOverview {
  targets: TargetDiscovery[]
  /** How many targets sit at each progress state, in pipeline order. */
  progress: { state: ProgressState; count: number }[]
}

export type DiscoverTargets = () => Promise<DiscoveryOverview>
export type DiscoverTarget = (targetId: string) => Promise<TargetDiscovery | null>

/** What the files say about every target, and how far along the pipeline each one is. */
export function makeDiscoverTargets(
  deps: DiscoverTargetsDeps,
  policy: StackingPolicy = DEFAULT_STACKING_POLICY
): DiscoverTargets {
  return async () => {
    const targets = (await deps.frames.listTargetFrames())
      .map(t => discoverTarget(t, policy))
      .sort((a, b) => a.targetName.localeCompare(b.targetName))
    const progress = PROGRESS_STATES.map(state => ({ state, count: targets.filter(t => t.progress === state).length }))
    return { targets, progress }
  }
}

/** What the files say about one target, or null when it has no data, outputs or goal. */
export function makeDiscoverTarget(
  deps: DiscoverTargetsDeps,
  policy: StackingPolicy = DEFAULT_STACKING_POLICY
): DiscoverTarget {
  return async targetId => {
    const t = (await deps.frames.listTargetFrames()).find(x => x.targetId === targetId)
    return t ? discoverTarget(t, policy) : null
  }
}
