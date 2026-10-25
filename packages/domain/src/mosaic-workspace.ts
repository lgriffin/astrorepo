/**
 * The mosaic workspace (specs/037-mosaic-workspace): a mosaic drawn on the sky as a grid of named
 * panels, each with an ICRS centre, its own position angle and the polygon it covers. Slice 1 is
 * the geometry: laying out a grid, checking it, reading typed coordinates and exporting the
 * panels. Pure; storing revisions is an adapter's job.
 *
 * Conventions, stated once:
 * - Coordinates are ICRS (J2000) right ascension and declination in degrees, RA in [0, 360).
 * - A position angle is that of the panel's up axis, east of north, in (-180, 180]. Solvers report
 *   CROTA2, which is the same turn the other way: `rotationDeg` of a SolvedField is minus the
 *   position angle of its up axis.
 * - Panels are numbered R<row>C<column> from the top left of the grid as seen with its up axis up
 *   and east on the left.
 * - Each panel's rectangle is drawn on its own tangent plane, at its own position angle, so it is
 *   the field the camera covers when pointed at the panel's centre. Near the pole that angle
 *   differs from the grid's, and the export says so per panel.
 */

import { deprojectPosition, formatDecDms, formatRaHms, gridOffset, normaliseAngle, panelAxes, projectPosition, type SolvedField } from './sky-geometry'

const RAD = Math.PI / 180

export interface SkyPoint {
  raDeg: number
  decDeg: number
}

/** A region of the sky bounded by great circles between its vertices, in order. */
export interface SkyPolygon {
  frame: 'ICRS'
  vertices: SkyPoint[]
}

/** Where a grid's field of view came from, so the plan can say. */
export type FieldSource = 'equipment' | 'manual' | 'solve' | 'target-plan'

export interface GridField {
  widthDeg: number
  heightDeg: number
  source: FieldSource
  /** What the source was, such as the scope and camera, or the solved file. */
  label: string | null
}

export interface GridDefinition {
  centre: SkyPoint
  /** Of the grid's up axis, east of north. */
  positionAngleDeg: number
  rows: number
  columns: number
  /** Fraction of a panel's width shared with the next column, and of its height with the next row. */
  overlapX: number
  overlapY: number
  field: GridField
}

export interface PlannedPanel {
  /** R1C1, R1C2, ... stable while the grid keeps its rows and columns. */
  id: string
  row: number
  column: number
  centre: SkyPoint
  /** This panel's own up axis, east of north: what the camera is turned to when pointed at it. */
  positionAngleDeg: number
  /** Top left, top right, bottom right, bottom left. */
  footprint: SkyPolygon
}

export const GRID_LIMITS = {
  maxRows: 12,
  maxColumns: 12,
  maxOverlap: 0.6,
  maxFieldDeg: 30,
  /** The grid's width or height; past this a single tangent plane no longer draws it faithfully. */
  maxExtentDeg: 60
} as const

/** The overlap a new grid starts with in both directions (the proposal's suggestion). */
export const DEFAULT_GRID_OVERLAP = 0.15

export const panelId = (row: number, column: number): string => `R${row}C${column}`

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places
const normaliseRa = (ra: number) => {
  const r = ((ra % 360) + 360) % 360
  return r >= 360 ? 0 : r
}

/** What the grid covers along its own axes, in degrees. */
export function gridExtent(def: Pick<GridDefinition, 'rows' | 'columns' | 'overlapX' | 'overlapY' | 'field'>): { widthDeg: number; heightDeg: number } {
  const { widthDeg, heightDeg } = def.field
  return {
    widthDeg: widthDeg + (def.columns - 1) * widthDeg * (1 - def.overlapX),
    heightDeg: heightDeg + (def.rows - 1) * heightDeg * (1 - def.overlapY)
  }
}

