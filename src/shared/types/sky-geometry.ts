/** Sky geometry (spec 024). */

// Sky geometry (specs/024-sky-geometry)

/** One solved or failed file on a target's page. */
export interface SolveRowView {
  path: string
  name: string
  kind: 'light' | 'master'
  night: string | null
  solved: boolean
  /** "00:42:44 +41:16:09" */
  centre: string | null
  /** '2.39"/px' */
  scale: string | null
  rotation: string | null
  /** "43′ × 76′" */
  field: string | null
  /** "ASTAP", "Siril" or "its own headers". */
  source: string
  error: string | null
}

export interface PanelView {
  id: number
  centre: string
  integration: string
  lights: number
  nights: number
  /** Other targets whose lights make up this panel. */
  otherTargets: string[]
  tile: number | null
  inMosaic: boolean
}

export interface TargetGeometryView {
  targetId: string
  /** What the solves come to, in a sentence. */
  summary: string
  /** Files still to solve (one light per folder per night, and masters). */
  unsolved: number
  solves: SolveRowView[]
  /** "May be filed under the wrong name" and why; null when the solves agree with the name. */
  misfiled: string | null
  rotation: { nights: { night: string; rotation: string }[]; note: string | null }
  panels: PanelView[]
  /** Panels of one mosaic, in a sentence; null with fewer than two. */
  mosaic: string | null
  linkedTargetIds: string[]
}

export interface SolveQueuedView {
  message: string
  queued: boolean
}

export interface MosaicTileRowView {
  tile: number
  row: number
  column: number
  /** "05:35:17" */
  ra: string
  /** "+05:23:28" */
  dec: string
  captured: string
  lights: number
  /** "6 h" still needed for the goal; null with no goal. */
  needed: string | null
}

export interface MosaicPlanView {
  status: 'ok' | 'no-target' | 'no-position' | 'no-size' | 'no-field'
  /** What is missing, when the plan cannot be drawn. */
  message: string | null
  targetId: string | null
  targetName: string | null
  /** "3 × 2 panels at 20% overlap, turned 0°, covering 2.1° × 1.6°." */
  summary: string | null
  fitsOneField: boolean
  fieldFrom: string | null
  field: { widthDeg: number; heightDeg: number } | null
  rotationDeg: number
  overlap: number
  saved: boolean
  tiles: MosaicTileRowView[]
  goalNote: string | null
  /** Null without a site. */
  nights: { summary: string; ranges: string[]; clear: number; of: number } | null
}
