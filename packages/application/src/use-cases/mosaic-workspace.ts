import {
  DEFAULT_GRID_OVERLAP,
  dragGrid,
  formatDecDms,
  formatRaHms,
  gridCsv,
  gridExportName,
  gridExtent,
  gridFromSolve,
  gridJson,
  gridProblems,
  layoutGrid,
  mosaicNights,
  sameGeometry,
  shiftGrid,
  toDrawing,
  type GridDefinition,
  type PlannedPanel
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { MosaicWorkspaceStore, StoredRevision, WorkspaceRecord } from '../ports/mosaic-workspace'
import type { Ephemeris, PlanningSettings } from '../ports/sky'
import type { SolveStore } from '../ports/sky-geometry'
import { comingSkies, type PlanMosaicForTarget } from './sky-geometry'

// ── Previewing a grid ───────────────────────────────────────────────────

export interface PanelDrawing {
  panel: PlannedPanel
  ra: string
  dec: string
  /** The footprint on a drawing about the grid's centre (x west, y north, degrees). */
  outline: { x: number; y: number }[]
}

export type GridPreview =
  | { ok: true; grid: GridDefinition; panels: PanelDrawing[]; extent: { widthDeg: number; heightDeg: number } }
  | { ok: false; grid: GridDefinition; problems: string[] }

/** A grid with its panels drawn about its centre, or what is wrong with it (MO-001, MO-003). */
export function previewGrid(grid: GridDefinition): GridPreview {
  const problems = gridProblems(grid)
  if (problems.length > 0) return { ok: false, grid, problems }
  const panels = layoutGrid(grid).map(panel => ({
    panel,
    ra: formatRaHms(panel.centre.raDeg),
    dec: formatDecDms(panel.centre.decDeg),
    outline: panel.footprint.vertices.map(v => toDrawing(grid.centre, v) ?? { x: 0, y: 0 })
  }))
  return { ok: true, grid, panels, extent: gridExtent(grid) }
}

/**
 * What the editor asks to change: the grid as typed, a nudge along its own axes (`shift`), and a
 * drag on the drawing (`drag`, x west and y north, degrees).
 */
export interface GridEdit {
  grid: GridDefinition
  shift?: { rightDeg: number; upDeg: number }
  drag?: { xDeg: number; yDeg: number }
}

/** The grid after an edit, recomputed from its definition (MO-002): moving it moves its centre, never its pixels. */
export function editGrid(edit: GridEdit): GridPreview {
  let grid = edit.shift ? shiftGrid(edit.grid, edit.shift.rightDeg, edit.shift.upDeg) : edit.grid
  if (edit.drag) grid = dragGrid(grid, edit.drag.xDeg, edit.drag.yDeg)
  return previewGrid(grid)
}

// ── Creating, revising and listing ──────────────────────────────────────

export interface WorkspaceDeps {
  store: MosaicWorkspaceStore
  clock: Clock
}

export type CreateWorkspaceResult = { ok: true; workspace: WorkspaceRecord } | { ok: false; problems: string[] }

export type CreateWorkspace = (input: { name: string; targetId?: string | null; grid: GridDefinition; note?: string | null }) => Promise<CreateWorkspaceResult>

/** Starts a workspace at revision 1 with its panels laid out and kept (MO-001). */
export function makeCreateWorkspace(deps: WorkspaceDeps): CreateWorkspace {
  return async input => {
    const name = input.name.trim()
    const problems = [...(name === '' ? ['The mosaic needs a name.'] : []), ...gridProblems(input.grid)]
    if (problems.length > 0) return { ok: false, problems }
    const now = deps.clock.now()
    const workspace = await deps.store.create(
      { name, targetId: input.targetId ?? null, createdAt: now },
      { grid: input.grid, panels: layoutGrid(input.grid), note: input.note ?? null, savedAt: now }
    )
    return { ok: true, workspace }
  }
}

export type SaveRevisionResult =
  | { status: 'saved'; revision: number }
  | { status: 'unchanged'; revision: number }
  | { status: 'invalid'; problems: string[] }
  | { status: 'no-workspace' }

export type SaveWorkspaceRevision = (workspaceId: string, grid: GridDefinition, note?: string | null) => Promise<SaveRevisionResult>

/**
 * Saves a changed grid as the next revision and keeps every earlier one as it was (MO-002,
 * MO-010). A grid that lays out the same panels as the latest revision is not saved again.
 */
export function makeSaveWorkspaceRevision(deps: WorkspaceDeps): SaveWorkspaceRevision {
  return async (workspaceId, grid, note = null) => {
    const workspace = await deps.store.get(workspaceId)
    if (!workspace) return { status: 'no-workspace' }
    const problems = gridProblems(grid)
    if (problems.length > 0) return { status: 'invalid', problems }
    const latest = await deps.store.revision(workspaceId, workspace.latestRevision)
    if (latest && sameGeometry(latest.grid, grid)) return { status: 'unchanged', revision: latest.revision }
    const revision = workspace.latestRevision + 1
    await deps.store.addRevision({ workspaceId, revision, grid, panels: layoutGrid(grid), note, savedAt: deps.clock.now() })
    return { status: 'saved', revision }
  }
}

// ── Describing a workspace ──────────────────────────────────────────────

export interface PanelOutlook {
  panelId: string
  /** Coming nights on which the panel clears the altitude limit for the minimum usable hours. */
  clearNights: number
  /** The first of them, or null. */
  firstClear: string | null
}

export interface RevisionSummary {
  revision: number
  savedAt: Date
  note: string | null
  rows: number
  columns: number
}

export interface WorkspaceView {
  workspace: WorkspaceRecord
  revision: StoredRevision
  drawing: Extract<GridPreview, { ok: true }>
  revisions: RevisionSummary[]
  /** Per panel, the coming nights it is up; null with no site set. */
  outlook: { nightsLookedAt: number; panels: PanelOutlook[] } | null
}

export interface DescribeWorkspaceDeps {
  store: MosaicWorkspaceStore
  settings: PlanningSettings
  ephemeris: Ephemeris
  clock: Clock
}

/** Nights ahead a workspace looks for each panel's visibility. */
export const WORKSPACE_NIGHTS = 30

export type DescribeWorkspace = (workspaceId: string, revision?: number) => Promise<WorkspaceView | null>

/**
 * A workspace at a revision (the latest by default): its panels drawn from the panels kept with
 * that revision, every revision it has had, and the coming nights each panel clears the altitude
 * limit from the site.
 */
export function makeDescribeWorkspace(deps: DescribeWorkspaceDeps, nightsAhead = WORKSPACE_NIGHTS): DescribeWorkspace {
  return async (workspaceId, wanted) => {
    const workspace = await deps.store.get(workspaceId)
    if (!workspace) return null
    const revisions = await deps.store.revisions(workspaceId)
    const revision = revisions.find(r => r.revision === (wanted ?? workspace.latestRevision))
    if (!revision) return null
    const drawing: Extract<GridPreview, { ok: true }> = {
      ok: true,
      grid: revision.grid,
      // The panels as they were saved, so an old revision draws as it was even if the layout rules change.
      panels: revision.panels.map(panel => ({
        panel,
        ra: formatRaHms(panel.centre.raDeg),
        dec: formatDecDms(panel.centre.decDeg),
        outline: panel.footprint.vertices.map(v => toDrawing(revision.grid.centre, v) ?? { x: 0, y: 0 })
      })),
      extent: gridExtent(revision.grid)
    }
    const sky = await comingSkies(deps, nightsAhead)
    const outlook = sky
      ? {
          nightsLookedAt: sky.skies.length,
          panels: revision.panels.map(p => {
            const clear = mosaicNights(sky.skies, sky.site, [p.centre]).filter(n => n.clear)
            return { panelId: p.id, clearNights: clear.length, firstClear: clear[0]?.night ?? null }
          })
        }
      : null
    return {
      workspace,
      revision,
      drawing,
      revisions: revisions.map(r => ({ revision: r.revision, savedAt: r.savedAt, note: r.note, rows: r.grid.rows, columns: r.grid.columns })),
      outlook
    }
  }
}

export type ListWorkspaces = () => Promise<(WorkspaceRecord & { panels: number; rows: number; columns: number })[]>

export function makeListWorkspaces(deps: Pick<WorkspaceDeps, 'store'>): ListWorkspaces {
  return async () => {
    const all = await deps.store.list()
    return Promise.all(
      all.map(async w => {
        const latest = await deps.store.revision(w.id, w.latestRevision)
        return { ...w, panels: latest?.panels.length ?? 0, rows: latest?.grid.rows ?? 0, columns: latest?.grid.columns ?? 0 }
      })
    )
  }
}

// ── Export ──────────────────────────────────────────────────────────────

export type ExportWorkspace = (workspaceId: string, format: 'csv' | 'json', revision?: number) => Promise<{ fileName: string; text: string } | null>

/** A revision's panels as CSV or JSON, with each panel's id, ICRS centre, position angle, footprint and the revision (MO-012). */
export function makeExportWorkspace(deps: Pick<WorkspaceDeps, 'store'>): ExportWorkspace {
  return async (workspaceId, format, wanted) => {
    const workspace = await deps.store.get(workspaceId)
    if (!workspace) return null
    const revision = await deps.store.revision(workspaceId, wanted ?? workspace.latestRevision)
    if (!revision) return null
    const input = { name: workspace.name, revision: revision.revision, grid: revision.grid, panels: revision.panels }
    return { fileName: gridExportName(workspace.name, revision.revision, format), text: format === 'csv' ? gridCsv(input) : gridJson(input) }
  }
}

// ── From the Sky planner's plan ─────────────────────────────────────────

export type WorkspaceFromTarget = (targetId: string) => Promise<CreateWorkspaceResult | { ok: false; problems: string[] }>

/**
 * Opens a target's mosaic plan from the Sky planner (spec 024) as a workspace: the same grid,
 * rows and columns, overlap and turn, centred on the target, kept as revision 1.
 */
export function makeWorkspaceFromTarget(deps: WorkspaceDeps & { planMosaic: PlanMosaicForTarget }): WorkspaceFromTarget {
  const create = makeCreateWorkspace(deps)
  return async targetId => {
    const result = await deps.planMosaic({ targetId })
    if (result.status !== 'ok') {
      const why: Record<typeof result.status, string> = {
        'no-target': 'That target is not in the catalogue.',
        'no-position': 'The target has no catalogue position to centre a mosaic on.',
        'no-size': 'The target has no catalogue size, so the Sky planner has no grid for it.',
        'no-field': 'No field of view is known: pick a scope and camera on the Sky planner, or plate solve its lights.'
      }
      return { ok: false, problems: [why[result.status]] }
    }
    const { plan, target } = result
    return create({
      name: `${target.name} mosaic`,
      targetId: target.id,
      note: 'Opened from the Sky planner',
      grid: {
        centre: { raDeg: (target.raHours as number) * 15, decDeg: target.decDeg as number },
        // The Sky planner's rotation already turns the panels' up axis east of north.
        positionAngleDeg: plan.rotationDeg,
        rows: plan.rows,
        columns: plan.columns,
        overlapX: plan.overlap,
        overlapY: plan.overlap,
        field: { widthDeg: plan.field.widthDeg, heightDeg: plan.field.heightDeg, source: 'target-plan', label: `The Sky planner's plan for ${target.name}` }
      }
    })
  }
}

export type GridFromSolvedFile = (path: string) => Promise<GridDefinition | null>

/**
 * A one-panel grid over exactly what a solved file shows: its centre, its turn and its field
 * (MO-001). Rows, columns and overlap are the editor's to change. Null for a file not placed.
 */
export function makeGridFromSolvedFile(deps: { store: SolveStore }): GridFromSolvedFile {
  return async path => {
    const [solve] = await deps.store.solves([path])
    if (!solve?.field) return null
    return { ...gridFromSolve(solve.field, path.split(/[\\/]/).pop() ?? path), rows: 1, columns: 1, overlapX: DEFAULT_GRID_OVERLAP, overlapY: DEFAULT_GRID_OVERLAP }
  }
}

export type ArchiveWorkspace = (workspaceId: string, archived: boolean) => Promise<boolean>

/** Archives a workspace or brings it back; its revisions are kept either way. */
export function makeArchiveWorkspace(deps: Pick<WorkspaceDeps, 'store'>): ArchiveWorkspace {
  return async (workspaceId, archived) => {
    if (!(await deps.store.get(workspaceId))) return false
    await deps.store.update(workspaceId, { status: archived ? 'archived' : 'active' })
    return true
  }
}
