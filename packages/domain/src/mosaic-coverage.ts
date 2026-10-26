/**
 * Coverage of a mosaic (specs/037-mosaic-workspace, slice X3): how much of each planned panel the
 * captures cover, how deep, which frames count and which do not, where the gaps are and what to
 * shoot next. Frames are counted once whatever they overlap (MO-011); coverage comes from solved
 * footprints only, never from a thumbnail.
 *
 * The sky is sampled on the grid's own tangent plane, where every panel and footprint edge is a
 * straight line, in square cells of one size; each cell is weighted by the area it stands for on
 * the sphere. A coverage figure is good to about one cell along each edge of the panel.
 */

import { deprojectPosition, formatDecDms, formatRaHms, normaliseAngle, projectPosition } from './sky-geometry'
import { anticlockwise, insideConvex, onPlane, type PlanePoint } from './sky-polygons'
import { positionAngle, type PlannedPanel, type SkyPoint, type SkyPolygon } from './mosaic-workspace'

const RAD = Math.PI / 180

/** A panel is covered when this share of its area is under at least one counted capture. */
export const COVERED_FRACTION = 0.95
/** Cells across the shorter side of a panel. */
export const CELLS_PER_PANEL = 16
/** At most this many cells along either side of the whole grid, so a large grid stays quick. */
export const MAX_CELLS_PER_SIDE = 120
/** A patch of a panel left uncovered smaller than this share of it is not listed as a gap. */
export const MIN_GAP_FRACTION = 0.01

/** The name a frame with no FILTER header is shown under. */
export const NO_FILTER = 'No filter'

/** A filter's name as matched: trimmed and in lower case, so "Ha" and "HA " are one filter. */
export const filterKey = (name: string | null | undefined) => name?.trim().toLowerCase() || ''

// ── Counting each frame once ────────────────────────────────────────────

/** One file of a capture, as counting needs it. */
export interface CountedFrame {
  path: string
  filter: string | null
  seconds: number | null
  /** A hash of every byte, where one is known; frames with the same hash are one frame. */
  hash: string | null
  /** Left out by grading (spec 025): measured as bad, or rejected by hand. */
  rejected: boolean
}

export interface CountInput {
  id: string
  kind: 'lights' | 'master'
  /** The panel it counts toward; null when it counts toward none (left out, or on no panel). */
  panelId: string | null
  frames: CountedFrame[]
}

export interface FilterSeconds {
  /** The filter as first written; NO_FILTER for frames without one. */
  filter: string
  seconds: number
}

export interface CountedCapture {
  id: string
  panelId: string | null
  /** Usable exposure it adds, per filter. */
  exposures: FilterSeconds[]
  /** How many of its files count. */
  counted: number
  rejected: number
  /** Files with the same content as a file counted elsewhere. */
  duplicates: number
  /** Files with no exposure time in their header. */
  noExposure: number
  /** Why some or all of it does not count, in a sentence; null when all of it counts. */
  note: string | null
}

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * What each capture adds, each frame counted once (MO-011). Frames grading rejects are left out;
 * of frames with the same content, only the first by path counts; and a master counts toward its
 * panel only for filters with no counted lights there, since a master is made of lights.
 */
