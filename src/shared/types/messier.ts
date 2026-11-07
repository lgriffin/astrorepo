/** The Messier mosaic (spec 032). */

// Messier mosaic (specs/032-messier-mosaic)

export type MessierStateView = 'imaged' | 'stacked' | 'captured' | 'gap'

export interface MessierOutlookView {
  kind: 'tonight' | 'moon' | 'later' | 'never'
  /** A few words for the tile: "Up tonight · 5 h 10 m". */
  short: string
  /** A sentence or two for the tile's details. */
  long: string
}

export interface MessierMonthView {
  /** YYYY-MM */
  month: string
  /** "Mar" */
  label: string
  hoursPerNight: number
  inSeason: boolean
}

export interface MessierTileView {
  number: number
  designation: string
  name: string | null
  targetId: string
  /** "Globular cluster" */
  objectType: string
  constellation: string | null
  magnitude: number | null
  state: MessierStateView
  /** "Imaged", "Stacked, not finished", "Captured, not stacked" or "Not captured yet". */
  stateLabel: string
  /** Usable light integration so far, or null when there is none. */
  integration: string | null
  /** The image the tile shows first, by file name. */
  picture: { name: string; kind: 'finished' | 'master' } | null
  outlook: MessierOutlookView | null
  months: MessierMonthView[]
  /** The filters the tile shows under (MES-006). */
  shows: MessierFilterView[]
}

export type MessierFilterView = 'all' | 'missing' | 'gaps' | 'tonight'

export interface MessierMosaicView {
  night: string | null
  siteSet: boolean
  catalogued: number
  summary: { total: number; imaged: number; stacked: number; captured: number; gaps: number; missingUpTonight: number }
  tiles: MessierTileView[]
}

/** A tile's picture as a data URL, why it could not be drawn, or null when the object has no image. */
export type MessierPictureView =
  | { ok: true; src: string; width: number; height: number; name: string; kind: 'finished' | 'master' }
  | { ok: false; error: string }
  | { refused: string }
  | null
