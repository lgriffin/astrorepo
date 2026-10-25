import {
  assignmentOf,
  gridProblems,
  layoutGrid,
  observingNightOf,
  panelChanges,
  panelGroupKey,
  placeFootprint,
  solvedFootprint,
  toDrawing,
  type Assignment,
  type AssignmentOverride,
  type GridDefinition,
  type PanelChange,
  type Placement,
  type SkyFile,
  type SkyPolygon,
  type SolvedField
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { MosaicAssignmentStore, MosaicWorkspaceStore, StoredRevision, WorkspaceRecord } from '../ports/mosaic-workspace'
import type { MosaicStore, SolveStore, StoredSolve } from '../ports/sky-geometry'

/**
 * One thing that is placed on a mosaic: a master, or the lights of one target from one folder on
 * one night, which one plate solve stands for (spec 024 solves one light per folder per night).
 * Its id is the path of the file its position comes from, else of its first file.
 */
export interface Capture {
  id: string
  kind: 'lights' | 'master'
  targetId: string
  night: string | null
  folder: string
  /** Every file it stands for: its lights, or the master alone. */
  paths: string[]
  /** Exposure of each file, in the order of `paths`; null where the header has none. */
  exposures: (number | null)[]
  filters: string[]
  /** The file whose thumbnail shows it. */
  fileId: string | null
  field: SolvedField | null
  /** Why the last solve failed, for a capture with no field. */
  solveError: string | null
}

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

/** The index's lights and masters as captures, each with the field its solve gives. */
export function capturesFrom(files: SkyFile[], solves: StoredSolve[]): Capture[] {
  const byPath = new Map(solves.map(s => [s.path, s]))
  const groups = new Map<string, SkyFile[]>()
  const captures: Capture[] = []
  const make = (kind: Capture['kind'], members: SkyFile[]): Capture => {
    const solved = members.find(m => byPath.get(m.path)?.field)
    const tried = members.find(m => byPath.has(m.path))
    const anchor = solved ?? tried ?? members[0]
    const solve = byPath.get(anchor.path)
    return {
      id: anchor.path,
      kind,
      targetId: anchor.targetId,
      night: anchor.capturedAt ? observingNightOf(anchor.capturedAt) : null,
      folder: anchor.folder,
      paths: members.map(m => m.path),
      exposures: members.map(m => m.exposureSec),
      filters: [...new Set(members.map(m => m.filter?.trim()).filter((f): f is string => !!f))].sort(),
      fileId: anchor.fileId ?? null,
      field: solve?.field ?? null,
      solveError: solve && !solve.field ? solve.error : null
    }
  }
  for (const f of files) {
    if (f.kind === 'master') captures.push(make('master', [f]))
    else groups.set(panelGroupKey(f), [...(groups.get(panelGroupKey(f)) ?? []), f])
  }
  for (const members of groups.values()) captures.push(make('lights', [...members].sort((a, b) => a.path.localeCompare(b.path))))
  return captures.sort((a, b) => (a.night ?? '').localeCompare(b.night ?? '') || a.id.localeCompare(b.id))
}

export interface PlacedCapture {
  capture: Capture
  footprint: SkyPolygon
  /** The footprint on the workspace's drawing (x west, y north, degrees about the grid's centre). */
  outline: { x: number; y: number }[]
  placement: Placement
  assignment: Assignment
  override: AssignmentOverride | null
}

export interface MissingCapture {
  captureId: string
  override: AssignmentOverride
  /** Where it last pointed, from its stored solve; null when it was never solved. */
  lastField: SolvedField | null
}

export interface CapturePlacements {
  workspace: WorkspaceRecord
  revision: StoredRevision
  /** Captures whose solved footprint meets at least one panel, or that the user put on one. */
  placed: PlacedCapture[]
  /** Captures of the workspace's targets with no position yet (MO-006). */
  unsolved: Capture[]
  /** Captures of the workspace's targets that are solved but fall outside every panel. */
  outside: PlacedCapture[]
  /** Overrides on files the index no longer lists (MO-013). */
  missing: MissingCapture[]
  /** The targets whose unsolved files are listed: the workspace's, and those linked to it as panels. */
  targetIds: string[]
}

export interface PlacementDeps {
  workspaces: MosaicWorkspaceStore
  assignments: MosaicAssignmentStore
  solves: SolveStore
  mosaics: Pick<MosaicStore, 'linked'>
}

export type PlaceCaptures = (workspaceId: string, revision?: number) => Promise<CapturePlacements | null>

/**
 * Where every capture lands on a revision of a workspace (MO-004 to MO-006, MO-009, MO-013): each
 * solved light group and master whose footprint meets a panel, with every panel it meets and the
 * share of each; the workspace's own captures not solved yet, or outside the grid; and the user's
 * overrides, kept apart, on files the index no longer has. Nothing is written.
 */
export function makePlaceCaptures(deps: PlacementDeps): PlaceCaptures {
  return async (workspaceId, wanted) => {
    const workspace = await deps.workspaces.get(workspaceId)
    if (!workspace) return null
    const revision = await deps.workspaces.revision(workspaceId, wanted ?? workspace.latestRevision)
    if (!revision) return null
    const [files, solves, overrides] = await Promise.all([deps.solves.files(), deps.solves.solves(), deps.assignments.overrides(workspaceId)])
    const targetIds = workspace.targetId ? [workspace.targetId, ...(await deps.mosaics.linked(workspace.targetId))] : []
    const own = new Set(targetIds)
    const byCapture = new Map(overrides.map(o => [o.captureId, o]))
    const panelIds = new Set(revision.panels.map(p => p.id))
    const placed: PlacedCapture[] = []
    const outside: PlacedCapture[] = []
    const unsolved: Capture[] = []
    const captures = capturesFrom(files, solves)
    for (const capture of captures) {
      const override = byCapture.get(capture.id) ?? null
      if (!capture.field) {
        if (own.has(capture.targetId) || override) unsolved.push(capture)
        continue
      }
      const footprint = solvedFootprint(capture.field)
      const placement = placeFootprint(footprint, revision.panels)
      if (placement.intersections.length === 0 && !override && !own.has(capture.targetId)) continue
      const entry: PlacedCapture = {
        capture,
        footprint,
        outline: footprint.vertices.map(v => toDrawing(revision.grid.centre, v) ?? { x: 0, y: 0 }),
        placement,
        assignment: assignmentOf(placement, override, revision.revision, panelIds),
        override
      }
      if (placement.intersections.length === 0 && override?.action !== 'assign') outside.push(entry)
      else placed.push(entry)
    }
    const known = new Set(captures.map(c => c.id))
    const gone = overrides.filter(o => !known.has(o.captureId))
    const lastSolves = new Map((await deps.solves.solves(gone.map(o => o.captureId))).map(s => [s.path, s.field]))
    const missing = gone.map(o => ({ captureId: o.captureId, override: o, lastField: lastSolves.get(o.captureId) ?? null }))
    return { workspace, revision, placed, unsolved, outside, missing, targetIds }
  }
}

export type AssignCapture = (
  workspaceId: string,
  captureId: string,
  change: { action: 'assign'; panelId: string; reason?: string | null } | { action: 'exclude'; reason?: string | null } | { action: 'clear' }
) => Promise<{ ok: true } | { ok: false; reason: string }>

/**
 * The user's say over one capture (MO-009): put it on a panel of the latest revision, leave it
 * out, or clear what they said so the computed placement counts again. Kept apart from what is
 * computed, with the revision it was made on.
 */
export function makeAssignCapture(deps: Pick<PlacementDeps, 'workspaces' | 'assignments'> & { clock: Clock }): AssignCapture {
  return async (workspaceId, captureId, change) => {
    const workspace = await deps.workspaces.get(workspaceId)
    if (!workspace) return { ok: false, reason: 'That mosaic no longer exists.' }
    if (change.action === 'clear') {
      await deps.assignments.clear(workspaceId, captureId)
      return { ok: true }
    }
    const latest = await deps.workspaces.revision(workspaceId, workspace.latestRevision)
    if (change.action === 'assign' && !latest?.panels.some(p => p.id === change.panelId)) {
      return { ok: false, reason: `Revision ${workspace.latestRevision} has no panel ${change.panelId}.` }
    }
    await deps.assignments.set(workspaceId, {
      captureId,
      action: change.action,
      panelId: change.action === 'assign' ? change.panelId : null,
      reason: change.reason?.trim() || null,
      revision: workspace.latestRevision,
      at: deps.clock.now()
    })
    return { ok: true }
  }
}

export interface RevisionChange extends PanelChange {
  label: string
  /** The user put it on a panel by hand; their choice stays, but is shown for review. */
  overridden: boolean
}

export type PreviewRevisionChanges = (workspaceId: string, grid: GridDefinition) => Promise<RevisionChange[] | null>

/**
 * Before a changed grid is saved: the captures whose panel would change, so the change is seen
 * before it is made (MO-010). Overrides stay as they are and are only flagged.
 */
export function makePreviewRevisionChanges(deps: PlacementDeps): PreviewRevisionChanges {
  const place = makePlaceCaptures(deps)
  return async (workspaceId, grid) => {
    const now = await place(workspaceId)
    if (!now) return null
    // A grid that cannot be laid out moves nothing yet; saving it is refused with its problems.
    if (gridProblems(grid).length > 0) return []
    const after = layoutGrid(grid)
    const changes = panelChanges(now.placed.map(p => ({ captureId: p.capture.id, footprint: p.footprint })), now.revision.panels, after)
    const byId = new Map(now.placed.map(p => [p.capture.id, p]))
    return changes.map(c => {
      const p = byId.get(c.captureId) as PlacedCapture
      return { ...c, label: captureLabel(p.capture), overridden: p.override?.action === 'assign' }
    })
  }
}

/** "48 lights, 2026-10-01, M31/panel2" or "master stack.fit". */
export function captureLabel(c: Capture): string {
  if (c.kind === 'master') return `master ${fileName(c.id)}`
  const folder = c.folder.split(/[\\/]/).slice(-2).join('/')
  return `${c.paths.length} ${c.paths.length === 1 ? 'light' : 'lights'}, ${c.night ?? 'undated'}, ${folder}`
}
