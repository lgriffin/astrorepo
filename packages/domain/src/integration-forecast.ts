import { NO_FILTER, filterKey } from './mosaic-coverage'

/**
 * Integration forecasts (specs/039-integration-forecasts): what is acquired and what is accepted,
 * kept apart, and what another stretch of capture is expected to buy under a stated model, with
 * its assumptions, its inputs and a range. Pure: no I/O, no clock.
 */

/** The model every forecast names, so a later model's numbers are never mistaken for these. */
export const FORECAST_MODEL = 'sqrt-v1'
/** Fewer frames than this and a forecast is theoretical, whatever was measured. */
export const MIN_SAMPLE = 10
/** The z of the two-sided 90% interval used for the acceptance range. */
const Z90 = 1.645

/** One light as forecasts see it. */
export interface ForecastFrame {
  seconds: number | null
  filter: string | null
  /** Kept by grading (or not graded): it counts toward accepted exposure. */
  accepted: boolean
  /** Measured star SNR, null when not measured. */
  snr: number | null
}

/** What a target, filter or panel has, acquired and accepted counted independently (AI-001). */
export interface IntegrationSummary {
  /** The filter, or null for every filter together. */
  filter: string | null
  frames: number
  acceptedFrames: number
  acquiredSec: number
  acceptedSec: number
  /** Accepted frames over all frames; null with no frames. */
  acceptance: number | null
  /** Accepted frames with a measured SNR. */
  measured: number
  /**
   * Accepted exposure weighted by each frame's SNR² against the median accepted frame's: the
   * explicitly modelled equivalent, not a blind sum. Null until at least MIN_SAMPLE accepted frames
   * are measured.
   */
  weightedSec: number | null
  /** Each measured accepted frame's SNR² over the median's, for the range of a new frame's worth. */
  weights: number[]
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Sums one group of frames; frames without an exposure count as frames but add no time. */
export function summarise(frames: ForecastFrame[], filter: string | null = null): IntegrationSummary {
  const seconds = (f: ForecastFrame) => (f.seconds !== null && f.seconds > 0 ? f.seconds : 0)
  const accepted = frames.filter(f => f.accepted)
  const measured = accepted.filter(f => f.snr !== null && f.snr > 0)
  let weights: number[] = []
  let weightedSec: number | null = null
  if (measured.length >= MIN_SAMPLE) {
    const reference = median(measured.map(f => (f.snr as number) ** 2))
    weights = measured.map(f => (f.snr as number) ** 2 / reference)
    // Unmeasured accepted frames are taken at the median's worth, weight 1.
    weightedSec = accepted.reduce((n, f) => n + seconds(f) * (f.snr !== null && f.snr > 0 ? (f.snr as number) ** 2 / reference : 1), 0)
  }
  return {
    filter,
    frames: frames.length,
    acceptedFrames: accepted.length,
    acquiredSec: frames.reduce((n, f) => n + seconds(f), 0),
    acceptedSec: accepted.reduce((n, f) => n + seconds(f), 0),
    acceptance: frames.length > 0 ? accepted.length / frames.length : null,
    measured: measured.length,
    weightedSec,
    weights
  }
}

/** Every filter together and each filter on its own, filters named as the frames name them. */
export function summariseByFilter(frames: ForecastFrame[]): { all: IntegrationSummary; byFilter: IntegrationSummary[] } {
  const groups = new Map<string, { name: string; frames: ForecastFrame[] }>()
  for (const f of frames) {
    const name = f.filter?.trim() || NO_FILTER
    const key = filterKey(name)
    const group = groups.get(key) ?? { name, frames: [] }
    group.frames.push(f)
    groups.set(key, group)
  }
  const byFilter = [...groups.values()].map(g => summarise(g.frames, g.name)).sort((a, b) => (a.filter as string).localeCompare(b.filter as string))
  return { all: summarise(frames), byFilter }
}

/** The Wilson interval of a proportion at 90%, so a small sample gives a wide range. */
export function acceptanceRange(accepted: number, frames: number): { low: number; high: number } {
  if (frames === 0) return { low: 0, high: 1 }
  const p = accepted / frames
  const z2 = Z90 * Z90
  const centre = (p + z2 / (2 * frames)) / (1 + z2 / frames)
  const half = (Z90 * Math.sqrt((p * (1 - p)) / frames + z2 / (4 * frames * frames))) / (1 + z2 / frames)
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) }
}

const quantile = (values: number[], q: number) => {
  const s = [...values].sort((a, b) => a - b)
  const at = (s.length - 1) * q
  const lo = Math.floor(at)
  return s[lo] + (s[Math.ceil(at)] - s[lo]) * (at - lo)
}

export type ForecastKind = 'insufficient data' | 'theoretical' | 'measured'

/** What capturing `addedSec` more is expected to buy (AI-002), or why it cannot be said (AI-003). */
export interface GainForecast {
  addedSec: number
  kind: ForecastKind
  /** Expected accepted exposure from the added capture time. */
  expectedAcceptedSec: number | null
  /** Signal to noise after over before, such as 1.08 for 8% better; null with insufficient data. */
  snrGain: number | null
  /** The range of snrGain from the acceptance interval and, when measured, the spread of frame quality. */
  range: { low: number; high: number } | null
  /** In the user's words, everything the number rests on. */
  assumptions: string[]
  /** The measurements it was worked out from. */
  inputs: { frames: number; acceptedFrames: number; acquiredSec: number; acceptedSec: number; measured: number; weightedSec: number | null }
  model: string
}