export function countOnce(captures: CountInput[]): CountedCapture[] {
  const firstOfHash = new Map<string, string>()
  for (const f of captures.flatMap(c => c.frames).filter(f => !f.rejected && f.hash).sort((a, b) => a.path.localeCompare(b.path))) {
    if (!firstOfHash.has(f.hash as string)) firstOfHash.set(f.hash as string, f.path)
  }
  // One spelling per filter across the mosaic: the first one met.
  const spelled = new Map<string, string>()
  const counted = captures.map(c => {
    let [rejected, duplicates, noExposure] = [0, 0, 0]
    const sums = new Map<string, { seconds: number; frames: number }>()
    let dupOf = ''
    for (const f of c.frames) {
      if (f.rejected) rejected++
      else if (f.hash && firstOfHash.get(f.hash) !== f.path) {
        duplicates++
        dupOf ||= firstOfHash.get(f.hash) as string
      } else if (f.seconds === null || !(f.seconds > 0)) noExposure++
      else {
        const key = filterKey(f.filter)
        if (!spelled.has(key)) spelled.set(key, key ? (f.filter as string).trim() : NO_FILTER)
        const sum = sums.get(key) ?? { seconds: 0, frames: 0 }
        sums.set(key, { seconds: sum.seconds + f.seconds, frames: sum.frames + 1 })
      }
    }
    return { c, sums, rejected, duplicates, noExposure, dupOf }
  })
  // Filters each panel has counted lights for, so a master there adds nothing for them.
  const lightsOn = new Map<string, Set<string>>()
  for (const { c, sums } of counted) {
    if (c.kind !== 'lights' || !c.panelId) continue
    lightsOn.set(c.panelId, new Set([...(lightsOn.get(c.panelId) ?? []), ...sums.keys()]))
  }
  return counted.map(({ c, sums, rejected, duplicates, noExposure, dupOf }) => {
    const notes: string[] = []
    const shadowed = c.kind === 'master' && c.panelId ? [...sums.keys()].filter(key => lightsOn.get(c.panelId as string)?.has(key)) : []
    for (const key of shadowed) sums.delete(key)
    if (shadowed.length > 0) notes.push(`Its lights on ${c.panelId} are counted instead, so it adds no exposure there.`)
    if (rejected > 0) notes.push(`${plural(rejected, 'frame')} rejected by grading.`)
    if (duplicates > 0) notes.push(`${plural(duplicates, 'frame')} with the same content as ${fileName(dupOf)}${duplicates > 1 ? ' and others' : ''}, counted there.`)
    if (noExposure > 0) notes.push(`${plural(noExposure, 'frame')} with no exposure time.`)
    const exposures = [...sums.entries()].map(([key, sum]) => ({ filter: spelled.get(key) as string, seconds: sum.seconds })).sort((a, b) => a.filter.localeCompare(b.filter))
    const frames = [...sums.values()].reduce((n, sum) => n + sum.frames, 0)
    return { id: c.id, panelId: c.panelId, exposures, counted: frames, rejected, duplicates, noExposure, note: notes.length > 0 ? notes.join(' ') : null }
  })
}

/** The key of a filter as named in counted exposure or a goal: frames with no filter, and a goal for them ("No Filter"), share ''. */
const keyOf = (name: string) => (filterKey(name) === filterKey(NO_FILTER) ? '' : filterKey(name))

// ── Sampling the sky ────────────────────────────────────────────────────

export interface CoverageSource {
  id: string
  footprint: SkyPolygon
  /** The exposure it adds wherever it covers (its counted seconds, per filter). */
  exposures: FilterSeconds[]
}

export interface CoverageCell {
  /** Its middle on the drawing (degrees about the grid's centre, x west, y north). */
  x: number
  y: number
  /** Counted exposure over this patch of sky, all filters together. */
  seconds: number
  /** The same per filter, in the order of the map's `filters`. */
  byFilter: number[]
  /** How many captures cover it. */
  captures: number
}

export interface CoverageGap {
  /** A point of the uncovered patch: its cell nearest the patch's middle, so it is never covered sky. */
  centre: SkyPoint
  areaSqDeg: number
  /** Its share of the panel. */
  fraction: number
  /** Where it lies in the panel, in words: "the whole panel", "most of the panel", "the middle", "toward the north-east". */
  where: string
}

export interface PanelCoverage {
  panelId: string
  /** Share of the panel's area under at least one counted capture, 0 to 1. */
  fraction: number
  covered: boolean
  areaSqDeg: number
  /** The least and most counted exposure over the panel's cells, all filters together. */
  shallowestSec: number
  deepestSec: number
  /** Uncovered patches, largest first. */
  gaps: CoverageGap[]
}

