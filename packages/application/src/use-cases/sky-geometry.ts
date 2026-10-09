import {
  chooseSolver,
  fieldHeightDeg,
  fieldWidthDeg,
  footprintOf,
  groupPanels,
  misfiledCheck,
  mosaicCsv,
  mosaicNights,
  NO_SOLVER,
  nightsFrom,
  observingNightOf,
  overlapsAny,
  panelGroupKey,
  planMosaic,
  planSolves,
  rotationByNight,
  siteNightOf,
  solveJobCommand,
  SOLVER_LABEL,
  type Job,
  type JobTiming,
  type Misfiled,
  type MosaicNight,
  type MosaicPlan,
  type MosaicTileGap,
  type NightRotation,
  type NightSky,
  type PanelGrouping,
  type SkyFile,
  type SolvedField,
  type SolvedGroup,
  type SolverId,
  type SolveOutcome,
  type SolveSource,
  type SolveTask
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { JobStore } from '../ports/jobs'
import type { Ephemeris, PlanningSettings } from '../ports/sky'
import type { MosaicStore, MosaicTarget, PlateSolver, SavedMosaic, SolveIO, SolveStore, StoredSolve } from '../ports/sky-geometry'
import type { ToolHub } from '../ports/tool-hub'

// ── The preferred solver ────────────────────────────────────────────────

export type PreferredSolver = () => Promise<{ solver: PlateSolver; program: string } | { solver: null; reason: string }>

/** ASTAP when the tool hub finds it, else Siril's own solver, else a reason naming both (SKY-002). */
export function makePreferredSolver(deps: { tools: ToolHub; solvers: PlateSolver[] }): PreferredSolver {
  return async () => {
    const statuses = await deps.tools.locate()
    const usable = statuses.filter(s => deps.solvers.some(p => p.id === s.id))
    const choice = chooseSolver(usable)
    const solver = choice ? deps.solvers.find(s => s.id === choice.id) : undefined
    return choice && solver ? { solver, program: choice.program } : { solver: null, reason: NO_SOLVER }
  }
}

// ── Queueing solves ─────────────────────────────────────────────────────

export interface QueueSolvesDeps {
  store: SolveStore
  mosaics: MosaicStore
  preferred: PreferredSolver
  jobs: JobStore
  clock: Clock
  /** The work folder a target's solves run in. */
  workDir: (targetId: string) => string
}

export interface QueueSolvesResult {
  /** Files whose headers already carried a WCS, stored without solving. */
  fromHeaders: number
  /** Files handed to the solver. */
  toSolve: number
  job: Job | null
  solver: SolverId | null
  /** What happened, in a sentence. */
  message: string
}

export type QueueSolves = (targetId: string, timing?: JobTiming) => Promise<QueueSolvesResult>

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

/**
 * Plate solves a target's lights (one per folder per night) and masters as one background job
 * (SKY-003). Files whose headers already carry a WCS are stored from it without solving (SKY-004);
 * files already placed, or in a solve job that has not finished, are left alone. A stored failure
 * is solved again, and a success replaces it.
 */
export function makeQueueSolves(deps: QueueSolvesDeps): QueueSolves {
  return async (targetId, timing = 'now') => {
    const files = await deps.store.files(targetId)
    const stored = new Set((await deps.store.solves(files.map(f => f.path))).filter(s => s.field).map(s => s.path))
    for (const job of await deps.jobs.list()) {
      if (job.kind !== 'solve' || (job.state !== 'queued' && job.state !== 'running')) continue
      for (const f of job.solve?.files ?? []) stored.add(f.path)
    }
    const plan = planSolves(files, stored)
    const now = deps.clock.now()
    for (const { file, field } of plan.fromHeaders) await deps.store.save({ path: file.path, field, source: 'header', solvedAt: now, error: null })
    const fromHeaders = plan.fromHeaders.length
    const headerNote = fromHeaders > 0 ? `${plural(fromHeaders, 'file')} already carried a position in its headers. ` : ''
    if (plan.toSolve.length === 0) {
      return { fromHeaders, toSolve: 0, job: null, solver: null, message: `${headerNote}Every light night and master of this target is placed.`.trim() }
    }
    const choice = await deps.preferred()
    if (!choice.solver) return { fromHeaders, toSolve: plan.toSolve.length, job: null, solver: null, message: `${headerNote}${choice.reason}` }

    const target = await deps.mosaics.target(targetId)
    const hint = target && target.raHours !== null && target.decDeg !== null ? { raDeg: target.raHours * 15, decDeg: target.decDeg } : null
    const workDir = deps.workDir(targetId)
    const task: SolveTask = {
      solver: choice.solver.id,
      program: choice.program,
      workDir,
      files: plan.toSolve.map(f => ({ path: f.path, widthPx: f.widthPx as number, heightPx: f.heightPx as number, hint, optics: f.optics }))
    }
    const label = SOLVER_LABEL[choice.solver.id]
    const job = await deps.jobs.add(
      {
        kind: 'solve',
        targetId,
        title: `Plate solve ${target?.name ?? 'target'} with ${label} (${plural(task.files.length, 'file')})`,
        timing,
        command: solveJobCommand(task),
        prepare: null,
        spaceDir: workDir,
        // One copy at a time, removed after each solve.
        neededBytes: Math.max(0, ...plan.toSolve.map(f => f.sizeBytes)),
        solve: task
      },
      now
    )
    return {
      fromHeaders,
      toSolve: task.files.length,
      job,
      solver: choice.solver.id,
      message: `${headerNote}${plural(task.files.length, 'file')} queued in Jobs to plate solve with ${label}.`
    }
  }
}

// ── Running a solve job ─────────────────────────────────────────────────

export interface SolveJobIO extends SolveIO {
  log(text: string): void
  progress(step: number, of: number, label: string | null): Promise<void>
  cancelled(): boolean
}

export type RunSolveJob = (job: Job, io: SolveJobIO) => Promise<{ state: 'succeeded' | 'failed'; note: string | null }>

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

/**
 * Solves a job's files one by one with the solver it was queued for and stores each field or
 * failure (SKY-001, SKY-003). A file placed meanwhile is skipped, so a job interrupted by the app
 * closing carries on where it stopped. A file the solver finds no match for near the target's
 * catalogue position is solved once more over the whole sky, so a misfiled target can still be
 * placed and flagged (SKY-005). It fails only when nothing could be solved.
 */
export function makeRunSolveJob(deps: { solvers: PlateSolver[]; store: SolveStore; clock: Clock }): RunSolveJob {
  return async (job, io) => {
    const task = job.solve
    const solver = task ? deps.solvers.find(s => s.id === task.solver) : undefined
    if (!task || !solver) return { state: 'failed', note: 'This job has no files to plate solve.' }
    const done = new Set((await deps.store.solves(task.files.map(f => f.path))).filter(s => s.field).map(s => s.path))
    let solved = 0
    let skipped = 0
    const failed: string[] = []
    for (let i = 0; i < task.files.length; i++) {
      if (io.cancelled()) break
      const file = task.files[i]
      if (done.has(file.path)) {
        skipped++
        continue
      }
      await io.progress(i, task.files.length, fileName(file.path))
      io.log(`── ${i + 1} of ${task.files.length}: ${file.path}\n`)
      const attempt = (f: typeof file) => solver.solve(task.program, f, task.workDir, io).catch((error: unknown): SolveOutcome => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }))
      let outcome = await attempt(file)
      if (io.cancelled()) break
      if (!outcome.ok && outcome.noSolution && file.hint) {
        io.log(`Not solved near the target's catalogue position (${outcome.reason}) Trying the whole sky.\n`)
        outcome = await attempt({ ...file, hint: null })
        if (io.cancelled()) break
      }
      const at = deps.clock.now()
      if (outcome.ok) {
        solved++
        await deps.store.save({ path: file.path, field: outcome.field, source: solver.id, solvedAt: at, error: null })
        io.log(`Solved: RA ${outcome.field.raDeg.toFixed(4)}°, Dec ${outcome.field.decDeg.toFixed(4)}°, ${outcome.field.scaleArcsec.toFixed(2)}"/px, rotation ${outcome.field.rotationDeg}°.\n\n`)
      } else {
        failed.push(`${fileName(file.path)}: ${outcome.reason}`)
        await deps.store.save({ path: file.path, field: null, source: solver.id, solvedAt: at, error: outcome.reason })
        io.log(`Not solved: ${outcome.reason}\n\n`)
      }
    }
    await io.progress(task.files.length, task.files.length, null)
    const attempted = solved + failed.length
    const carried = skipped > 0 ? ` ${plural(skipped, 'file')} solved in an earlier run.` : ''
    const failures = failed.length > 0 ? ` Not solved: ${failed.slice(0, 3).join(' ')}${failed.length > 3 ? ` And ${failed.length - 3} more.` : ''}` : ''
    const note = `Solved ${solved} of ${plural(attempted, 'file')}.${carried}${failures}`
    return { state: solved === 0 && failed.length > 0 ? 'failed' : 'succeeded', note }
  }
}

