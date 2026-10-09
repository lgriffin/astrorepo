import {
  assessStackingReadiness,
  dataFingerprint,
  DEFAULT_STACKING_POLICY,
  isArchivedNow,
  isDismissed,
  unprocessedSec,
  type StackingPolicy,
  type StackingSuggestion
} from '@astro/domain'
import type { ArchiveStore } from '../ports/archive'
import type { DismissalStore } from '../ports/dismissal-store'
import type { FrameCatalogue } from '../ports/frame-catalogue'

export interface ListStackingSuggestionsDeps {
  frames: FrameCatalogue
  dismissals: DismissalStore
  /** Archived targets are not suggested while their frames are unchanged (ARC-011). */
  archives?: Pick<ArchiveStore, 'list'>
}

export type ListStackingSuggestions = () => Promise<StackingSuggestion[]>

/** Cockpit use case: which targets have data waiting to be stacked, most waiting first. */
export function makeListStackingSuggestions(
  deps: ListStackingSuggestionsDeps,
  policy: StackingPolicy = DEFAULT_STACKING_POLICY
): ListStackingSuggestions {
  return async () => {
    const [targets, dismissals, archives] = await Promise.all([
      deps.frames.listTargetFrames(),
      deps.dismissals.listDismissals(),
      deps.archives?.list() ?? Promise.resolve([])
    ])
    const dismissedById = new Map(dismissals.map(d => [d.suggestionId, d]))
    const archivedById = new Map(archives.map(a => [a.targetId, a]))
    const suggestions: StackingSuggestion[] = []
    for (const t of targets) {
      const s = assessStackingReadiness(t, policy)
      const fingerprint = dataFingerprint(t)
      if (s && !isDismissed(dismissedById.get(s.id), fingerprint) && !isArchivedNow(archivedById.get(t.targetId), fingerprint)) suggestions.push(s)
    }
    return suggestions.sort(
      (a, b) => unprocessedSec(b) - unprocessedSec(a) || a.targetName.localeCompare(b.targetName)
    )
  }
}
