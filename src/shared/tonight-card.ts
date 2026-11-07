/**
 * Home's one Tonight card (specs/046-everyday-ux, U2): what it says about the forecast, once,
 * whether the Clear skies card has anything to add, and how a row of Home's lists opens.
 */
import type { ClearSkiesView, Recommendation, SkyInsightView } from './types'
import { targetLink } from './navigation'

/** Why there is no cloud figure for tonight, said once (EUX-005). */
export interface MissingForecast {
  /** "Forecast off", "Forecast unavailable" or "No forecast yet". */
  headline: string
  /** The reason, in a sentence. */
  reason: string
  /** Whether Settings → Weather is where it is fixed. */
  settings: boolean
}

type Insight = SkyInsightView | null

/**
 * Why tonight has no forecast, from the forecast Home reads and tonight's sky, or null when there is
 * one (or neither has answered yet). A source that could not be used is named with its problem.
 */
export function missingForecast(skies: ClearSkiesView | null, insight: Insight): MissingForecast | null {
  const cloud = insight?.status === 'ok' ? insight.cloud : null
  if (skies?.status === 'off' || cloud?.state === 'off') {
    return { headline: 'Forecast off', reason: 'Choose a forecast in Settings → Weather to see the cloud.', settings: true }
  }
  const failed = skies?.status === 'ok' ? skies.sources.filter(s => s.problem !== null) : []
  const allFailed = skies?.status === 'ok' && skies.sources.length > 0 && failed.length === skies.sources.length
  if (cloud?.state === 'unavailable' || allFailed) {
    const reason = failed.length > 0 ? failed.map(s => `${s.name} could not be used: ${s.problem}`).join(' ') : 'The forecast could not be read just now.'
    return { headline: 'Forecast unavailable', reason, settings: true }
  }
  const tonight = skies?.status === 'ok' ? skies.nights[0] ?? null : null
  if ((cloud && cloud.state === 'forecast' && cloud.cloudPct === null) || (!cloud && tonight?.verdict === 'no-forecast')) {
    const reason = cloud?.detail ?? 'The forecast does not reach tonight’s dark hours yet.'
    return { headline: 'No forecast yet', reason, settings: false }
  }
  return null
}

/**
 * Whether the Clear skies card adds anything to Tonight (EUX-005): not with the forecast off, and not
 * when no night has a forecast, since Tonight already says why. While loading or failed it shows, so
 * its own loading and retry do.
 */
export function showClearSkies(skies: ClearSkiesView | null | 'failed'): boolean {
  if (skies === null || skies === 'failed') return true
  if (skies.status === 'off') return false
  if (skies.status === 'ok') return skies.nights.some(n => n.verdict !== 'no-forecast')
  return true
}

/** The action label that only opens the row's own target. */
export const OPEN_TARGET = 'Open target'

/** How a row of Home's lists opens (EUX-006). */
export interface RowLinks {
  /** Where the row's title goes, or null when it is plain text. */
  titleTo: string | null
  /** A button for an action other than opening the target, or null. */
  button: { label: string; to: string } | null
}

/**
 * A row's title opens its target; its button is dropped when all it would do is open that target
 * too, so a list never repeats "Open target" on every row. Other actions (the stacking plan, Jobs,
 * a mosaic) keep theirs.
 */
export function rowLinks(rec: Pick<Recommendation, 'targetId' | 'actionLabel' | 'actionTo'>): RowLinks {
  const target = rec.targetId ? targetLink(rec.targetId) : null
  const to = rec.actionTo ?? target
  const onlyOpens = to === target && rec.actionLabel === OPEN_TARGET
  const button = rec.actionLabel && to && !onlyOpens ? { label: rec.actionLabel, to } : null
  return { titleTo: target, button }
}
