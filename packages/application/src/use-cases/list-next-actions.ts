import { rankNextActions, type NextAction } from '@astro/domain'
import type { ListStackingSuggestions } from './list-stacking-suggestions'
import type { PlanForward } from './plan-forward'
import type { ListMosaicGaps } from './sky-geometry'

export interface ListNextActionsDeps {
  listStackingSuggestions: ListStackingSuggestions
  planForward: PlanForward
  /** Planned mosaic tiles with no lights yet (specs/024-sky-geometry); left out when not wired. */
  listMosaicGaps?: ListMosaicGaps
  /** Told when planning fails, so the failure is recorded even though stacking still shows. */
  onPlanError?: (error: unknown) => void
}

export type ListNextActions = () => Promise<NextAction[]>

/**
 * The cockpit's ranked to-do list: tonight's captures (closing seasons first) ahead of stacking.
 * Without a site, or if planning fails, only stacking suggestions come back.
 */
export function makeListNextActions(deps: ListNextActionsDeps): ListNextActions {
  return async () => {
    // A planning failure must never hide the stacking suggestions, but it is reported, unlike an
    // unset site, which is an expected state. Only tonight and closing seasons are needed here.
    const [stacking, plan, tiles] = await Promise.all([
      deps.listStackingSuggestions(),
      deps.planForward({ scope: 'tonight' }).catch((error: unknown) => {
        deps.onPlanError?.(error)
        return null
      }),
      deps.listMosaicGaps
        ? deps.listMosaicGaps().catch((error: unknown) => {
            deps.onPlanError?.(error)
            return []
          })
        : Promise.resolve([])
    ])
    if (!plan || plan.status !== 'ok') return rankNextActions(stacking, null, [], tiles)
    return rankNextActions(stacking, plan.tonight, plan.closing, tiles)
  }
}
