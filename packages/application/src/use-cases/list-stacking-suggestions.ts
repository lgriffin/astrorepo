import {
  assessStackingReadiness,
  dataFingerprint,
  DEFAULT_STACKING_POLICY,
  isDismissed,
  unprocessedSec,
  type StackingPolicy,
  type StackingSuggestion
} from '@astro/domain'
import type { DismissalStore } from '../ports/dismissal-store'
import type { FrameCatalogue } from '../ports/frame-catalogue'

export interface ListStackingSuggestionsDeps {
  frames: FrameCatalogue
  dismissals: DismissalStore
}

export type ListStackingSuggestions = () => Promise<StackingSuggestion[]>

/** Cockpit use case: which targets have data waiting to be stacked, most waiting first. */
export function makeListStackingSuggestions(
  deps: ListStackingSuggestionsDeps,
  policy: StackingPolicy = DEFAULT_STACKING_POLICY
): ListStackingSuggestions {
  return async () => {
    const [targets, dismissals] = await Promise.all([deps.frames.listTargetFrames(), deps.dismissals.listDismissals()])
    const dismissedById = new Map(dismissals.map(d => [d.suggestionId, d]))
    const suggestions: StackingSuggestion[] = []
    for (const t of targets) {
      const s = assessStackingReadiness(t, policy)
      if (s && !isDismissed(dismissedById.get(s.id), dataFingerprint(t))) suggestions.push(s)
    }
    return suggestions.sort(
      (a, b) => unprocessedSec(b) - unprocessedSec(a) || a.targetName.localeCompare(b.targetName)
    )
  }
}