/** Why a grid cannot be laid out, in sentences; empty when it can. */
export function gridProblems(def: GridDefinition): string[] {
  const problems: string[] = []
  const whole = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max
  if (!Number.isFinite(def.centre.raDeg)) problems.push('The centre needs a right ascension.')
  if (!Number.isFinite(def.centre.decDeg) || Math.abs(def.centre.decDeg) > 90) problems.push('The centre declination must be between -90° and +90°.')
  if (!Number.isFinite(def.positionAngleDeg)) problems.push('The position angle must be a number of degrees.')
  if (!whole(def.rows, GRID_LIMITS.maxRows)) problems.push(`Rows must be a whole number from 1 to ${GRID_LIMITS.maxRows}.`)
  if (!whole(def.columns, GRID_LIMITS.maxColumns)) problems.push(`Columns must be a whole number from 1 to ${GRID_LIMITS.maxColumns}.`)
  for (const [name, value] of [['across', def.overlapX], ['down', def.overlapY]] as const) {
    if (!(value >= 0 && value <= GRID_LIMITS.maxOverlap)) problems.push(`The overlap ${name} must be from 0% to ${GRID_LIMITS.maxOverlap * 100}%.`)
  }
  const { widthDeg, heightDeg } = def.field
  if (!(widthDeg > 0 && widthDeg <= GRID_LIMITS.maxFieldDeg && heightDeg > 0 && heightDeg <= GRID_LIMITS.maxFieldDeg)) {
    problems.push(`Each panel's field must be more than 0° and at most ${GRID_LIMITS.maxFieldDeg}° on a side.`)
  }
  if (problems.length === 0) {
    const extent = gridExtent(def)
    if (Math.max(extent.widthDeg, extent.heightDeg) > GRID_LIMITS.maxExtentDeg) {
      problems.push(`The grid would cover ${round(extent.widthDeg, 1)}° by ${round(extent.heightDeg, 1)}°; keep it within ${GRID_LIMITS.maxExtentDeg}° on a side.`)
    }
  }
  return problems
}

/** The position angle, east of north, of the direction from `from` toward `to`. */
export function positionAngle(from: SkyPoint, to: SkyPoint): number {
  const [d1, d2, dra] = [from.decDeg * RAD, to.decDeg * RAD, (to.raDeg - from.raDeg) * RAD]
  return Math.atan2(Math.sin(dra) * Math.cos(d2), Math.cos(d1) * Math.sin(d2) - Math.sin(d1) * Math.cos(d2) * Math.cos(dra)) / RAD
}

/** A rectangle of the given size centred on a point, turned to a position angle, on that point's own tangent plane. */
export function rectangleOnSky(centre: SkyPoint, widthDeg: number, heightDeg: number, positionAngleDeg: number): SkyPolygon {
  const { up, right } = panelAxes(positionAngleDeg)
  const corner = (r: number, u: number) => {
    const at = deprojectPosition(centre, r * right.xi + u * up.xi, r * right.eta + u * up.eta)
    return { raDeg: round(at.raDeg, 6) % 360, decDeg: round(at.decDeg, 6) }
  }
  const [w, h] = [widthDeg / 2, heightDeg / 2]
  return { frame: 'ICRS', vertices: [corner(-w, h), corner(w, h), corner(w, -h), corner(-w, -h)] }
}

/**
 * The panels of a grid. Centres are spaced on the grid's tangent plane by one field less the
 * overlap; each panel's position angle is the grid's up axis carried to its centre, and its
 * rectangle is drawn there. The grid must have no problems (see gridProblems).
 */
export function layoutGrid(def: GridDefinition): PlannedPanel[] {
  const centre = { raDeg: normaliseRa(def.centre.raDeg), decDeg: def.centre.decDeg }
  const pa = normaliseAngle(def.positionAngleDeg)
  const { widthDeg, heightDeg } = def.field
  const stepX = widthDeg * (1 - def.overlapX)
  const stepY = heightDeg * (1 - def.overlapY)
  const { up } = panelAxes(pa)
  // A small step up the grid's own axis, to find where up points at each panel's centre.
  const nudge = Math.min(widthDeg, heightDeg) / 100
  const panels: PlannedPanel[] = []
  for (let r = 0; r < def.rows; r++) {
    for (let c = 0; c < def.columns; c++) {
      const at = gridOffset(r, c, def.rows, def.columns, stepX, stepY, pa)
      const here = deprojectPosition(centre, at.xi, at.eta)
      const above = deprojectPosition(centre, at.xi + nudge * up.xi, at.eta + nudge * up.eta)
      const localPa = Math.abs(here.decDeg) > 90 - 1e-9 ? pa : normaliseAngle(positionAngle(here, above))
      panels.push({
        id: panelId(r + 1, c + 1),
        row: r + 1,
        column: c + 1,
        centre: { raDeg: round(here.raDeg, 6) % 360, decDeg: round(here.decDeg, 6) },
        positionAngleDeg: normaliseAngle(round(localPa, 2)),
        footprint: rectangleOnSky(here, widthDeg, heightDeg, localPa)
      })
    }
  }
  return panels
}