// ── What the solves say about a target ──────────────────────────────────

export interface FileSolve {
  path: string
  kind: SkyFile['kind']
  night: string | null
  field: SolvedField | null
  source: SolveSource
  error: string | null
  solvedAt: Date
}

export interface MosaicCoverage {
  plan: MosaicPlan | null
  grouping: PanelGrouping
  /** Other targets whose lights are panels of this target's mosaic. */
  linkedTargetIds: string[]
}

export interface TargetGeometry {
  targetId: string
  solves: FileSolve[]
  /** Lights (one per folder per night) and masters not placed yet. */
  unsolved: number
  misfiled: Misfiled | null
  rotation: { nights: NightRotation[]; spreadDeg: number }
  mosaic: MosaicCoverage
}

export interface SkyGeometryDeps {
  store: SolveStore
  mosaics: MosaicStore
}

const nightOf = (f: SkyFile) => (f.capturedAt ? observingNightOf(f.capturedAt) : 'undated')

/** Solved groups of lights: each stored light solve stands for the lights of its target, night and folder. */
function solvedGroups(files: SkyFile[], solves: StoredSolve[]): SolvedGroup[] {
  const byPath = new Map(solves.filter(s => s.field).map(s => [s.path, s.field as SolvedField]))
  const lights = new Map<string, SkyFile[]>()
  for (const f of files) if (f.kind === 'light') lights.set(panelGroupKey(f), [...(lights.get(panelGroupKey(f)) ?? []), f])
  const groups: SolvedGroup[] = []
  for (const [key, members] of [...lights.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const solved = members.find(m => byPath.has(m.path))
    if (!solved) continue
    groups.push({
      key,
      targetId: solved.targetId,
      night: nightOf(solved),
      lightCount: members.length,
      integrationSec: members.reduce((s, m) => s + (m.exposureSec ?? 0), 0),
      field: byPath.get(solved.path) as SolvedField
    })
  }
  return groups
}

function savedPlan(target: MosaicTarget, saved: Pick<SavedMosaic, 'field' | 'rotationDeg' | 'overlap'> | null): MosaicPlan | null {
  if (!saved || target.raHours === null || target.decDeg === null || !target.sizeArcmin) return null
  return planMosaic({
    centre: { raDeg: target.raHours * 15, decDeg: target.decDeg },
    targetWidthArcmin: target.sizeArcmin,
    targetHeightArcmin: target.sizeArcmin,
    field: saved.field,
    rotationDeg: saved.rotationDeg,
    overlap: saved.overlap
  })
}

/**
 * Panels of a target's mosaic: its own solved lights, and other targets' lights whose fields
 * overlap them or a tile of its plan. Only saving a plan records the other targets found this way
 * as part of its mosaic (SKY-011); looking never writes.
 */
async function coverage(
  deps: SkyGeometryDeps,
  targetId: string,
  plan: MosaicPlan | null,
  allFiles: SkyFile[],
  allSolves: StoredSolve[],
  /** Set only when the user saves a plan. */
  link = false
): Promise<MosaicCoverage> {
  const groups = solvedGroups(allFiles, allSolves)
  const own = groups.filter(g => g.targetId === targetId)
  const anchors = [
    ...own.map(g => footprintOf(g.field)),
    ...(plan?.tiles ?? []).map(t => ({ raDeg: t.raDeg, decDeg: t.decDeg, widthDeg: plan?.field.widthDeg ?? 0, heightDeg: plan?.field.heightDeg ?? 0, rotationDeg: plan?.rotationDeg ?? 0 }))
  ]
  const others = groups.filter(g => g.targetId !== targetId && overlapsAny(g.field, anchors))
  const grouping = groupPanels([...own, ...others], plan)
  const inMosaic = new Set(grouping.mosaic)
  const linkedTargetIds = [...new Set(grouping.panels.filter(p => inMosaic.has(p.id) || p.tile !== null).flatMap(p => p.targetIds))].filter(id => id !== targetId).sort()
  if (link && linkedTargetIds.length > 0) await deps.mosaics.linkPanels(targetId, linkedTargetIds)
  return { plan, grouping, linkedTargetIds }
}

export type DescribeTargetGeometry = (targetId: string) => Promise<TargetGeometry | null>

/**
 * A target's solves, whether it may be filed under the wrong name (SKY-005), its field rotation by
 * night (SKY-006) and its mosaic panels (SKY-011).
 */
export function makeDescribeTargetGeometry(deps: SkyGeometryDeps): DescribeTargetGeometry {
  return async targetId => {
    const target = await deps.mosaics.target(targetId)
    if (!target) return null
    const [allFiles, allSolves, saved] = await Promise.all([deps.store.files(), deps.store.solves(), deps.mosaics.plan(targetId)])
    const files = allFiles.filter(f => f.targetId === targetId)
    const byPath = new Map(allSolves.map(s => [s.path, s]))
    const solves: FileSolve[] = files
      .filter(f => byPath.has(f.path))
      .map(f => {
        const s = byPath.get(f.path) as StoredSolve
        return { path: f.path, kind: f.kind, night: f.capturedAt ? observingNightOf(f.capturedAt) : null, field: s.field, source: s.source, error: s.error, solvedAt: s.solvedAt }
      })
      .sort((a, b) => (a.night ?? '').localeCompare(b.night ?? '') || a.path.localeCompare(b.path))
    const placed = solves.filter(s => s.field)
    const catalogue = target.raHours !== null && target.decDeg !== null ? { raDeg: target.raHours * 15, decDeg: target.decDeg } : null
    return {
      targetId,
      solves,
      // A failed solve is not a placed file: it is solved again.
      unsolved: planSolves(files, new Set(placed.map(s => s.path))).toSolve.length,
      misfiled: misfiledCheck(catalogue, placed.map(s => s.field as SolvedField)),
      rotation: rotationByNight(placed.filter(s => s.kind === 'light' && s.night).map(s => ({ night: s.night as string, field: s.field as SolvedField }))),
      mosaic: await coverage(deps, targetId, savedPlan(target, saved), allFiles, allSolves)
    }
  }
}

// ── The mosaic planner ──────────────────────────────────────────────────

export interface MosaicPlannerDeps extends SkyGeometryDeps {
  settings: PlanningSettings
  ephemeris: Ephemeris
  clock: Clock
}

export interface MosaicRequestOptions {
  targetId: string
  /** One panel's field; the saved plan's, else the target's solved lights', when left out. */
  field?: { widthDeg: number; heightDeg: number }
  rotationDeg?: number
  overlap?: number
}

export interface MosaicTileView {
  tile: number
  /** Integration captured for the tile so far, from solved lights. */
  capturedSec: number
  lightCount: number
  /** What the tile still needs for the target's goal; null with no goal. */
  neededSec: number | null
}

export type MosaicPlanResult =
  | { status: 'no-target' }
  | { status: 'no-position'; target: MosaicTarget }
  | { status: 'no-size'; target: MosaicTarget }
  | { status: 'no-field'; target: MosaicTarget }
  | {
      status: 'ok'
      target: MosaicTarget
      plan: MosaicPlan
      /** Where the field came from. */
      fieldFrom: 'request' | 'saved' | 'solves'
      saved: SavedMosaic | null
      tiles: MosaicTileView[]
      /** Each coming night and whether every panel clears the altitude limit; null without a site. */
      nights: MosaicNight[] | null
    }

export type PlanMosaicForTarget = (request: MosaicRequestOptions) => Promise<MosaicPlanResult>

/** Default overlap between neighbouring panels. */
export const DEFAULT_MOSAIC_OVERLAP = 0.2
/** Nights ahead the planner marks. */
export const MOSAIC_NIGHTS = 90

async function comingSkies(deps: Pick<MosaicPlannerDeps, 'settings' | 'ephemeris' | 'clock'>, count: number) {
  const site = await deps.settings.site()
  if (!site) return null
  const nights = nightsFrom(siteNightOf(deps.clock.now(), site.longitudeDeg), count, 1)
  const skies = (await Promise.all(nights.map(n => deps.ephemeris.nightSky(site, n)))).filter((s): s is NightSky => s !== null)
  return { site, skies }
}

/** The median field of a target's solved lights, for a planner with no equipment chosen. */
function fieldFromSolves(files: SkyFile[], solves: StoredSolve[]): { widthDeg: number; heightDeg: number } | null {
  const lights = new Set(files.filter(f => f.kind === 'light').map(f => f.path))
  const fields = solves.filter(s => s.field && lights.has(s.path)).map(s => s.field as SolvedField)
  if (fields.length === 0) return null
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]
  return { widthDeg: median(fields.map(fieldWidthDeg)), heightDeg: median(fields.map(fieldHeightDeg)) }
}

