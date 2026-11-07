/** Mosaic workspaces (spec 037). */

// ── Mosaic workspace (spec 037) ───────────────────────────────────────────

/** A workspace grid as the editor holds it and sends it back; snake case, as IPC arguments are. */
export interface WorkspaceGridInput {
  ra_deg: number
  dec_deg: number
  position_angle_deg: number
  rows: number
  columns: number
  overlap_x: number
  overlap_y: number
  field_width_deg: number
  field_height_deg: number
  field_source: 'equipment' | 'manual' | 'solve' | 'target-plan'
  field_label?: string | null
}

export interface WorkspacePanelView {
  id: string
  row: number
  column: number
  ra: string
  dec: string
  raDeg: number
  decDeg: number
  /** "+12.3°" */
  positionAngle: string
  /** The footprint on the drawing (x west, y north, degrees about the grid's centre). */
  outline: { x: number; y: number }[]
  /** "Clear on 12 of the next 30 nights, from 2026-10-26"; null without a site. */
  outlook: string | null
  clearNights: number | null
}

export interface WorkspaceDrawingView {
  ok: boolean
  /** What is wrong with the grid, when it cannot be drawn. */
  problems: string[]
  /** The grid as laid out (after a drag, its new centre). */
  grid: WorkspaceGridInput
  centre: string
  /** "3 × 4 panels, 15% overlap across and down, up axis at 0° east of north, covering 2.1° × 4.3°." */
  summary: string | null
  panels: WorkspacePanelView[]
  /** Half the drawing's width and height, in degrees, with a margin. */
  bounds: { x: number; y: number } | null
}

export interface WorkspaceSummaryView {
  id: string
  name: string
  targetId: string | null
  archived: boolean
  createdAt: string
  revision: number
  /** "3 × 4 panels" */
  size: string
}

export interface WorkspaceView {
  id: string
  name: string
  targetId: string | null
  archived: boolean
  revision: number
  latestRevision: number
  savedAt: string
  note: string | null
  /** "Field from Seestar S50 (equipment)" */
  fieldFrom: string
  drawing: WorkspaceDrawingView
  revisions: { revision: number; savedAt: string; note: string | null; size: string }[]
  /** Null with a site set; else says to set one for panel visibility. */
  outlookNote: string | null
}

export interface WorkspaceSaveView {
  ok: boolean
  /** The workspace to open (a new one after create). */
  workspaceId: string | null
  revision: number | null
  message: string
  problems: string[]
}

/** A capture placed on a mosaic revision (specs/037-mosaic-workspace, X2). */
export interface WorkspaceCaptureView {
  id: string
  /** "48 lights, 2026-10-01, M31/panel2" or "master stack.fit". */
  label: string
  kind: 'lights' | 'master'
  targetId: string
  night: string | null
  files: number
  /** "4 h 10 min" of exposure, or null when no file says. */
  exposure: string | null
  filters: string[]
  /** For its thumbnail (fits:get-thumbnail). */
  fileId: string | null
  /** Its solved footprint on the drawing, in the image's own corner order: top left, top right, bottom right, bottom left. */
  outline: { x: number; y: number }[]
  /** Every panel it meets: how much of the capture falls there and how much of the panel it covers. */
  panels: { panelId: string; share: string; coverage: string }[]
  primary: string | null
  /** The panel it counts toward, computed or the user's. */
  panelId: string | null
  source: 'computed' | 'user-override'
  state: 'accepted' | 'needs-review' | 'excluded' | 'conflict'
  note: string | null
  /** Why the user put it there or left it out. */
  reason: string | null
}

export interface WorkspaceUnsolvedView {
  id: string
  label: string
  targetId: string
  /** Why the last solve failed; null when it was never tried. */
  solveError: string | null
}

export interface WorkspaceMissingView {
  captureId: string
  label: string
  /** "Put on R1C2" or "Left out". */
  said: string
  reason: string | null
  /** Where it last pointed, or null. */
  lastCentre: string | null
}

export interface WorkspaceCapturesView {
  revision: number
  latestRevision: number
  placed: WorkspaceCaptureView[]
  outside: WorkspaceCaptureView[]
  unsolved: WorkspaceUnsolvedView[]
  missing: WorkspaceMissingView[]
  /** The targets whose unsolved files are listed, to plate solve. */
  targetIds: string[]
  /** "12 captures on 6 panels; 2 to review, 1 conflict." */
  summary: string
}

/** A capture whose panel would change if the edited grid were saved. */
export interface WorkspaceChangeView {
  captureId: string
  label: string
  from: string | null
  to: string | null
  /** The user put it on a panel; that choice stays and is shown for review. */
  overridden: boolean
  /** The panel they put it on. */
  overridePanel: string | null
}

/** One patch of sky on a mosaic's heat map (X3): its middle on the drawing and the exposure over it. */
export interface WorkspaceCoverageCellView {
  x: number
  y: number
  seconds: number
  /** Per filter, in the order of the coverage view's `filters`. */
  byFilter: number[]
  captures: number
}

export interface WorkspaceFilterProgressView {
  filter: string
  /** "3 h 20 min" */
  have: string
  goal: string | null
  need: string | null
  /** Its goal met; null with no goal. */
  met: boolean | null
}

export interface WorkspacePanelCoverageView {
  panelId: string
  state: 'not started' | 'partly covered' | 'covered'
  /** "87%" */
  coverage: string
  fraction: number
  covered: boolean
  /** "1 h to 4 h 30 min" over the panel; "none" when nothing covers it. */
  depth: string
  gaps: { where: string; share: string; centre: string }[]
  filters: WorkspaceFilterProgressView[]
  goalsMet: boolean | null
  captures: number
}

export interface WorkspaceCountedCaptureView {
  id: string
  label: string
  kind: 'lights' | 'master'
  panelId: string | null
  /** "Ha 2 h, OIII 1 h 30 min", or null when it adds none. */
  exposure: string | null
  counted: number
  note: string | null
}

/** How a mosaic revision is covered (specs/037-mosaic-workspace, X3). */
export interface WorkspaceCoverageView {
  revision: number
  /** A heat map cell's side on the drawing, in degrees. */
  cellDeg: number
  filters: string[]
  cells: WorkspaceCoverageCellView[]
  /** The deepest cell's exposure, all filters, to scale the heat map. */
  maxSeconds: number
  panels: WorkspacePanelCoverageView[]
  /** Usable exposure per filter over the mosaic, each frame once. */
  totals: { filter: string; exposure: string }[]
  captures: WorkspaceCountedCaptureView[]
  /** The panels to shoot next, most needed first. */
  next: { panelId: string; aim: string; reason: string }[]
  /** "3 of 4 panels covered; 1 meets its goals." */
  summary: string
  /** Captures not solved yet, which add no coverage. */
  unsolved: number
}
