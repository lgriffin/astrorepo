/**
 * Sky geometry (specs/024-sky-geometry): where each image points, read from its headers or a plate
 * solve; which files to solve; whether a target is filed under the wrong name; mosaic tiles and the
 * nights they clear the altitude limit; and which lights are panels of one mosaic. Pure: running a
 * solver and reading its result file are adapters' jobs, and the commands are built here.
 */

import { observingNightOf } from './observing-night'
import { parentDir } from './post-processing'
import { sirilStackCommand, type JobCommand } from './jobs'
import { DEFAULT_PLANNING_POLICY, usableHours, type NightSky, type PlanningPolicy, type Site } from './sky'
import type { ToolStatus } from './tools'
import { EXIT_CODES } from './exit-codes'

/** Where an image points and how big it is on the sky. Other slices draw coordinate overlays from this shape. */
export interface SolvedField {
  /** Centre, J2000, in degrees. */
  raDeg: number
  decDeg: number
  /** Position angle of the image's up axis, east of north, in degrees, (-180, 180]. */
  rotationDeg: number
  /** Arc seconds per pixel. */
  scaleArcsec: number
  widthPx: number
  heightPx: number
}

export type SolverId = 'astap' | 'siril'
/** How a field was found: by a solver, or read from a WCS already in the file's headers. */
export type SolveSource = SolverId | 'header'

export const SOLVER_LABEL: Record<SolveSource, string> = { astap: 'ASTAP', siril: 'Siril', header: 'its own headers' }

export type SolveOutcome = { ok: true; field: SolvedField } | { ok: false; reason: string }

/** A rough position to start the solver from, and the optics when the headers give them. */
export interface SolveHint {
  raDeg: number
  decDeg: number
}

export interface SolveOptics {
  focalMm: number
  pixelUm: number
}

const RAD = Math.PI / 180

/** An angle in (-180, 180]. */
export function normaliseAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360
  return a > 180 ? a - 360 : a
}

/** Angle between two positions given in degrees. */
export function angularDistanceDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const d1 = dec1 * RAD
  const d2 = dec2 * RAD
  const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos((ra1 - ra2) * RAD)
  return Math.acos(Math.max(-1, Math.min(1, cos))) / RAD
}

export const fieldWidthDeg = (f: SolvedField) => (f.widthPx * f.scaleArcsec) / 3600
export const fieldHeightDeg = (f: SolvedField) => (f.heightPx * f.scaleArcsec) / 3600

/** Image scale from the optics, in arc seconds per pixel. */
export function scaleFromOptics(optics: SolveOptics): number {
  return (optics.pixelUm / optics.focalMm) * 206.265
}

// ── A WCS in the headers ────────────────────────────────────────────────

/** WCS header cards, keyword to raw value as the index stores it (quotes and all). */
export type WcsCards = Record<string, string | number | null | undefined>

/** The keywords a WCS is read from. */
export const WCS_KEYWORDS = ['CRVAL1', 'CRVAL2', 'CD1_1', 'CD1_2', 'CD2_1', 'CD2_2', 'CDELT1', 'CDELT2', 'CROTA1', 'CROTA2', 'PLTSOLVD'] as const

