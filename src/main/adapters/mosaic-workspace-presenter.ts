import { captureLabel, type CapturePlacements, type WorkspaceCoverage, type CreateWorkspaceResult, type GridPreview, type ListWorkspaces, type PlacedCapture, type RevisionChange, type SaveRevisionResult, type WorkspaceView as CoreWorkspaceView } from '@astro/application'
import { formatDecDms, formatRaHms, type FieldSource, type GridDefinition } from '@astro/domain'
import type { WorkspaceCaptureView, WorkspaceCapturesView, WorkspaceChangeView, WorkspaceCoverageView, WorkspaceDrawingView, WorkspaceGridInput, WorkspaceSaveView, WorkspaceSummaryView, WorkspaceView } from '@shared/types'
import { formatDuration } from './job-presenter'
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
    case 'stale':
      return { ok: false, workspaceId, revision: result.revision, message: `Revision ${result.revision} was saved meanwhile, so this grid was not saved. Open the latest revision and try again.`, problems: [] }
  }
}

// ── Captures on a revision (X2) ─────────────────────────────────────────

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function toCaptureView(p: PlacedCapture): WorkspaceCaptureView {
  const known = p.capture.exposures.filter((e): e is number => e !== null)
  return {
    id: p.capture.id,
    label: captureLabel(p.capture),
    kind: p.capture.kind,
    targetId: p.capture.targetId,
    night: p.capture.night,
    files: p.capture.paths.length,
    exposure: known.length > 0 ? formatDuration(known.reduce((a, b) => a + b, 0)) : null,
    filters: p.capture.filters,
    fileId: p.capture.fileId,
    outline: p.outline,
    panels: p.placement.intersections.map(i => ({ panelId: i.panelId, share: percent(i.captureFraction), coverage: percent(i.panelCoverage) })),
    primary: p.placement.primary,
    panelId: p.assignment.panelId,
    source: p.assignment.source,
    state: p.assignment.state,
    note: p.assignment.note,
    reason: p.override?.reason ?? null
  }
}

/** Where a revision's captures land, for the canvas and its trays. */
export function toCapturesView(c: CapturePlacements): WorkspaceCapturesView {
  const placed = c.placed.map(toCaptureView)
  const panels = new Set(placed.map(p => p.panelId).filter(Boolean)).size
  const review = placed.filter(p => p.state === 'needs-review').length
  const conflicts = placed.filter(p => p.state === 'conflict').length
  const extras = [
    review > 0 ? `${review} to review` : null,
    conflicts > 0 ? count(conflicts, 'conflict') : null,
    c.unsolved.length > 0 ? `${c.unsolved.length} not solved yet` : null,
    c.outside.length > 0 ? `${c.outside.length} outside the grid` : null,
    c.missing.length > 0 ? `${c.missing.length} no longer in the index` : null
  ].filter(Boolean)
  const summary =
    placed.length === 0 && extras.length === 0
      ? 'No solved capture falls on this grid yet.'
      : `${count(placed.length, 'capture')} on ${count(panels, 'panel')}${extras.length ? `; ${extras.join(', ')}` : ''}.`
  return {
    revision: c.revision.revision,
    latestRevision: c.workspace.latestRevision,
    placed,
    outside: c.outside.map(toCaptureView),
    unsolved: c.unsolved.map(u => ({ id: u.id, label: captureLabel(u), targetId: u.targetId, solveError: u.solveError })),
    missing: c.missing.map(m => ({
      captureId: m.captureId,
      label: m.label,
      said: m.override.action === 'assign' ? `Put on ${m.override.panelId}` : 'Left out',
      reason: m.override.reason,
      lastCentre: m.lastField ? `${formatRaHms(m.lastField.raDeg)} ${formatDecDms(m.lastField.decDeg)}` : null
    })),
    targetIds: c.targetIds,
    summary
  }
}

export function toChangeViews(changes: RevisionChange[]): WorkspaceChangeView[] {
  return changes.map(c => ({ captureId: c.captureId, label: c.label, from: c.from, to: c.to, overridden: c.overridden, overridePanel: c.overridePanel }))
}

// ── Coverage (X3) ───────────────────────────────────────────────────────

const exposureText = (exposures: { filter: string; seconds: number }[]) =>
  exposures.length > 0 ? exposures.map(e => `${e.filter} ${formatDuration(e.seconds)}`).join(', ') : null
const depthText = (low: number, high: number) =>
  high <= 0 ? 'none' : low === high ? formatDuration(high) : `${low <= 0 ? 'none' : formatDuration(low)} to ${formatDuration(high)}`

/** How a revision is covered, for the heat map, the panel table and the next-session list. */
export function toCoverageView(c: WorkspaceCoverage): WorkspaceCoverageView {
  const panels = c.progress.map(p => ({
    panelId: p.panelId,
    state: p.state,
    coverage: percent(p.coverage.fraction),
    fraction: p.coverage.fraction,
    covered: p.coverage.covered,
    depth: depthText(p.coverage.shallowestSec, p.coverage.deepestSec),
    gaps: p.coverage.gaps.map(g => ({ where: g.where, share: percent(g.fraction), centre: `${formatRaHms(g.centre.raDeg)} ${formatDecDms(g.centre.decDeg)}` })),
    filters: p.filters.map(f => ({
      filter: f.filter,
      have: f.haveSec > 0 ? formatDuration(f.haveSec) : 'none',
      goal: f.goalSec === null ? null : formatDuration(f.goalSec),
      need: f.needSec === null ? null : f.needSec === 0 ? 'met' : formatDuration(f.needSec),
      met: f.needSec === null ? null : f.needSec === 0
    })),
    goalsMet: p.goalsMet,
    captures: p.captures
  }))
  const covered = panels.filter(p => p.covered).length
  const met = panels.filter(p => p.goalsMet).length
  const withGoals = c.goals.length > 0
  const summary = `${covered} of ${count(panels.length, 'panel')} covered${withGoals ? `; ${met} ${met === 1 ? 'meets' : 'meet'} the goals` : ''}${c.unsolved > 0 ? `; ${c.unsolved} not solved yet, so not counted` : ''}.`
  return {
    revision: c.revision.revision,
    cellDeg: c.map.cellDeg,
    filters: c.map.filters,
    cells: c.map.cells,
    maxSeconds: c.map.cells.reduce((m, cell) => Math.max(m, cell.seconds), 0),
    panels,
    totals: c.totals.map(t => ({ filter: t.filter, exposure: formatDuration(t.seconds) })),
    captures: c.counted.map(k => ({ id: k.id, label: k.label, kind: k.kind, panelId: k.panelId, exposure: exposureText(k.exposures), counted: k.counted, note: k.note })),
    next: c.next.map(n => ({ panelId: n.panel.id, aim: `${formatRaHms(n.aim.raDeg)} ${formatDecDms(n.aim.decDeg)}`, reason: n.reason })),
    summary,
    unsolved: c.unsolved
  }
}