/**
 * The mosaic planner (SKY-007, SKY-008): a tile grid over the target with at least 15% overlap at
 * the chosen rotation, what each tile has and still needs for the goal, and the coming nights on
 * which every panel clears the altitude limit.
 */
export function makePlanMosaic(deps: MosaicPlannerDeps, nightsAhead = MOSAIC_NIGHTS): PlanMosaicForTarget {
  return async request => {
    const target = await deps.mosaics.target(request.targetId)
    if (!target) return { status: 'no-target' }
    if (target.raHours === null || target.decDeg === null) return { status: 'no-position', target }
    if (!target.sizeArcmin) return { status: 'no-size', target }
    const [saved, allFiles, allSolves] = await Promise.all([deps.mosaics.plan(target.id), deps.store.files(), deps.store.solves()])
    const own = allFiles.filter(f => f.targetId === target.id)
    const solvedField = fieldFromSolves(own, allSolves)
    const field = request.field ?? saved?.field ?? solvedField
    if (!field) return { status: 'no-field', target }
    const fieldFrom = request.field ? 'request' : saved ? 'saved' : 'solves'
    const plan = savedPlan(target, {
      field,
      rotationDeg: request.rotationDeg ?? saved?.rotationDeg ?? 0,
      overlap: request.overlap ?? saved?.overlap ?? DEFAULT_MOSAIC_OVERLAP
    }) as MosaicPlan
    const { grouping } = await coverage(deps, target.id, plan, allFiles, allSolves)
    const tiles = grouping.tiles.map(t => ({
      tile: t.tile,
      capturedSec: t.integrationSec,
      lightCount: t.lightCount,
      neededSec: target.goalSec === null ? null : Math.max(0, target.goalSec - t.integrationSec)
    }))
    const sky = await comingSkies(deps, nightsAhead)
    return {
      status: 'ok',
      target,
      plan,
      fieldFrom,
      saved,
      tiles,
      nights: sky ? mosaicNights(sky.skies, sky.site, plan.tiles) : null
    }
  }
}

