/** Integration forecasts (spec 039). */

// ── Integration forecasts (specs/039-integration-forecasts) ─────────────

export type ForecastKindView = 'insufficient data' | 'theoretical' | 'measured'

export interface ForecastView {
  /** "30 min", "1 h" */
  added: string
  /** "+8%" better signal to noise, or null with insufficient data. */
  gain: string | null
  /** "+5% to +10%" */
  range: string | null
  kind: ForecastKindView
  /** Its model, the frames it rests on and its assumptions, in the user's words. */
  evidence: string
}

export interface IntegrationFilterView {
  filter: string
  /** "48 frames, 6 rejected" */
  frames: string
  acquired: string
  accepted: string
  /** "13% rejected", or null with no frames. */
  rejection: string | null
  goal: string | null
  /** "About 2 h 30 min more capture (2 h to 3 h 10 min)", "Goal met", or null with no goal. */
  toGoal: string | null
  forecasts: ForecastView[]
}

export interface IntegrationView {
  /** Every filter together. */
  total: IntegrationFilterView
  /** "Equivalent to 3 h 40 min of the median frame", once enough frames are measured. */
  weighted: string | null
  filters: IntegrationFilterView[]
  /** Filters by what the next hour buys, most first. */
  best: { label: string; gain: string | null; kind: ForecastKindView }[]
  /** What the numbers rest on, from the forecast for an hour on every filter together. */
  assumptions: string[]
  /** "Model sqrt-v1, from 48 frames (30 measured)." */
  basis: string
}

export interface PanelIntegrationView {
  panelId: string
  filters: IntegrationFilterView[]
}

export interface MosaicIntegrationView {
  panels: PanelIntegrationView[]
  best: { label: string; gain: string | null; kind: ForecastKindView }[]
  assumptions: string[]
  basis: string
}