function cardNumber(cards: WcsCards, key: string): number | null {
  const raw = cards[key]
  if (raw === null || raw === undefined) return null
  const text = String(raw).replace(/'/g, '').trim()
  if (text === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/**
 * The field a WCS describes: CRVAL1/2 for the centre and either the CD matrix or CDELT with CROTA2
 * for scale and rotation. Null when the cards do not hold a usable WCS. CRVAL is taken as the
 * centre, which is where solvers put the reference pixel.
 */
export function fieldFromWcs(cards: WcsCards, widthPx: number, heightPx: number): SolvedField | null {
  const ra = cardNumber(cards, 'CRVAL1')
  const dec = cardNumber(cards, 'CRVAL2')
  if (ra === null || dec === null || Math.abs(dec) > 90 || !(widthPx > 0) || !(heightPx > 0)) return null
  const cd11 = cardNumber(cards, 'CD1_1')
  const cd12 = cardNumber(cards, 'CD1_2') ?? 0
  const cd21 = cardNumber(cards, 'CD2_1') ?? 0
  const cd22 = cardNumber(cards, 'CD2_2')
  let scaleDeg: number
  let rotation: number
  if (cd11 !== null && cd22 !== null) {
    scaleDeg = Math.sqrt(Math.abs(cd11 * cd22 - cd12 * cd21))
    rotation = Math.atan2(-cd12, cd22) / RAD
  } else {
    const d1 = cardNumber(cards, 'CDELT1')
    const d2 = cardNumber(cards, 'CDELT2')
    if (d1 === null && d2 === null) return null
    scaleDeg = (Math.abs(d1 ?? d2 ?? 0) + Math.abs(d2 ?? d1 ?? 0)) / 2
    rotation = cardNumber(cards, 'CROTA2') ?? cardNumber(cards, 'CROTA1') ?? 0
  }
  if (!(scaleDeg > 0)) return null
  return {
    raDeg: round(((ra % 360) + 360) % 360, 6),
    decDeg: dec,
    rotationDeg: round(normaliseAngle(rotation), 2),
    scaleArcsec: round(scaleDeg * 3600, 4),
    widthPx,
    heightPx
  }
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

// ── ASTAP ───────────────────────────────────────────────────────────────

/** The search radius around a hint, in degrees: wide enough for a panel or two of a mosaic off the target. */
export const HINTED_RADIUS_DEG = 10

/**
 * astap_cli over a copy of the image in the work area: `-fov` is the field height in degrees (0
 * lets ASTAP work it out), `-ra` is in hours and `-spd` is the south pole distance (Dec + 90). With
 * no hint ASTAP searches the whole sky. `-wcs` writes a .wcs beside the copy as well as the .ini.
 */
export function astapCommand(program: string, imagePath: string, hint: SolveHint | null, fieldHeightDeg: number | null): JobCommand {
  const fov = fieldHeightDeg && fieldHeightDeg > 0 ? round(fieldHeightDeg, 3) : 0
  const args = ['-f', imagePath, '-r', String(hint ? HINTED_RADIUS_DEG : 180), '-fov', String(fov)]
  if (hint) args.push('-ra', String(round(hint.raDeg / 15, 5)), '-spd', String(round(hint.decDeg + 90, 5)))
  args.push('-wcs')
  return { program, args, cwd: parentDir(imagePath).dir }
}

/** ASTAP writes its result beside the image, with the image's extension swapped for .ini. */
export function astapResultPath(imagePath: string): string {
  const { dir, sep } = parentDir(imagePath)
  const name = dir === '.' ? imagePath : imagePath.slice(dir.length).replace(/^[\\/]/, '')
  const dot = name.lastIndexOf('.')
  return `${dir === '.' ? '' : dir.endsWith(sep) ? dir : dir + sep}${dot > 0 ? name.slice(0, dot) : name}.ini`
}

/** What ASTAP's exit code means, for when it leaves no result file (its table in the one exit-code contract, HUB-012). */
export function astapExitReason(exitCode: number | null): string {
  const known = exitCode !== null && exitCode !== 0 ? EXIT_CODES.astap.codes[exitCode]?.message : undefined
  return known || `ASTAP stopped without a result${exitCode === null ? '' : ` (exit code ${exitCode})`}.`
}

/** ASTAP's .ini: PLTSOLVD=T with the WCS, or PLTSOLVD=F with an ERROR or WARNING line. */
export function parseAstapResult(ini: string, widthPx: number, heightPx: number): SolveOutcome {
  const cards: WcsCards = {}
  for (const line of ini.split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) cards[line.slice(0, i).trim().toUpperCase()] = line.slice(i + 1).trim()
  }
  const solved = String(cards.PLTSOLVD ?? '').toUpperCase().startsWith('T')
  if (!solved) {
    const why = String(cards.ERROR ?? cards.WARNING ?? '').trim()
    return { ok: false, reason: why ? `ASTAP could not solve it: ${why.replace(/\.?$/, '.')}` : 'ASTAP found no solution.' }
  }
  const field = fieldFromWcs(cards, widthPx, heightPx)
  return field ? { ok: true, field } : { ok: false, reason: 'ASTAP said it solved the image but wrote no usable position.' }
}

// ── Siril ───────────────────────────────────────────────────────────────

/**
 * A Siril script that loads the copy and plate solves it with Siril's own solver, printing the
 * solution to the log. Nothing is saved: the copy is thrown away afterwards.
 */
export function sirilSolveScript(fileName: string, hint: SolveHint | null, optics: SolveOptics | null): string {
  const args = ['platesolve']
  if (hint) args.push(`${round(hint.raDeg, 5)},${round(hint.decDeg, 5)}`)
  if (optics) args.push(`-focal=${round(optics.focalMm, 2)}`, `-pixelsize=${round(optics.pixelUm, 3)}`)
  return ['requires 1.2.0', `load "${fileName}"`, args.join(' '), ''].join('\n')
}

export function sirilSolveCommand(program: string, workDir: string, scriptPath: string): JobCommand {
  return sirilStackCommand(program, scriptPath, workDir)
}

/** Three numbers from a sexagesimal text such as "05h35m17.3s", "05 35 17.3" or "-05°23'28\"". */
function sexagesimal(text: string): number | null {
  const sign = /^\s*-/.test(text) ? -1 : 1
  const parts = text.match(/\d+(?:\.\d+)?/g)
  if (!parts || parts.length < 3) return null
  const [a, b, c] = parts.map(Number)
  return sign * (a + b / 60 + c / 3600)
}

/**
 * The solution Siril prints: "Resolution: 2.390 arcsec/px", "Rotation: +12.34 deg" and "Image
 * center: alpha: 05h35m17s, delta: -05°23'28\"" (or with spaces between the parts). A run that
 * prints none says why from its own failure line where there is one.
 */
export function parseSirilSolve(log: string, widthPx: number, heightPx: number): SolveOutcome {
  const text = log.replace(/^log:\s*/gm, '')
  const resolution = /Resolution:\s*([\d.]+)\s*arcsec/i.exec(text)
  const rotation = /Rotation:\s*([+-]?[\d.]+)\s*deg/i.exec(text)
  const centre = /Image cent(?:er|re):\s*alpha:\s*([^,\n]+),\s*delta:\s*([^\n]+)/i.exec(text)
  const ra = centre ? sexagesimal(centre[1]) : null
  const dec = centre ? sexagesimal(centre[2]) : null
  if (resolution && ra !== null && dec !== null && widthPx > 0 && heightPx > 0) {
    return {
      ok: true,
      field: {
        raDeg: round(ra * 15, 6),
        decDeg: round(dec, 6),
        rotationDeg: round(normaliseAngle(Number(rotation?.[1] ?? 0)), 2),
        scaleArcsec: Number(resolution[1]),
        widthPx,
        heightPx
      }
    }
  }
  const failure = text.split(/\r?\n/).find(l => /fail|not enough|could not|cannot|error/i.test(l))
  return { ok: false, reason: failure ? `Siril could not solve it: ${failure.trim().replace(/\.?$/, '.')}` : 'Siril finished without printing a solution.' }
}

// ── Solve jobs ──────────────────────────────────────────────────────────

/** One file a solve job places. */
export interface SolveTaskFile {
  path: string
  widthPx: number
  heightPx: number
  hint: SolveHint | null
  optics: SolveOptics | null
}

/** What a queued solve job runs: the solver the hub chose, and the files, solved one by one in the work folder. */
export interface SolveTask {
  solver: SolverId
  program: string
  workDir: string
  files: SolveTaskFile[]
}

/** The name a file's copy takes in the work folder: one at a time, so a fixed plain name that needs no quoting. */
export function solveCopyName(path: string): string {
  const ext = /\.(fits?|fts)$/i.exec(path)?.[0].toLowerCase() ?? '.fit'
  return `solve${ext}`
}

/** The command a solve job shows: the one it runs for its first file. */
export function solveJobCommand(task: SolveTask): JobCommand {
  const first = task.files[0]
  const sep = task.workDir.includes('\\') ? '\\' : '/'
  const copy = `${task.workDir}${sep}${first ? solveCopyName(first.path) : 'solve.fit'}`
  if (task.solver === 'astap') {
    const height = first?.optics ? (first.heightPx * scaleFromOptics(first.optics)) / 3600 : null
    return astapCommand(task.program, copy, first?.hint ?? null, height)
  }
  return sirilSolveCommand(task.program, task.workDir, `${task.workDir}${sep}solve.ssf`)
}

// ── Which solver ────────────────────────────────────────────────────────

export const NO_SOLVER = 'Neither ASTAP nor Siril is set up, so nothing can be plate solved. Install ASTAP (preferred) or Siril, or set where one is in Settings → Tools.'

/** ASTAP when the tool hub found it, else Siril's own solver, else none. */
export function chooseSolver(tools: ToolStatus[]): { id: SolverId; program: string } | null {
  for (const id of ['astap', 'siril'] as const) {
    const path = tools.find(t => t.id === id)?.path
    if (path) return { id, program: path }
  }
  return null
}

// ── Which files to solve ────────────────────────────────────────────────

/** A light or master in the index, as plate solving sees it. */
export interface SkyFile {
  path: string
  targetId: string
  kind: 'light' | 'master'
  capturedAt: Date | null
  /** The folder it sits in: a mosaic's panels are usually captured into folders of their own. */
  folder: string
  exposureSec: number | null
  sizeBytes: number
  widthPx: number | null
  heightPx: number | null
  optics: SolveOptics | null
  /** WCS cards already in its headers, or null. */
  wcs: WcsCards | null
}

/** Lights of one target from one folder on one night, which one solve stands for. */
export function panelGroupKey(f: Pick<SkyFile, 'targetId' | 'capturedAt' | 'folder'>): string {
  return `${f.targetId}|${f.capturedAt ? observingNightOf(f.capturedAt) : 'undated'}|${f.folder}`
}

export interface SolvePlan {
  /** Files whose headers already carry a WCS: stored without solving. */
  fromHeaders: { file: SkyFile; field: SolvedField }[]
  /** Files to hand a solver: one light per folder per night, and every master. */
  toSolve: SkyFile[]
}

/**
 * One light per target, night and folder (the one in the middle of the night's run), and every
 * master. A light or master already solved, or whose headers carry a WCS, is not solved again;
 * one whose headers carry a WCS stands for its group without a solve. A file with no size in
 * pixels cannot be placed and is skipped.
 */
export function planSolves(files: SkyFile[], alreadyStored: Set<string>): SolvePlan {
  const plan: SolvePlan = { fromHeaders: [], toSolve: [] }
  const sized = files.filter(f => f.widthPx && f.heightPx)
  const take = (f: SkyFile) => {
    if (alreadyStored.has(f.path)) return
    const field = f.wcs ? fieldFromWcs(f.wcs, f.widthPx as number, f.heightPx as number) : null
    if (field) plan.fromHeaders.push({ file: f, field })
    else plan.toSolve.push(f)
  }
  const groups = new Map<string, SkyFile[]>()
  for (const f of sized) {
    if (f.kind === 'master') take(f)
    else groups.set(panelGroupKey(f), [...(groups.get(panelGroupKey(f)) ?? []), f])
  }
  for (const lights of groups.values()) {
    if (lights.some(l => alreadyStored.has(l.path))) continue
    const withWcs = lights.find(l => l.wcs && fieldFromWcs(l.wcs, l.widthPx as number, l.heightPx as number))
    if (withWcs) {
      take(withWcs)
      continue
    }
    const ordered = [...lights].sort((a, b) => (a.capturedAt?.getTime() ?? 0) - (b.capturedAt?.getTime() ?? 0) || a.path.localeCompare(b.path))
    take(ordered[Math.floor((ordered.length - 1) / 2)])
  }
  return plan
}

// ── What solves say about a target ──────────────────────────────────────

export interface Misfiled {
  /** Solved files whose centre is further from the catalogue position than their field is wide. */
  far: number
  of: number
  /** The nearest of those, in degrees. */
  nearestDeg: number
  fieldDeg: number
}

/**
 * Whether a target may be filed under the wrong name: most of its solved files point further from
 * the catalogue position of its name than the larger side of their own field.
 */
export function misfiledCheck(catalogue: { raDeg: number; decDeg: number } | null, fields: SolvedField[]): Misfiled | null {
  if (!catalogue || fields.length === 0) return null
  const far = fields
    .map(f => ({ distance: angularDistanceDeg(catalogue.raDeg, catalogue.decDeg, f.raDeg, f.decDeg), side: Math.max(fieldWidthDeg(f), fieldHeightDeg(f)) }))
    .filter(f => f.distance > f.side)
  if (far.length * 2 <= fields.length) return null
  const nearest = far.reduce((a, b) => (b.distance < a.distance ? b : a))
  return { far: far.length, of: fields.length, nearestDeg: round(nearest.distance, 2), fieldDeg: round(nearest.side, 2) }
}

export interface NightRotation {
  night: string
  rotationDeg: number
}

/** A turn of the camera bigger than this between nights is worth a mention. */
export const ROTATION_TOLERANCE_DEG = 2

/**
 * Each night's field rotation (the median of its solved lights), and the largest difference
 * between two nights. A half turn is a meridian flip, which stacking handles, so angles are
 * compared modulo 180°.
 */
export function rotationByNight(lights: { night: string; field: SolvedField }[]): { nights: NightRotation[]; spreadDeg: number } {
  const byNight = new Map<string, number[]>()
  for (const l of lights) byNight.set(l.night, [...(byNight.get(l.night) ?? []), l.field.rotationDeg])
  const nights = [...byNight.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([night, r]) => {
      const sorted = [...r].sort((a, b) => a - b)
      return { night, rotationDeg: round(sorted[Math.floor((sorted.length - 1) / 2)], 1) }
    })
  let spread = 0
  for (const a of nights) {
    for (const b of nights) {
      const d = Math.abs(normaliseAngle(a.rotationDeg - b.rotationDeg)) % 180
      spread = Math.max(spread, Math.min(d, 180 - d))
    }
  }
  return { nights, spreadDeg: round(spread, 1) }
}

// ── Mosaic planner ──────────────────────────────────────────────────────

/** Neighbouring panels share at least this much of their width or height. */
export const MOSAIC_MIN_OVERLAP = 0.15

export interface MosaicRequest {
  centre: { raDeg: number; decDeg: number }
  /** The target's extent, in arc minutes (the catalogue gives one size; width and height then match). */
  targetWidthArcmin: number
  targetHeightArcmin: number
  /** One panel's field. */
  field: { widthDeg: number; heightDeg: number }
  /** Position angle of the panels' up axis, east of north. */
  rotationDeg: number
  /** Fraction each panel shares with its neighbour; raised to the minimum when lower. */
  overlap: number
}

export interface MosaicTile {
  /** 1-based, row by row from the top left. */
  index: number
  row: number
  column: number
  raDeg: number
  decDeg: number
}

export interface MosaicPlan {
  columns: number
  rows: number
  overlap: number
  rotationDeg: number
  field: { widthDeg: number; heightDeg: number }
  /** The target fits one field, so one tile covers it. */
  fitsOneField: boolean
  /** What the panels cover together, in degrees. */
  coverWidthDeg: number
  coverHeightDeg: number
  tiles: MosaicTile[]
}

/** The position `xi` east and `eta` north of a centre on the tangent plane (degrees), back on the sky. */
export function offsetPosition(centre: { raDeg: number; decDeg: number }, xiDeg: number, etaDeg: number): { raDeg: number; decDeg: number } {
  const xi = xiDeg * RAD
  const eta = etaDeg * RAD
  const ra0 = centre.raDeg * RAD
  const dec0 = centre.decDeg * RAD
  const denom = Math.cos(dec0) - eta * Math.sin(dec0)
  const ra = ra0 + Math.atan2(xi, denom)
  const dec = Math.atan2(Math.sin(dec0) + eta * Math.cos(dec0), Math.sqrt(xi * xi + denom * denom))
  return { raDeg: round(((ra / RAD) % 360 + 360) % 360, 6), decDeg: round(dec / RAD, 6) }
}

function panelsAlong(targetDeg: number, fieldDeg: number, overlap: number): number {
  if (targetDeg <= fieldDeg) return 1
  return 1 + Math.ceil((targetDeg - fieldDeg) / (fieldDeg * (1 - overlap)) - 1e-9)
}

/**
 * A grid of panels that covers the target with at least the minimum overlap, turned to the chosen
 * rotation and centred on the target. Tile 1 is top left with north up at rotation 0 (east on the
 * left, as on the sky), and tiles run row by row.
 */
export function planMosaic(req: MosaicRequest): MosaicPlan {
  const overlap = Math.min(0.5, Math.max(MOSAIC_MIN_OVERLAP, req.overlap))
  const { widthDeg, heightDeg } = req.field
  const columns = panelsAlong(req.targetWidthArcmin / 60, widthDeg, overlap)
  const rows = panelsAlong(req.targetHeightArcmin / 60, heightDeg, overlap)
  const stepX = widthDeg * (1 - overlap)
  const stepY = heightDeg * (1 - overlap)
  const theta = normaliseAngle(req.rotationDeg) * RAD
  // The panel's up axis points at the position angle; its right axis is a quarter turn on, toward the west at 0.
  const up = { xi: Math.sin(theta), eta: Math.cos(theta) }
  const right = { xi: -Math.cos(theta), eta: Math.sin(theta) }
  const tiles: MosaicTile[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const u = (c - (columns - 1) / 2) * stepX
      const v = ((rows - 1) / 2 - r) * stepY
      const at = offsetPosition(req.centre, u * right.xi + v * up.xi, u * right.eta + v * up.eta)
      tiles.push({ index: r * columns + c + 1, row: r + 1, column: c + 1, ...at })
    }
  }
  return {
    columns,
    rows,
    overlap,
    rotationDeg: round(normaliseAngle(req.rotationDeg), 1),
    field: req.field,
    fitsOneField: columns === 1 && rows === 1,
    coverWidthDeg: round(widthDeg + (columns - 1) * stepX, 3),
    coverHeightDeg: round(heightDeg + (rows - 1) * stepY, 3),
    tiles
  }
}

export interface MosaicNight {
  night: string
  /** Usable hours of the panel that is up least that night. */
  hours: number
  /** Every panel clears the altitude limit for the minimum usable hours. */
  clear: boolean
}

/** For each night, how long every panel clears the altitude limit in darkness. */
export function mosaicNights(skies: NightSky[], site: Site, tiles: Pick<MosaicTile, 'raDeg' | 'decDeg'>[], policy: PlanningPolicy = DEFAULT_PLANNING_POLICY): MosaicNight[] {
  return skies.map(sky => {
    const hours = tiles.length === 0 ? 0 : Math.min(...tiles.map(t => usableHours(sky, site, { raHours: t.raDeg / 15, decDeg: t.decDeg }, policy)))
    return { night: sky.night, hours, clear: tiles.length > 0 && hours >= policy.minUsableHours }
  })
}

/** "05:35:17" */
export function formatRaHms(raDeg: number): string {
  const total = Math.round(((((raDeg / 15) % 24) + 24) % 24) * 3600) % 86400
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

/** "+05:23:28", "-05:23:28" */
export function formatDecDms(decDeg: number): string {
  const total = Math.round(Math.abs(decDeg) * 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${decDeg < 0 && total > 0 ? '-' : '+'}${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

/** The tiles as CSV, one row per panel, with the hours it still needs when a goal is set. */
export function mosaicCsv(plan: MosaicPlan, hoursNeeded: (tileIndex: number) => number | null): string {
  const rows = [['tile', 'row', 'column', 'ra', 'dec', 'ra_deg', 'dec_deg', 'rotation_deg', 'hours_needed']]
  for (const t of plan.tiles) {
    const hours = hoursNeeded(t.index)
    rows.push([
      String(t.index),
      String(t.row),
      String(t.column),
      formatRaHms(t.raDeg),
      formatDecDms(t.decDeg),
      t.raDeg.toFixed(5),
      t.decDeg.toFixed(5),
      String(plan.rotationDeg),
      hours === null ? '' : hours.toFixed(1)
    ])
  }
  return `${rows.map(r => r.join(',')).join('\n')}\n`
}

// ── Panels of a mosaic ──────────────────────────────────────────────────

/** Lights of one target, night and folder, placed by one solve. */
export interface SolvedGroup {
  key: string
  targetId: string
  night: string
  lightCount: number
  integrationSec: number
  field: SolvedField
}

export interface Panel {
  /** 1-based, in the order the groups came. */
  id: number
  raDeg: number
  decDeg: number
  integrationSec: number
  lightCount: number
  nights: string[]
  targetIds: string[]
  /** The planned tile it fills, if any. */
  tile: number | null
}

export interface TileCoverage {
  tile: number
  integrationSec: number
  lightCount: number
  nights: string[]
}

export interface PanelGrouping {
  panels: Panel[]
  /** Panel ids that overlap at least one other panel or share a planned mosaic, so are one mosaic's panels. */
  mosaic: number[]
  /** Per planned tile, what is captured for it. */
  tiles: TileCoverage[]
}

const minSide = (f: SolvedField) => Math.min(fieldWidthDeg(f), fieldHeightDeg(f))

/**
 * Groups solved lights into panels and panels into one mosaic. Lights whose centres are within a
 * quarter of a field are the same pointing (one panel); panels whose fields overlap each other, or
 * that each fill a planned tile, are panels of one mosaic. A panel fills a tile when its centre is
 * within half the tile's smaller side of the tile's centre.
 */
export function groupPanels(groups: SolvedGroup[], plan: Pick<MosaicPlan, 'tiles' | 'field'> | null): PanelGrouping {
  const panels: (Panel & { side: number })[] = []
  for (const g of groups) {
    const same = panels.find(p => angularDistanceDeg(p.raDeg, p.decDeg, g.field.raDeg, g.field.decDeg) < Math.min(p.side, minSide(g.field)) / 4)
    if (same) {
      same.integrationSec += g.integrationSec
      same.lightCount += g.lightCount
      if (!same.nights.includes(g.night)) same.nights.push(g.night)
      if (!same.targetIds.includes(g.targetId)) same.targetIds.push(g.targetId)
      continue
    }
    panels.push({
      id: panels.length + 1,
      raDeg: g.field.raDeg,
      decDeg: g.field.decDeg,
      integrationSec: g.integrationSec,
      lightCount: g.lightCount,
      nights: [g.night],
      targetIds: [g.targetId],
      tile: null,
      side: minSide(g.field)
    })
  }

  const tileSide = plan ? Math.min(plan.field.widthDeg, plan.field.heightDeg) : 0
  const tiles: TileCoverage[] = (plan?.tiles ?? []).map(t => ({ tile: t.index, integrationSec: 0, lightCount: 0, nights: [] }))
  for (const p of panels) {
    if (!plan) break
    let best: { tile: MosaicTile; distance: number } | null = null
    for (const t of plan.tiles) {
      const distance = angularDistanceDeg(t.raDeg, t.decDeg, p.raDeg, p.decDeg)
      if (distance <= tileSide / 2 && (!best || distance < best.distance)) best = { tile: t, distance }
    }
    if (!best) continue
    p.tile = best.tile.index
    const cover = tiles[best.tile.index - 1]
    cover.integrationSec += p.integrationSec
    cover.lightCount += p.lightCount
    for (const n of p.nights) if (!cover.nights.includes(n)) cover.nights.push(n)
  }

  const mosaic = new Set<number>()
  for (const a of panels) {
    if (plan && a.tile !== null && panels.some(b => b !== a && b.tile !== null)) mosaic.add(a.id)
    for (const b of panels) {
      if (a === b) continue
      if (angularDistanceDeg(a.raDeg, a.decDeg, b.raDeg, b.decDeg) < Math.min(a.side, b.side)) mosaic.add(a.id)
    }
  }
  for (const c of tiles) c.nights.sort()
  return {
    panels: panels.map(({ side: _side, ...p }) => ({ ...p, nights: [...p.nights].sort() })),
    mosaic: [...mosaic].sort((a, b) => a - b),
    tiles
  }
}

/** Whether a solved field overlaps a planned tile or another field, for picking other targets' lights. */
export function overlapsAny(field: SolvedField, others: { raDeg: number; decDeg: number; sideDeg: number }[]): boolean {
  return others.some(o => angularDistanceDeg(o.raDeg, o.decDeg, field.raDeg, field.decDeg) < Math.min(o.sideDeg, minSide(field)))
}