export type SaveMosaicPlan = (targetId: string, plan: Pick<SavedMosaic, 'field' | 'rotationDeg' | 'overlap'>) => Promise<SavedMosaic>

/**
 * Keeps the plan the user chose, so Next actions can name tiles with no lights (SKY-012), and links
 * other targets whose lights are its panels as part of the mosaic (SKY-011).
 */
export function makeSaveMosaicPlan(deps: SkyGeometryDeps & { clock: Clock }): SaveMosaicPlan {
  return async (targetId, plan) => {
    const saved: SavedMosaic = { targetId, ...plan, savedAt: deps.clock.now() }
    await deps.mosaics.savePlan(saved)
    const target = await deps.mosaics.target(targetId)
    if (target) {
      const [allFiles, allSolves] = await Promise.all([deps.store.files(), deps.store.solves()])
      await coverage(deps, targetId, savedPlan(target, saved), allFiles, allSolves, true)
    }
    return saved
  }
}

export type ExportMosaicCsv = (request: MosaicRequestOptions) => Promise<{ fileName: string; csv: string } | null>

/** The tiles as CSV with the hours each still needs (SKY-009). */
export function makeExportMosaicCsv(plan: PlanMosaicForTarget): ExportMosaicCsv {
  return async request => {
    const result = await plan(request)
    if (result.status !== 'ok') return null
    const needed = new Map(result.tiles.map(t => [t.tile, t.neededSec === null ? null : t.neededSec / 3600]))
    const safe = result.target.name.replace(/[^\w.-]+/g, '_')
    return { fileName: `${safe}-mosaic.csv`, csv: mosaicCsv(result.plan, tile => needed.get(tile) ?? null) }
  }
}

