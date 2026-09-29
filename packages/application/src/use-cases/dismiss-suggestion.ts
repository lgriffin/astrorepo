import { assessStackingReadiness, dataFingerprint, DEFAULT_STACKING_POLICY, type StackingPolicy } from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { DismissalStore } from '../ports/dismissal-store'
import type { FrameCatalogue } from '../ports/frame-catalogue'

export interface DismissSuggestionDeps {
  frames: FrameCatalogue
  dismissals: DismissalStore
  clock: Clock
}

/** Result says whether a live suggestion with that id was found and set aside. */
export type DismissSuggestion = (suggestionId: string) => Promise<{ dismissed: boolean }>

/** Sets a suggestion aside until its target's data changes. */
export function makeDismissSuggestion(
  deps: DismissSuggestionDeps,
  policy: StackingPolicy = DEFAULT_STACKING_POLICY
): DismissSuggestion {
  return async suggestionId => {
    const targets = await deps.frames.listTargetFrames()
    for (const t of targets) {
      const s = assessStackingReadiness(t, policy)
      if (s?.id !== suggestionId) continue
      await deps.dismissals.saveDismissal({
        suggestionId,
        targetId: t.targetId,
        fingerprint: dataFingerprint(t),
        dismissedAt: deps.clock.now()
      })
      return { dismissed: true }
    }
    return { dismissed: false }
  }
}