const gainOf = (existing: number, added: number) => Math.sqrt((existing + added) / existing)

/**
 * The square-root relation for comparable background-limited subs: signal to noise grows with the
 * square root of accepted exposure. New capture is expected to be accepted at the rate so far, and,
 * once enough frames are measured, to be worth what the measured frames are worth.
 */
export function forecastGain(summary: IntegrationSummary, addedSec: number): GainForecast {
  const inputs = {
    frames: summary.frames,
    acceptedFrames: summary.acceptedFrames,
    acquiredSec: summary.acquiredSec,
    acceptedSec: summary.acceptedSec,
    measured: summary.measured,
    weightedSec: summary.weightedSec
  }
  const base = { addedSec, inputs, model: FORECAST_MODEL }
  // Accepted time means accepted frames, so the acceptance is known and above zero past here.
  if (summary.acceptedSec <= 0) {
    return {
      ...base,
      kind: 'insufficient data',
      expectedAcceptedSec: null,
      snrGain: null,
      range: null,
      assumptions: [summary.frames === 0 ? 'Nothing captured yet, so there is nothing to improve on.' : 'Nothing accepted yet, so there is nothing to improve on.']
    }
  }
  const acceptance = summary.acceptance as number
  const span = acceptanceRange(summary.acceptedFrames, summary.frames)
  // Weighted only once MIN_SAMPLE kept frames are measured, so there are at least that many frames.
  const measured = summary.weightedSec !== null
  const existing = measured ? (summary.weightedSec as number) : summary.acceptedSec
  // A new frame is worth the median's (1) at the middle, and the spread of measured frames at the ends.
  const worth = measured ? { low: quantile(summary.weights, 0.1), high: quantile(summary.weights, 0.9) } : { low: 1, high: 1 }
  const expected = addedSec * acceptance
  const assumptions = [
    'Signal to noise grows with the square root of accepted exposure: subs are comparable and limited by sky background.',
    `New capture is accepted at the rate so far: ${Math.round(acceptance * 100)}% of ${summary.frames} ${summary.frames === 1 ? 'frame' : 'frames'}.`
  ]
  if (measured) assumptions.push(`New frames are worth what the ${summary.measured} measured frames are, by star SNR²; the range spans their 10th to 90th percentile.`)
  else if (summary.frames < MIN_SAMPLE) assumptions.push(`Only ${summary.frames} ${summary.frames === 1 ? 'frame' : 'frames'} so far, under ${MIN_SAMPLE}: treat this as a rough guide.`)
  else assumptions.push(`Frames are not measured yet (${summary.measured} of ${summary.acceptedFrames}), so every frame counts the same.`)
  assumptions.push('Same scope, camera, filter and sky as before; seeing, moon and season are not modelled.')
  return {
    ...base,
    kind: measured ? 'measured' : 'theoretical',
    expectedAcceptedSec: expected,
    snrGain: gainOf(existing, expected),
    range: { low: gainOf(existing, addedSec * span.low * worth.low), high: gainOf(existing, addedSec * span.high * worth.high) },
    assumptions
  }
}

/** Capture time still needed to reach a goal of accepted exposure at the rate so far, with its range. */
export function timeToGoal(summary: IntegrationSummary, goalSec: number): { needSec: number; captureSec: number | null; range: { low: number; high: number } | null } {
  const needSec = Math.max(0, goalSec - summary.acceptedSec)
  if (needSec === 0) return { needSec, captureSec: 0, range: { low: 0, high: 0 } }
  if (summary.acceptance === null || summary.acceptance === 0) return { needSec, captureSec: null, range: null }
  const span = acceptanceRange(summary.acceptedFrames, summary.frames)
  // A low end of zero acceptance divides to Infinity: more than the data can say.
  return { needSec, captureSec: needSec / summary.acceptance, range: { low: needSec / span.high, high: needSec / span.low } }
}

/** A target, filter or panel competing for the next hour. */
export interface ExposureCandidate {
  id: string
  label: string
  summary: IntegrationSummary
}

export interface RankedExposure {
  id: string
  label: string
  /** What an hour of capture buys. */
  forecast: GainForecast
}

/** An hour of capture, the unit candidates are compared by. */
export const NEXT_HOUR_SEC = 3600

/**
 * The candidates by expected improvement from the next hour of capture, largest first, using each
 * one's acceptance and what it already has (RankNextExposureActions). Ones with nothing accepted
 * yet have no number and follow, by name.
 */
export function rankExposure(candidates: ExposureCandidate[]): RankedExposure[] {
  // Any gain is above 1, so 0 puts those with no number last.
  const score = (r: RankedExposure) => (r.forecast.snrGain === null ? 0 : r.forecast.snrGain)
  return candidates
    .map(c => ({ id: c.id, label: c.label, forecast: forecastGain(c.summary, NEXT_HOUR_SEC) }))
    .sort((a, b) => score(b) - score(a) || a.label.localeCompare(b.label))
}

/** "+8%" from a gain of 1.08, "+0.4%" under 1%. */
export function gainPercent(gain: number): string {
  const pct = (gain - 1) * 100
  return `+${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`
}
