import {
  assessStackingReadiness,
  DEFAULT_STACKING_POLICY,
  unprocessedSec,
  type StackingPolicy,
  type StackingSuggestion
} from '@astro/domain'
import type { FrameCatalogue } from '../ports/frame-catalogue'

export interface ListStackingSuggestionsDeps {
  frames: FrameCatalogue
}

export type ListStackingSuggestions = () => Promise<StackingSuggestion[]>

/** Cockpit use case: which targets have data waiting to be stacked, most waiting first. */
export function makeListStackingSuggestions(
  deps: ListStackingSuggestionsDeps,
  policy: StackingPolicy = DEFAULT_STACKING_POLICY
): ListStackingSuggestions {
  return async () => {
    const targets = await deps.frames.listTargetFrames()
    return targets
      .map(t => assessStackingReadiness(t, policy))
      .filter((s): s is StackingSuggestion => s !== null)
      .sort((a, b) => unprocessedSec(b) - unprocessedSec(a) || a.targetName.localeCompare(b.targetName))
  }
}
