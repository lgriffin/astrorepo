import { objectNumbers, type ObjectNumbers } from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { TargetFactsSource } from '../ports/learning'

/**
 * A target in numbers (specs/042-learning, LRN-008 to LRN-010): its published distance found by
 * any of its names, its true width from its size on the sky, and when its light set out, worked
 * out each time and never stored. Null for a missing target or one with no published distance.
 */
export function makeDescribeObjectNumbers(deps: { targets: TargetFactsSource; clock: Clock }): (targetId: string) => Promise<ObjectNumbers | null> {
  return async targetId => {
    const facts = await deps.targets.facts(targetId)
    if (!facts) return null
    return objectNumbers({ names: facts.names, angularSizeArcmin: facts.angularSizeArcmin, thisYear: deps.clock.now().getUTCFullYear() })
  }
}