/** Whether two grids lay out the same panels: a saved plan is only revised when this is false. */
export function sameGeometry(a: GridDefinition, b: GridDefinition): boolean {
  const near = (x: number, y: number, eps: number) => Math.abs(x - y) <= eps
  return (
    a.rows === b.rows &&
    a.columns === b.columns &&
    near(normaliseRa(a.centre.raDeg), normaliseRa(b.centre.raDeg), 1e-6) &&
    near(a.centre.decDeg, b.centre.decDeg, 1e-6) &&
    near(normaliseAngle(a.positionAngleDeg - b.positionAngleDeg), 0, 1e-6) &&
    near(a.overlapX, b.overlapX, 1e-9) &&
    near(a.overlapY, b.overlapY, 1e-9) &&
    near(a.field.widthDeg, b.field.widthDeg, 1e-9) &&
    near(a.field.heightDeg, b.field.heightDeg, 1e-9)
  )
}

/** The grid moved along its own axes: `rightDeg` toward its right edge, `upDeg` toward its top. */
export function shiftGrid(def: GridDefinition, rightDeg: number, upDeg: number): GridDefinition {
  const { up, right } = panelAxes(def.positionAngleDeg)
  const at = deprojectPosition({ raDeg: normaliseRa(def.centre.raDeg), decDeg: def.centre.decDeg }, rightDeg * right.xi + upDeg * up.xi, rightDeg * right.eta + upDeg * up.eta)
  return { ...def, centre: { raDeg: round(at.raDeg, 6) % 360, decDeg: round(at.decDeg, 6) } }
}

/** The grid dragged on a drawing (see toDrawing): its centre moves `xDeg` to the west and `yDeg` to the north on its tangent plane. */
export function dragGrid(def: GridDefinition, xDeg: number, yDeg: number): GridDefinition {
  const at = deprojectPosition({ raDeg: normaliseRa(def.centre.raDeg), decDeg: def.centre.decDeg }, -xDeg, yDeg)
  return { ...def, centre: { raDeg: round(at.raDeg, 6) % 360, decDeg: round(at.decDeg, 6) } }
}

// ── Drawing ─────────────────────────────────────────────────────────────

/**
 * Where a position falls on a drawing of the sky about a centre, in degrees: x grows to the west
 * (east on the left, as the sky is seen) and y to the north. Null on the far side of the sky.
 */
export function toDrawing(centre: SkyPoint, at: SkyPoint): { x: number; y: number } | null {
  const p = projectPosition(centre, at)
  return p ? { x: round(-p.xi, 6), y: round(p.eta, 6) } : null
}

// ── Typed coordinates ───────────────────────────────────────────────────

