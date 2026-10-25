import type { CreateWorkspaceResult, GridPreview, ListWorkspaces, SaveRevisionResult, WorkspaceView as CoreWorkspaceView } from '@astro/application'
import { formatDecDms, formatRaHms, type FieldSource, type GridDefinition } from '@astro/domain'
import type { WorkspaceDrawingView, WorkspaceGridInput, WorkspaceSaveView, WorkspaceSummaryView, WorkspaceView } from '@shared/types'
import { fieldSize } from './sky-geometry-presenter'

/** The editor's grid as the core's definition. */
export function toGridDefinition(g: WorkspaceGridInput): GridDefinition {
  return {
    centre: { raDeg: g.ra_deg, decDeg: g.dec_deg },
    positionAngleDeg: g.position_angle_deg,
    rows: g.rows,
    columns: g.columns,
    overlapX: g.overlap_x,
    overlapY: g.overlap_y,
    field: { widthDeg: g.field_width_deg, heightDeg: g.field_height_deg, source: g.field_source, label: g.field_label ?? null }
  }
}

export function toGridInput(g: GridDefinition): WorkspaceGridInput {
  return {
    ra_deg: g.centre.raDeg,
    dec_deg: g.centre.decDeg,
    position_angle_deg: g.positionAngleDeg,
    rows: g.rows,
    columns: g.columns,
    overlap_x: g.overlapX,
    overlap_y: g.overlapY,
    field_width_deg: g.field.widthDeg,
    field_height_deg: g.field.heightDeg,
    field_source: g.field.source,
    field_label: g.field.label
  }
}

const pct = (f: number) => `${Math.round(f * 100)}%`
const signed = (deg: number) => `${deg > 0 ? '+' : ''}${deg.toFixed(1)}°`
const size = (rows: number, columns: number) => `${rows} × ${columns} ${rows * columns === 1 ? 'panel' : 'panels'}`

const SOURCE: Record<FieldSource, string> = { equipment: 'equipment', manual: 'typed in', solve: 'a solved file', 'target-plan': "the Sky planner's plan" }

/** "Field 43′ × 77′ from Seestar S50 (equipment)" */
export function fieldFrom(g: GridDefinition): string {
  const from = g.field.label ? `${g.field.label} (${SOURCE[g.field.source]})` : SOURCE[g.field.source]
  return `Field ${fieldSize(g.field.widthDeg, g.field.heightDeg)} from ${from}`
}

function gridSummary(g: GridDefinition, extent: { widthDeg: number; heightDeg: number }): string {
  const overlap = g.overlapX === g.overlapY ? `${pct(g.overlapX)} overlap across and down` : `${pct(g.overlapX)} overlap across, ${pct(g.overlapY)} down`
  return `${size(g.rows, g.columns)}, ${overlap}, up axis at ${signed(g.positionAngleDeg)} east of north, covering ${fieldSize(extent.widthDeg, extent.heightDeg)}.`
}

type Outlook = CoreWorkspaceView['outlook']

/** The drawing the canvas renders: panel outlines on the grid's tangent plane, with text for each panel. */
export function toDrawingView(preview: GridPreview, outlook: Outlook = null): WorkspaceDrawingView {
  const g = preview.grid
  const base = { grid: toGridInput(g), centre: `${formatRaHms(g.centre.raDeg)} ${formatDecDms(g.centre.decDeg)}` }
  if (!preview.ok) return { ok: false, problems: preview.problems, summary: null, panels: [], bounds: null, ...base }
  const byPanel = new Map((outlook?.panels ?? []).map(p => [p.panelId, p]))
  const points = preview.panels.flatMap(p => p.outline)
  const reach = (k: 'x' | 'y') => Math.max(...points.map(p => Math.abs(p[k])))
  const half = Math.max(reach('x'), reach('y')) * 1.1
  return {
    ...base,
    ok: true,
    problems: [],
    summary: gridSummary(g, preview.extent),
    panels: preview.panels.map(d => {
      const o = byPanel.get(d.panel.id)
      return {
        id: d.panel.id,
        row: d.panel.row,
        column: d.panel.column,
        ra: d.ra,
        dec: d.dec,
        raDeg: d.panel.centre.raDeg,
        decDeg: d.panel.centre.decDeg,
        positionAngle: signed(d.panel.positionAngleDeg),
        outline: d.outline,
        outlook: o && outlook
          ? o.clearNights === 0
            ? `Not clear of the altitude limit on any of the next ${outlook.nightsLookedAt} nights`
            : `Clear on ${o.clearNights} of the next ${outlook.nightsLookedAt} nights, from ${o.firstClear}`
          : null,
        clearNights: o ? o.clearNights : null
      }
    }),
    bounds: { x: half, y: half }
  }
}

export function toWorkspaceView(v: CoreWorkspaceView): WorkspaceView {
  return {
    id: v.workspace.id,
    name: v.workspace.name,
    targetId: v.workspace.targetId,
    archived: v.workspace.status === 'archived',
    revision: v.revision.revision,
    latestRevision: v.workspace.latestRevision,
    savedAt: v.revision.savedAt.toISOString(),
    note: v.revision.note,
    fieldFrom: fieldFrom(v.revision.grid),
    drawing: toDrawingView(v.drawing, v.outlook),
    revisions: v.revisions.map(r => ({ revision: r.revision, savedAt: r.savedAt.toISOString(), note: r.note, size: size(r.rows, r.columns) })),
    outlookNote: v.outlook ? null : 'Set your site in Settings to see the nights each panel is up.'
  }
}

export function toWorkspaceSummaries(list: Awaited<ReturnType<ListWorkspaces>>): WorkspaceSummaryView[] {
  return list.map(w => ({
    id: w.id,
    name: w.name,
    targetId: w.targetId,
    archived: w.status === 'archived',
    createdAt: w.createdAt.toISOString(),
    revision: w.latestRevision,
    size: size(w.rows, w.columns)
  }))
}

export function toCreatedView(result: CreateWorkspaceResult): WorkspaceSaveView {
  return result.ok
    ? { ok: true, workspaceId: result.workspace.id, revision: 1, message: `${result.workspace.name} saved as revision 1.`, problems: [] }
    : { ok: false, workspaceId: null, revision: null, message: 'The mosaic was not saved.', problems: result.problems }
}

export function toRevisionSavedView(workspaceId: string, result: SaveRevisionResult): WorkspaceSaveView {
  switch (result.status) {
    case 'saved':
      return { ok: true, workspaceId, revision: result.revision, message: `Saved as revision ${result.revision}. Earlier revisions are kept.`, problems: [] }
    case 'unchanged':
      return { ok: true, workspaceId, revision: result.revision, message: `Nothing changed since revision ${result.revision}, so no new revision was saved.`, problems: [] }
    case 'invalid':
      return { ok: false, workspaceId, revision: null, message: 'The grid was not saved.', problems: result.problems }
    case 'no-workspace':
      return { ok: false, workspaceId: null, revision: null, message: 'That mosaic no longer exists.', problems: [] }
  }
}
