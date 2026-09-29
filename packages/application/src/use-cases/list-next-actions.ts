import { rankNextActions, type NextAction } from '@astro/domain'
import type { ListStackingSuggestions } from './list-stacking-suggestions'
import type { PlanForward } from './plan-forward'

export interface ListNextActionsDeps {
  listStackingSuggestions: ListStackingSuggestions
  planForward: PlanForward
}

export type ListNextActions = () => Promise<NextAction[]>

/**
 * The cockpit's ranked to-do list: tonight's captures (closing seasons first) ahead of stacking.
 * Without a site, or if planning fails, only stacking suggestions come back.
 */
export function makeListNextActions(deps: ListNextActionsDeps): ListNextActions {
  return async () => {
    // A planning failure (say, a corrupt site setting) must never hide the stacking suggestions.
    const [stacking, plan] = await Promise.all([
      deps.listStackingSuggestions(),
      deps.planForward().catch(() => ({ status: 'no-site' }) as const)
    ])
    if (plan.status !== 'ok') return rankNextActions(stacking, null, [])
    return rankNextActions(stacking, plan.tonight, plan.closing)
  }
}