/** Three sexagesimal parts with a sign, or null when they are not three numbers in range. */
function sexagesimalParts(text: string, firstMax: number): { sign: number; value: number } | null {
  const parts = text.trim().replace(/^[+-]/, '').split(/[\s:hdms°'′"″]+/i).filter(p => p !== '')
  if (parts.length < 2 || parts.length > 3 || !parts.every(p => /^\d+(?:\.\d+)?$/.test(p))) return null
  const [a, b, c = 0] = parts.map(Number)
  if (a > firstMax || b >= 60 || c >= 60) return null
  if (!Number.isInteger(a) || (parts.length === 3 && !Number.isInteger(b))) return null
  return { sign: text.trim().startsWith('-') ? -1 : 1, value: a + b / 60 + c / 3600 }
}

/**
 * Right ascension typed as hours ("05h35m17.3s", "05:35:17.3", "05 35 17", "5.588h") or as
 * decimal degrees ("83.82", "83.82°"). Degrees in [0, 360), or null when it cannot be read.
 */
export function parseRa(text: string): number | null {
  const t = text.trim()
  if (t === '' || t.startsWith('-')) return null
  if (/^\d+(?:\.\d+)?\s*h$/i.test(t)) {
    const hours = Number(t.replace(/h$/i, ''))
    return hours < 24 ? round(hours * 15, 9) : null
  }
  if (/^\d+(?:\.\d+)?\s*(?:°|d|deg)?$/i.test(t)) {
    const deg = Number(t.replace(/\s*(?:°|d|deg)$/i, ''))
    return deg < 360 ? deg : null
  }
  const hms = sexagesimalParts(t, 23)
  return hms ? round(hms.value * 15, 9) : null
}

/** Declination typed as "+41:16:09", "-05°23'28\"", "41 16 9" or decimal degrees ("-5.39"). Null when out of range. */
export function parseDec(text: string): number | null {
  const t = text.trim()
  if (/^[+-]?\d+(?:\.\d+)?\s*(?:°|d|deg)?$/i.test(t)) {
    const deg = Number(t.replace(/\s*(?:°|d|deg)$/i, ''))
    return Math.abs(deg) <= 90 ? deg + 0 : null
  }
  const dms = sexagesimalParts(t, 90)
  if (!dms) return null
  const deg = dms.sign * dms.value
  return Math.abs(deg) <= 90 ? round(deg, 9) + 0 : null
}

// ── From what is already known ──────────────────────────────────────────

/** A grid's centre, turn and field taken from a solved file: one panel over exactly what it shows. */
export function gridFromSolve(field: SolvedField, label: string): Pick<GridDefinition, 'centre' | 'positionAngleDeg' | 'field'> {
  return {
    centre: { raDeg: field.raDeg, decDeg: field.decDeg },
    // The solver's rotation is CROTA2: the up axis's position angle the other way round.
    positionAngleDeg: normaliseAngle(-field.rotationDeg),
    field: { widthDeg: round((field.widthPx * field.scaleArcsec) / 3600, 6), heightDeg: round((field.heightPx * field.scaleArcsec) / 3600, 6), source: 'solve', label }
  }
}

// ── Export ──────────────────────────────────────────────────────────────

export interface GridExportInput {
  name: string
  revision: number
  grid: GridDefinition
  panels: PlannedPanel[]
}

export const GRID_CSV_COLUMNS = [
  'plan', 'revision', 'frame', 'panel', 'row', 'column', 'ra', 'dec', 'ra_deg', 'dec_deg',
  'position_angle_deg', 'rotation_deg', 'width_deg', 'height_deg',
  'corner1_ra_deg', 'corner1_dec_deg', 'corner2_ra_deg', 'corner2_dec_deg', 'corner3_ra_deg', 'corner3_dec_deg', 'corner4_ra_deg', 'corner4_dec_deg'
] as const

const csvCell = (text: string) => (/[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)

/**
 * The panels as CSV, one row each: the plan and revision, the panel's ICRS centre as hh:mm:ss and
 * ±dd:mm:ss and in degrees, its position angle and the matching CROTA2-style rotation, the field
 * and the four corners from the top left.
 */
export function gridCsv(input: GridExportInput): string {
  const rows: string[][] = [[...GRID_CSV_COLUMNS]]
  for (const p of input.panels) {
    rows.push([
      csvCell(input.name),
      String(input.revision),
      'ICRS',
      p.id,
      String(p.row),
      String(p.column),
      formatRaHms(p.centre.raDeg),
      formatDecDms(p.centre.decDeg),
      p.centre.raDeg.toFixed(6),
      p.centre.decDeg.toFixed(6),
      p.positionAngleDeg.toFixed(2),
      (normaliseAngle(-p.positionAngleDeg) + 0).toFixed(2),
      input.grid.field.widthDeg.toFixed(4),
      input.grid.field.heightDeg.toFixed(4),
      ...p.footprint.vertices.flatMap(v => [v.raDeg.toFixed(6), v.decDeg.toFixed(6)])
    ])
  }
  return `${rows.map(r => r.join(',')).join('\n')}\n`
}

/** The plan as JSON a capture tool or script can read: the grid as defined and every panel. */
export function gridJson(input: GridExportInput): string {
  return `${JSON.stringify(
    {
      plan: input.name,
      revision: input.revision,
      frame: 'ICRS',
      units: { angles: 'degrees', positionAngle: "the panel's up axis, east of north", rotation: 'CROTA2, as plate solvers report it' },
      grid: {
        centre: input.grid.centre,
        positionAngleDeg: input.grid.positionAngleDeg,
        rows: input.grid.rows,
        columns: input.grid.columns,
        overlapX: input.grid.overlapX,
        overlapY: input.grid.overlapY,
        field: input.grid.field
      },
      panels: input.panels.map(p => ({
        id: p.id,
        row: p.row,
        column: p.column,
        centre: p.centre,
        ra: formatRaHms(p.centre.raDeg),
        dec: formatDecDms(p.centre.decDeg),
        positionAngleDeg: p.positionAngleDeg,
        rotationDeg: normaliseAngle(-p.positionAngleDeg) + 0,
        footprint: p.footprint.vertices
      }))
    },
    null,
    2
  )}\n`
}

/** A file name for an export: the plan's name made safe, with the revision. */
export function gridExportName(name: string, revision: number, extension: 'csv' | 'json'): string {
  const safe = name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'mosaic'
  return `${safe}-r${revision}.${extension}`
}