export interface CoverageMap {
  /** A cell's side on the drawing, in degrees. */
  cellDeg: number
  /** Filter names in the order of each cell's `byFilter`. */
  filters: string[]
  /** Only the cells inside at least one panel. */
  cells: CoverageCell[]
  panels: PanelCoverage[]
}

const compass = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

function gapWhere(panel: PlannedPanel, centre: SkyPoint, fraction: number, sizeDeg: number): string {
  if (fraction >= 0.9) return 'the whole panel'
  const offset = projectPosition(panel.centre, centre)
  if (!offset || Math.hypot(offset.xi, offset.eta) < 0.15 * sizeDeg) return fraction >= 0.5 ? 'most of the panel' : 'the middle'
  const pa = (positionAngle(panel.centre, centre) + 360) % 360
  return `toward the ${compass[Math.round(pa / 45) % 8]}`
}

/**
 * How the captures cover the panels (MO-008, MO-011), sampled on the grid's tangent plane: each
 * panel's covered share, its shallowest and deepest exposure and its gaps, and a map of counted
 * exposure across the grid for a heat map. A capture covers every panel it reaches, but its
 * exposure is added once at each place on the sky.
 */
export function coverageMap(gridCentre: SkyPoint, panels: PlannedPanel[], sources: CoverageSource[], options: { cellsPerPanel?: number; maxCellsPerSide?: number } = {}): CoverageMap {
  const onGrid = (polygon: SkyPolygon) => {
    const pts = onPlane(gridCentre, polygon)
    return pts ? anticlockwise(pts) : null
  }
  const panelShapes = panels.map(p => ({ panel: p, shape: onGrid(p.footprint) }))
  const sourceShapes = sources.map(s => ({ source: s, shape: onGrid(s.footprint) })).filter((s): s is { source: CoverageSource; shape: PlanePoint[] } => s.shape !== null)
  const filters = [...new Map(sources.flatMap(s => s.exposures).map(e => [keyOf(e.filter), e.filter])).values()].sort()
  const filterIndex = new Map(filters.map((f, i) => [keyOf(f), i]))
  const all = panelShapes.flatMap(p => p.shape ?? [])
  if (all.length === 0) return { cellDeg: 0, filters, cells: [], panels: panels.map(p => emptyPanel(p.id)) }
  const [minX, maxX] = [Math.min(...all.map(p => p.x)), Math.max(...all.map(p => p.x))]
  const [minY, maxY] = [Math.min(...all.map(p => p.y)), Math.max(...all.map(p => p.y))]
  const panelSize = Math.min(...panelShapes.map(({ shape }) => (shape ? shortSide(shape) : Infinity)))
  const span = Math.max(maxX - minX, maxY - minY)
  const cellDeg = Math.max(panelSize / (options.cellsPerPanel ?? CELLS_PER_PANEL), span / (options.maxCellsPerSide ?? MAX_CELLS_PER_SIDE))
  const [nx, ny] = [Math.max(1, Math.ceil((maxX - minX) / cellDeg)), Math.max(1, Math.ceil((maxY - minY) / cellDeg))]
  const cells: CoverageCell[] = []
  // Per panel, its cells by grid index, with their weight on the sphere and whether covered.
  const inPanel = panels.map(() => new Map<number, { weight: number; covered: boolean; seconds: number; at: PlanePoint }>())
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const at = { x: minX + (i + 0.5) * cellDeg, y: minY + (j + 0.5) * cellDeg }
      const holders = panelShapes.map(({ shape }) => !!shape && insideConvex(at, shape))
      if (!holders.some(Boolean)) continue
      const byFilter = filters.map(() => 0)
      let captures = 0
      for (const { source, shape } of sourceShapes) {
        if (!insideConvex(at, shape)) continue
        captures++
        for (const e of source.exposures) byFilter[filterIndex.get(keyOf(e.filter)) as number] += e.seconds
      }
      const seconds = byFilter.reduce((s, v) => s + v, 0)
      // The cell's area on the sphere: its area on the plane shrunk by (1 + r²)^-3/2.
      const r2 = (at.x * at.x + at.y * at.y) * RAD * RAD
      const weight = (cellDeg * cellDeg) / (1 + r2) ** 1.5
      holders.forEach((held, k) => held && inPanel[k].set(j * nx + i, { weight, covered: captures > 0, seconds, at }))
      cells.push({ x: round(-at.x, 6), y: round(at.y, 6), seconds, byFilter, captures })
    }
  }
  const coverage = panels.map((panel, k) => {
    const mine = inPanel[k]
    if (mine.size === 0) return emptyPanel(panel.id)
    const area = [...mine.values()].reduce((s, c) => s + c.weight, 0)
    const coveredArea = [...mine.values()].filter(c => c.covered).reduce((s, c) => s + c.weight, 0)
    const fraction = coveredArea / area
    const depths = [...mine.values()].map(c => c.seconds)
    const gaps = gapsOf(mine, nx).map(patch => {
      const weight = patch.reduce((s, c) => s + c.weight, 0)
      const mid = { x: patch.reduce((s, c) => s + c.at.x * c.weight, 0) / weight, y: patch.reduce((s, c) => s + c.at.y * c.weight, 0) / weight }
      const share = weight / area
      // A ring's middle can be covered sky, so the gap's centre is its own cell nearest the middle.
      const nearest = patch.reduce((best, c) => (Math.hypot(c.at.x - mid.x, c.at.y - mid.y) < Math.hypot(best.at.x - mid.x, best.at.y - mid.y) ? c : best))
      const centre = deprojectPosition(gridCentre, nearest.at.x, nearest.at.y)
      const where = gapWhere(panel, deprojectPosition(gridCentre, mid.x, mid.y), share, panelSize)
      return { centre: { raDeg: round(centre.raDeg, 6), decDeg: round(centre.decDeg, 6) }, areaSqDeg: round(weight, 6), fraction: round(share, 4), where }
    })
    return {
      panelId: panel.id,
      fraction: round(fraction, 4),
      covered: fraction >= COVERED_FRACTION,
      areaSqDeg: round(area, 6),
      shallowestSec: Math.min(...depths),
      deepestSec: Math.max(...depths),
      gaps: gaps.filter(g => g.fraction >= MIN_GAP_FRACTION).sort((a, b) => b.areaSqDeg - a.areaSqDeg)
    }
  })
  return { cellDeg: round(cellDeg, 6), filters, cells, panels: coverage }
}