// ── Tiles with no lights, for Next actions ──────────────────────────────

/** A tile with no lights: the coming nights it clears the altitude limit, of the nights looked at. */
export type MosaicGap = MosaicTileGap

export type ListMosaicGaps = () => Promise<MosaicGap[]>

/** Nights ahead Next actions look for a tile's visibility. */
export const GAP_NIGHTS = 30

/** Every saved mosaic's tiles that have no lights yet, with the coming nights each is visible (SKY-012). */
export function makeListMosaicGaps(deps: MosaicPlannerDeps, nightsAhead = GAP_NIGHTS): ListMosaicGaps {
  return async () => {
    const saved = await deps.mosaics.plans()
    if (saved.length === 0) return []
    const [allFiles, allSolves, sky] = await Promise.all([deps.store.files(), deps.store.solves(), comingSkies(deps, nightsAhead)])
    const gaps: MosaicGap[] = []
    for (const s of saved) {
      const target = await deps.mosaics.target(s.targetId)
      const plan = target ? savedPlan(target, s) : null
      if (!target || !plan || plan.fitsOneField) continue
      const { grouping } = await coverage(deps, target.id, plan, allFiles, allSolves)
      for (const t of grouping.tiles) {
        if (t.lightCount > 0) continue
        const tile = plan.tiles[t.tile - 1]
        const nights = sky ? mosaicNights(sky.skies, sky.site, [tile]).filter(n => n.clear).map(n => n.night) : []
        gaps.push({ targetId: target.id, targetName: target.name, tile: t.tile, of: plan.tiles.length, nights, lookedAt: sky?.skies.length ?? 0, goalSec: target.goalSec })
      }
    }
    return gaps
  }
}
