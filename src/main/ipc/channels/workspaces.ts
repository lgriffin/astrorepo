import { toCapturesView, toChangeViews, toCoverageView, toCreatedView, toDrawingView, toGridDefinition, toGridInput, toRevisionSavedView, toWorkspaceSummaries, toWorkspaceView } from '../../adapters/mosaic-workspace-presenter'
import { fromRuleView, toProjectChange, toProjectSummaries, toProjectView } from '../../adapters/project-presenter'
import { toComparisonView, toExperimentChange, toExperimentView, toRunView } from '../../adapters/experiment-presenter'
import { kickJobs } from '../../jobs-host'
import type { Desktop } from '../../transport/desktop'
import { validated, type Handle } from './validated'
import { workspaces, projects, experiments, CSV, JSON_FILE, MARKDOWN } from './shared'

/** Mosaic workspaces, projects and experiments. */
export function registerWorkspacesChannels(handle: Handle, desktop: Desktop): void {
  handle('workspace:list', async () => toWorkspaceSummaries(await workspaces().list()))

  handle('workspace:preview', validated('workspace:preview', (args) =>
    toDrawingView(workspaces().preview({ grid: toGridDefinition(args.grid), shift: args.shift ? { rightDeg: args.shift.right_deg, upDeg: args.shift.up_deg } : undefined, drag: args.drag ? { xDeg: args.drag.x_deg, yDeg: args.drag.y_deg } : undefined }))))

  handle('workspace:parse-centre', validated('workspace:parse-centre', (args) => workspaces().parseCentre(args.ra, args.dec)))

  handle('workspace:create', validated('workspace:create', async (args) =>
    toCreatedView(await workspaces().create({ name: args.name, targetId: args.target_id ?? null, grid: toGridDefinition(args.grid), note: args.note ?? null }))))

  handle('workspace:save', validated('workspace:save', async (args) =>
    toRevisionSavedView(args.workspace_id, await workspaces().saveRevision(args.workspace_id, toGridDefinition(args.grid), args.note ?? null))))

  handle('workspace:get', validated('workspace:get', async (args) => {
    const view = await workspaces().describe(args.workspace_id, args.revision)
    return view ? toWorkspaceView(view) : null
  }))

  handle('workspace:export', validated('workspace:export', async (args) => {
    const exported = await workspaces().exportPlan(args.workspace_id, args.format, args.revision)
    if (!exported) return { saved: false }
    return desktop.saveText(exported.fileName, exported.text, args.format === 'csv' ? CSV : JSON_FILE)
  }))

  handle('workspace:from-target', validated('workspace:from-target', async (args) => toCreatedView(await workspaces().fromTarget(args.target_id))))

  handle('workspace:from-solve', validated('workspace:from-solve', async (args) => {
    const grid = await workspaces().fromSolve(args.path)
    return grid ? toGridInput(grid) : null
  }))

  handle('workspace:archive', validated('workspace:archive', (args) => workspaces().archive(args.workspace_id, args.archived)))

  handle('workspace:coverage', validated('workspace:coverage', async (args) => {
    const coverage = await workspaces().coverage(args.workspace_id, args.revision)
    return coverage ? toCoverageView(coverage) : null
  }))

  handle('workspace:export-next', validated('workspace:export-next', async (args) => {
    const exported = await workspaces().exportNext(args.workspace_id, args.format, args.revision)
    if (!exported) return { saved: false }
    return desktop.saveText(exported.fileName, exported.text, args.format === 'csv' ? CSV : JSON_FILE)
  }))

  handle('workspace:captures', validated('workspace:captures', async (args) => {
    const placed = await workspaces().captures(args.workspace_id, args.revision)
    return placed ? toCapturesView(placed) : null
  }))

  handle('workspace:assign', validated('workspace:assign', (args) =>
    workspaces().assign(args.workspace_id, args.capture_id, args.action === 'assign' ? { action: 'assign', panelId: args.panel_id, reason: args.reason ?? null } : args.action === 'exclude' ? { action: 'exclude', reason: args.reason ?? null } : { action: 'clear' })))

  handle('workspace:preview-changes', validated('workspace:preview-changes', async (args) => {
    const changes = await workspaces().previewChanges(args.workspace_id, toGridDefinition(args.grid))
    return changes ? toChangeViews(changes) : null
  }))

  handle('project:list', async () => toProjectSummaries(await projects().list()))

  handle('project:sources', async () => projects().sources())

  handle('project:create', validated('project:create', async (args) =>
    toProjectChange(await projects().create({
      name: args.name,
      kind: args.kind,
      rule: args.rule ? fromRuleView(args.rule) : undefined,
      window: args.window ?? null,
      targetIds: args.target_ids ?? [],
      catalogueId: args.catalogue_id ?? null,
      collectionId: args.collection_id ?? null,
      workspaceId: args.workspace_id ?? null
    }))))

  handle('project:get', validated('project:get', async (args) => {
    const d = await projects().describe(args.project_id)
    return d ? toProjectView(d) : null
  }))

  handle('project:rule', validated('project:rule', async (args) => toProjectChange(await projects().setRule(args.project_id, fromRuleView(args.rule)))))

  handle('project:update', validated('project:update', async (args) =>
    toProjectChange(await projects().update(args.project_id, { name: args.name, status: args.status, window: args.window }))))

  handle('project:add-targets', validated('project:add-targets', async (args) => toProjectChange(await projects().addTargets(args.project_id, args.target_ids))))

  handle('project:remove-target', validated('project:remove-target', async (args) => toProjectChange(await projects().removeTarget(args.project_id, args.target_id))))

  handle('project:add-new-members', validated('project:add-new-members', async (args) => toProjectChange(await projects().addNewMembers(args.project_id))))

  handle('project:export', validated('project:export', async (args) => {
    const exported = await projects().exportManifest(args.project_id, args.format)
    if (!exported) return { saved: false }
    return desktop.saveText(exported.fileName, exported.text, args.format === 'csv' ? CSV : JSON_FILE)
  }))

  handle('experiment:list', validated('experiment:list', async (args) => (await experiments().list(args.target_id)).map(toExperimentView)))

  handle('experiment:create', validated('experiment:create', async (args) =>
    toExperimentChange(await experiments().create(args.target_id, { name: args.name, objective: args.objective, stackPath: args.stack_path, variants: args.variants }))))

  handle('experiment:run', validated('experiment:run', async (args) => {
    const result = await experiments().run(args.experiment_id, args.timing)
    if (result.ok) kickJobs()
    return toRunView(result)
  }))

  handle('experiment:compare', validated('experiment:compare', async (args) => {
    const c = await experiments().compare(args.experiment_id)
    return c ? toComparisonView(c) : null
  }))

  handle('experiment:prefer', validated('experiment:prefer', async (args) => toExperimentChange(await experiments().prefer(args.experiment_id, args.variant_id))))

  handle('experiment:export', validated('experiment:export', async (args) => {
    const exported = await experiments().exportReport(args.experiment_id, args.format)
    if (!exported) return { saved: false }
    return desktop.saveText(exported.fileName, exported.text, args.format === 'json' ? JSON_FILE : MARKDOWN)
  }))
}