const emptyPanel = (panelId: string): PanelCoverage => ({ panelId, fraction: 0, covered: false, areaSqDeg: 0, shallowestSec: 0, deepestSec: 0, gaps: [] })

/** The shorter side of a quadrilateral panel on the plane. */
function shortSide(shape: PlanePoint[]): number {
  const side = (a: PlanePoint, b: PlanePoint) => Math.hypot(a.x - b.x, a.y - b.y)
  return Math.min(...shape.map((p, i) => side(p, shape[(i + 1) % shape.length])))
}

/** The uncovered cells of a panel in patches that touch side by side. */
function gapsOf<C extends { covered: boolean }>(cells: Map<number, C>, nx: number): C[][] {
  const seen = new Set<number>()
  const patches: C[][] = []
  for (const [start, cell] of cells) {
    if (cell.covered || seen.has(start)) continue
    const patch: C[] = []
    const queue = [start]
    seen.add(start)
    while (queue.length > 0) {
      const at = queue.pop() as number
      patch.push(cells.get(at) as C)
      const [i, j] = [at % nx, Math.floor(at / nx)]
      const next = [i > 0 ? at - 1 : -1, i < nx - 1 ? at + 1 : -1, j > 0 ? at - nx : -1, at + nx]
      for (const n of next) {
        const c = n >= 0 ? cells.get(n) : undefined
        if (c && !c.covered && !seen.has(n)) {
          seen.add(n)
          queue.push(n)
        }
      }
    }
    patches.push(patch)
  }
  return patches
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

// ── Progress and the next session ───────────────────────────────────────

export interface FilterProgress {
  filter: string
  haveSec: number
  /** The target's goal for this filter, as each panel's goal; null when none is set. */
  goalSec: number | null
  /** Still to capture for the goal; 0 once it is met, null with no goal. */
  needSec: number | null
}

export type PanelState = 'not started' | 'partly covered' | 'covered'

export interface PanelProgress {
  panelId: string
  state: PanelState
  coverage: PanelCoverage
  filters: FilterProgress[]
  /** Every goal met; null when no goal is set. */
  goalsMet: boolean | null
  /** Captures counted toward it. */
  captures: number
}

/**
 * Each panel's progress (MO-008): whether it is covered and, apart from that, its usable exposure
 * per filter against the target's per-filter goals, each panel needing the whole goal. A panel is
 * only "covered" by area; meeting goals is reported on its own.
 */
export function panelProgress(coverage: PanelCoverage[], counted: CountedCapture[], goals: FilterSeconds[]): PanelProgress[] {
  return coverage.map(cov => {
    const mine = counted.filter(c => c.panelId === cov.panelId && c.exposures.length > 0)
    const filters = measureFilters(mine.flatMap(c => c.exposures), goals)
    const withGoal = filters.filter(f => f.goalSec !== null)
    const state: PanelState = cov.covered ? 'covered' : cov.fraction > 0 ? 'partly covered' : 'not started'
    return { panelId: cov.panelId, state, coverage: cov, filters, goalsMet: withGoal.length > 0 ? withGoal.every(f => f.needSec === 0) : null, captures: mine.length }
  })
}

/**
 * Exposure per filter against per-filter goals, ordered by filter. Goals whose names differ only
 * in case or spaces are one filter's goal and the larger one stands; frames with no filter meet a
 * goal named "No filter". A filter with exposure and no goal is listed with a null goal.
 */
export function measureFilters(have: FilterSeconds[], goals: FilterSeconds[]): FilterProgress[] {
  const byKey = new Map<string, FilterProgress>()
  for (const g of goals) {
    const key = keyOf(g.filter)
    const seconds = Math.max(g.seconds, byKey.get(key)?.goalSec ?? 0)
    byKey.set(key, { filter: byKey.get(key)?.filter ?? g.filter.trim(), haveSec: 0, goalSec: seconds, needSec: seconds })
  }
  for (const e of have) {
    const key = keyOf(e.filter)
    const entry = byKey.get(key) ?? { filter: e.filter, haveSec: 0, goalSec: null, needSec: null }
    entry.haveSec += e.seconds
    if (entry.goalSec !== null) entry.needSec = Math.max(0, entry.goalSec - entry.haveSec)
    byKey.set(key, entry)
  }
  return [...byKey.values()].sort((a, b) => a.filter.localeCompare(b.filter))
}

export interface NextSessionRow {
  panel: PlannedPanel
  progress: PanelProgress
  /** Where to point: the middle of its largest gap when it is partly covered, else its centre. */
  aim: SkyPoint
  /** What it still needs, in words. */
  reason: string
}

const hours = (sec: number) => `${(sec / 3600).toFixed(1)} h`

/**
 * The panels to shoot next, most needed first: those not covered, then those short of a goal.
 * A panel covered with every goal met, or covered with no goal set, is left out.
 */
export function nextSession(panels: PlannedPanel[], progress: PanelProgress[]): NextSessionRow[] {
  const byId = new Map(progress.map(p => [p.panelId, p]))
  const rows: NextSessionRow[] = []
  for (const panel of panels) {
    const p = byId.get(panel.id)
    if (!p) continue
    const short = p.filters.filter(f => (f.needSec ?? 0) > 0)
    if (p.coverage.covered && short.length === 0) continue
    const gap = p.coverage.gaps[0]
    const aim = p.state === 'partly covered' && gap ? gap.centre : panel.centre
    const parts: string[] = []
    if (p.state === 'not started') parts.push('not captured yet')
    else if (!p.coverage.covered) parts.push(`${Math.round(p.coverage.fraction * 100)}% covered, uncovered: ${gap?.where ?? 'slivers at its edges'}`)
    for (const f of short) parts.push(`${f.filter} needs ${hours(f.needSec as number)} more`)
    rows.push({ panel, progress: p, aim, reason: parts.join('; ') })
  }
  const need = (r: NextSessionRow) => r.progress.filters.reduce((s, f) => s + (f.needSec ?? 0), 0)
  return rows.sort((a, b) => a.progress.coverage.fraction - b.progress.coverage.fraction || need(b) - need(a) || a.panel.id.localeCompare(b.panel.id))
}

export const NEXT_SESSION_CSV_COLUMNS = [
  'plan', 'revision', 'order', 'panel', 'state', 'coverage', 'aim_ra', 'aim_dec', 'aim_ra_deg', 'aim_dec_deg',
  'position_angle_deg', 'rotation_deg', 'filter', 'have_sec', 'goal_sec', 'need_sec', 'reason'
] as const

const csvCell = (text: string) => (/[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)

export interface NextSessionExport {
  name: string
  revision: number
  rows: NextSessionRow[]
}

/** The next session as CSV: one row per panel and filter it needs (one row with no filter when it needs coverage only). */
export function nextSessionCsv(input: NextSessionExport): string {
  const lines: string[][] = [[...NEXT_SESSION_CSV_COLUMNS]]
  input.rows.forEach((r, n) => {
    const base = [
      csvCell(input.name),
      String(input.revision),
      String(n + 1),
      r.panel.id,
      r.progress.state,
      r.progress.coverage.fraction.toFixed(3),
      formatRaHms(r.aim.raDeg),
      formatDecDms(r.aim.decDeg),
      r.aim.raDeg.toFixed(6),
      r.aim.decDeg.toFixed(6),
      r.panel.positionAngleDeg.toFixed(2),
      (normaliseAngle(-r.panel.positionAngleDeg) + 0).toFixed(2)
    ]
    const short = r.progress.filters.filter(f => (f.needSec ?? 0) > 0)
    const filterRows = short.length > 0 ? short : [null]
    for (const f of filterRows) {
      lines.push([...base, csvCell(f?.filter ?? ''), f ? String(Math.round(f.haveSec)) : '', f?.goalSec != null ? String(Math.round(f.goalSec)) : '', f?.needSec != null ? String(Math.round(f.needSec)) : '', csvCell(r.reason)])
    }
  })
  return `${lines.map(l => l.join(',')).join('\n')}\n`
}

/** The next session as JSON a capture tool or script can read. */
export function nextSessionJson(input: NextSessionExport): string {
  return `${JSON.stringify(
    {
      plan: input.name,
      revision: input.revision,
      frame: 'ICRS',
      units: { angles: 'degrees', exposure: 'seconds', positionAngle: "the panel's up axis, east of north", rotation: 'CROTA2, as plate solvers report it' },
      panels: input.rows.map((r, n) => ({
        order: n + 1,
        id: r.panel.id,
        state: r.progress.state,
        coverage: r.progress.coverage.fraction,
        aim: r.aim,
        ra: formatRaHms(r.aim.raDeg),
        dec: formatDecDms(r.aim.decDeg),
        positionAngleDeg: r.panel.positionAngleDeg,
        rotationDeg: normaliseAngle(-r.panel.positionAngleDeg) + 0,
        filters: r.progress.filters.filter(f => (f.needSec ?? 0) > 0).map(f => ({ filter: f.filter, haveSec: f.haveSec, goalSec: f.goalSec, needSec: f.needSec })),
        reason: r.reason
      }))
    },
    null,
    2
  )}\n`
}

/** A file name for the next-session export. */
export function nextSessionExportName(name: string, revision: number, extension: 'csv' | 'json'): string {
  const safe = name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'mosaic'
  return `${safe}-r${revision}-next.${extension}`
}
