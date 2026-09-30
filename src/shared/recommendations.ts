import type { Recommendation } from './types'

/** Categories that make up the ranked to-do list; everything else is a check shown on its own. */
const NEXT_ACTION_CATEGORIES = new Set<Recommendation['category']>(['capture', 'stacking'])

/**
 * Splits the dashboard's recommendations into the ranked next actions (captures and stacking, in
 * the order given) and the other checks (calibration, goals, quality, workflow), so a long to-do
 * list never pushes a check out of sight.
 */
export function splitRecommendations(recommendations: Recommendation[]): { nextActions: Recommendation[]; otherChecks: Recommendation[] } {
  return {
    nextActions: recommendations.filter(r => NEXT_ACTION_CATEGORIES.has(r.category)),
    otherChecks: recommendations.filter(r => !NEXT_ACTION_CATEGORIES.has(r.category))
  }
}
