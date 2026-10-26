import {
  DEFAULT_RULES,
  NO_FILTER,
  formatDecDms,
  formatRaHms,
  goalsFor,
  panelProgress,
  panelTask,
  projectManifestCsv,
  projectManifestJson,
  projectManifestName,
  projectNextActions,
  projectProgress,
  ruleProblems,
  targetTask,
  windowProblems,
  campaignWindowState,
  type CompletionRule,
  type FilterSeconds,
  type ProjectKind,
  type ProjectProgress,
  type ProjectStatus,
  type ProjectStep,
  type ProjectTask,
  type ProjectWindow,
  type TargetEvidence,
  type TargetFrames,
  type CampaignWindowState
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { FrameCatalogue } from '../ports/frame-catalogue'
import type { MosaicWorkspaceStore } from '../ports/mosaic-workspace'
import type { ProjectRecord, ProjectSource, ProjectSources, ProjectStore } from '../ports/projects'
import type { DescribeCoverage } from './mosaic-coverage'

export interface ProjectDeps {
  store: ProjectStore
  sources: ProjectSources
  frames: Pick<FrameCatalogue, 'listTargetFrames'>
  workspaces: Pick<MosaicWorkspaceStore, 'get'>
  /** A mosaic's coverage (spec 037), which a mosaic campaign's panels are judged from. */
  coverage: DescribeCoverage
  clock: Clock
}

export type ProjectResult = { ok: true; project: ProjectRecord } | { ok: false; problems: string[] }

/** What the project wizard sends (CreateAstronomyProject). */
export interface ProjectDefinition {
  name: string
  kind: ProjectKind
  /** The kind's default rule when left out. */
  rule?: CompletionRule
  window?: ProjectWindow | null
  targetIds?: string[]
  catalogueId?: string | null
  collectionId?: string | null
  workspaceId?: string | null
}

const unique = (ids: string[]) => [...new Set(ids)]
const OUTPUT_PARTS = (rule: CompletionRule) => rule.stacked || rule.processed || rule.published
const NO_TARGET = "This mosaic has no target, so its stacks and images cannot be found: ask for coverage and integration only."
const FIXED_TARGETS: Partial<Record<ProjectKind, string>> = {
  'target-depth': 'A target depth project keeps its one target.',
  mosaic: "A mosaic campaign's target is its mosaic's."
}

/** Targets named that the index does not know, as a problem. */
async function unknownTargets(sources: ProjectSources, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const names = await sources.targetNames(ids)
  const missing = ids.filter(id => !names.has(id))
  return missing.length === 0 ? [] : [`${missing.length === 1 ? 'One target was' : `${missing.length} targets were`} not found.`]
}

/**
 * Starts a project of one of five kinds (AP-001): a catalogue or a collection brings its targets
 * in (linked, not merged), a target depth project has one target, a mosaic campaign follows a
 * mosaic workspace and a seasonal campaign has a window of dates.
 */
export function makeCreateProject(deps: Pick<ProjectDeps, 'store' | 'sources' | 'workspaces' | 'clock'>) {
  return async (definition: ProjectDefinition): Promise<ProjectResult> => {
    const name = definition.name.trim()
    const kind = definition.kind
    const rule = definition.rule ?? DEFAULT_RULES[kind]
    const problems: string[] = name === '' ? ['The project needs a name.'] : []
    problems.push(...ruleProblems(kind, rule))
    let targetIds = unique(definition.targetIds ?? [])
    let catalogueId: string | null = null
    let collectionId: string | null = null
    let workspaceId: string | null = null
    let window: ProjectWindow | null = null
    if (kind === 'catalogue') {
      if (!definition.catalogueId) problems.push('Choose the catalogue to work through.')
      else {
        catalogueId = definition.catalogueId
        const members = await deps.sources.catalogueTargets(catalogueId)
        if (members.length === 0) problems.push('That catalogue has no targets.')
        targetIds = unique([...members, ...targetIds])
      }
    } else if (kind === 'custom' && definition.collectionId) {
      collectionId = definition.collectionId
      targetIds = unique([...(await deps.sources.collectionTargets(collectionId)), ...targetIds])
    } else if (kind === 'seasonal') {
      if (!definition.window) problems.push('A seasonal campaign needs the dates it runs between.')
      else {
        problems.push(...windowProblems(definition.window))
        window = definition.window
      }
    } else if (kind === 'target-depth') {
      if (targetIds.length !== 1) problems.push('A target depth project has exactly one target.')
    } else if (kind === 'mosaic') {
      const workspace = definition.workspaceId ? await deps.workspaces.get(definition.workspaceId) : null
      if (!workspace) problems.push('Choose the mosaic to follow.')
      else {
        workspaceId = workspace.id
        targetIds = workspace.targetId ? [workspace.targetId] : []
        if (!workspace.targetId && OUTPUT_PARTS(rule)) problems.push(NO_TARGET)
      }
    }
    // Members of a catalogue or collection exist; targets named by hand are checked.
    if (kind !== 'mosaic') problems.push(...(await unknownTargets(deps.sources, unique(definition.targetIds ?? []))))
    if (problems.length > 0) return { ok: false, problems }
    const now = deps.clock.now()
    const project = await deps.store.create({ name, kind, rule, window, catalogueId, collectionId, workspaceId, targetIds, createdAt: now })
    return { ok: true, project }
  }
}

const missing = { ok: false as const, problems: ['There is no such project.'] }

/** Adds targets to a project (AddProjectTargets); a target depth project and a mosaic campaign keep theirs. */
export function makeAddProjectTargets(deps: Pick<ProjectDeps, 'store' | 'sources' | 'clock'>) {
  return async (projectId: string, targetIds: string[]): Promise<ProjectResult> => {
    const project = await deps.store.get(projectId)
    if (!project) return missing
    const fixed = FIXED_TARGETS[project.kind]
    if (fixed) return { ok: false, problems: [fixed] }
    const ids = unique(targetIds)
    const problems = await unknownTargets(deps.sources, ids)
    if (problems.length > 0) return { ok: false, problems }
    await deps.store.addTargets(projectId, ids, deps.clock.now())
    return { ok: true, project: (await deps.store.get(projectId)) as ProjectRecord }
  }
}

/** Takes a target out of a project; its frames and images are not touched. */
export function makeRemoveProjectTarget(deps: Pick<ProjectDeps, 'store' | 'clock'>) {
  return async (projectId: string, targetId: string): Promise<ProjectResult> => {
    const project = await deps.store.get(projectId)
    if (!project) return missing
    const fixed = FIXED_TARGETS[project.kind]
    if (fixed) return { ok: false, problems: [fixed] }
    await deps.store.removeTarget(projectId, targetId, deps.clock.now())
    return { ok: true, project: (await deps.store.get(projectId)) as ProjectRecord }
  }
}

/** Changes what finished means for a project (SetProjectCompletionRule, AP-001). */
export function makeSetCompletionRule(deps: Pick<ProjectDeps, 'store' | 'workspaces' | 'clock'>) {
  return async (projectId: string, rule: CompletionRule): Promise<ProjectResult> => {
    const project = await deps.store.get(projectId)
    if (!project) return missing
    const problems = ruleProblems(project.kind, rule)
    if (project.kind === 'mosaic' && OUTPUT_PARTS(rule) && project.targetIds.length === 0) problems.push(NO_TARGET)
    if (problems.length > 0) return { ok: false, problems }
    await deps.store.update(projectId, { rule }, deps.clock.now())
    return { ok: true, project: (await deps.store.get(projectId)) as ProjectRecord }
  }
}

export interface ProjectChange {
  name?: string
  status?: ProjectStatus
  window?: ProjectWindow
}

/** Renames, pauses, archives or resumes a project, or moves a seasonal campaign's window. */
export function makeUpdateProject(deps: Pick<ProjectDeps, 'store' | 'clock'>) {
  return async (projectId: string, change: ProjectChange): Promise<ProjectResult> => {
    const project = await deps.store.get(projectId)
    if (!project) return missing
    const problems: string[] = []
    const name = change.name?.trim()
    if (name === '') problems.push('The project needs a name.')
    if (change.window) {
      if (project.kind !== 'seasonal') problems.push('Only a seasonal campaign has a window.')
      else problems.push(...windowProblems(change.window))
    }
    if (problems.length > 0) return { ok: false, problems }
    await deps.store.update(projectId, { ...(name ? { name } : {}), ...(change.status ? { status: change.status } : {}), ...(change.window ? { window: change.window } : {}) }, deps.clock.now())
    return { ok: true, project: (await deps.store.get(projectId)) as ProjectRecord }
  }
}

// ── Progress ────────────────────────────────────────────────────────────

/** Light per filter, frames with no filter under "No filter". */
function byFilter(subs: TargetFrames['subs']): FilterSeconds[] {
  const seconds = new Map<string, number>()
  for (const s of subs) {
    const filter = s.filter?.trim() || NO_FILTER
    seconds.set(filter, (seconds.get(filter) ?? 0) + s.exposureSec)
  }
  return [...seconds].map(([filter, s]) => ({ filter, seconds: s })).sort((a, b) => a.filter.localeCompare(b.filter))
}

/** What the index holds for a target now; a target with nothing indexed has nothing. */
export function evidenceOf(targetId: string, name: string, frames: TargetFrames | undefined): TargetEvidence {
  if (!frames) return { targetId, name, acquired: [], usable: [], stacks: 0, processed: 0, published: 0, goals: [] }
  return {
    targetId,
    name,
    acquired: byFilter(frames.subs),
    usable: byFilter(frames.subs.filter(s => !s.rejected)),
    stacks: frames.stacks.length,
    processed: frames.processedCount,
    published: frames.finalCount,
    goals: (frames.filterGoals ?? []).map(g => ({ filter: g.filter, seconds: g.goalSec }))
  }
}

export type ProjectAction = ProjectStep & { taskId: string; label: string }

export interface ProjectDescription {
  project: ProjectRecord
  progress: ProjectProgress
  /** One step per unfinished task, the work that needs no sky first (GetProjectNextActions). */
  next: ProjectAction[]
  /** A seasonal campaign's window against today; null for other kinds. */
  window: CampaignWindowState | null
  /** The mosaic a mosaic campaign follows, at its latest revision; null when it has gone. */
  mosaic: { id: string; name: string; revision: number } | null
  /** The catalogue or collection it was started from, by name, and its members not in the project. */
  source: { kind: 'catalogue' | 'collection'; id: string; name: string; notInProject: string[] } | null
  /** When this was worked out. */
  at: Date
}

/**
 * A project's progress worked out afresh from the index (ReconcileProjectProgress, AP-002): new,
 * graded, solved or stacked files show the next time it is asked, with nothing imported again
 * and no source file touched. Each part of the rule is tallied on its own (AP-003).
 */
export function makeDescribeProject(deps: ProjectDeps) {
  const evaluate = makeEvaluate(deps)
  return async (projectId: string): Promise<ProjectDescription | null> => {
    const project = await deps.store.get(projectId)
    if (!project) return null
    const [frames, sourceList] = await Promise.all([deps.frames.listTargetFrames(), sourcesOf(deps, project)])
    return evaluate(project, frames, sourceList)
  }
}

export interface ProjectSummary {
  project: ProjectRecord
  done: number
  total: number
  complete: boolean
  window: CampaignWindowState | null
}

/** Every project with how many of its tasks are done, newest first. */
export function makeListProjects(deps: ProjectDeps) {
  const evaluate = makeEvaluate(deps)
  return async (): Promise<ProjectSummary[]> => {
    const [projects, frames] = await Promise.all([deps.store.list(), deps.frames.listTargetFrames()])
    const out: ProjectSummary[] = []
    for (const project of projects) {
      const d = await evaluate(project, frames, [])
      out.push({ project, done: d.progress.done, total: d.progress.total, complete: d.progress.complete, window: d.window })
    }
    return out
  }
}

/** The catalogue or collection list a project's source is in, so its name can be shown. */
async function sourcesOf(deps: Pick<ProjectDeps, 'sources'>, project: ProjectRecord): Promise<ProjectSource[]> {
  if (project.catalogueId) return deps.sources.catalogues()
  if (project.collectionId) return deps.sources.collections()
  return []
}

function makeEvaluate(deps: ProjectDeps) {
  return async (project: ProjectRecord, frames: TargetFrames[], sourceList: ProjectSource[]): Promise<ProjectDescription> => {
    const at = deps.clock.now()
    const framesOf = new Map(frames.map(f => [f.targetId, f]))
    const names = await deps.sources.targetNames(project.targetIds)
    const nameOf = (id: string) => names.get(id) ?? framesOf.get(id)?.targetName ?? id
    const rule = project.rule
    const tasks: ProjectTask[] = []
    let mosaic: ProjectDescription['mosaic'] = null
    if (project.kind === 'mosaic' && project.workspaceId) {
      const coverage = await deps.coverage(project.workspaceId)
      if (coverage) {
        mosaic = { id: coverage.workspace.id, name: coverage.workspace.name, revision: coverage.revision.revision }
        const goals = goalsFor(rule, coverage.goals)
        const aims = new Map(coverage.next.map(n => [n.panel.id, `RA ${formatRaHms(n.aim.raDeg)}, Dec ${formatDecDms(n.aim.decDeg)}`]))
        for (const p of panelProgress(coverage.map.panels, coverage.counted, goals ?? [])) tasks.push(panelTask(p, rule, goals, aims.get(p.panelId) ?? null))
      }
      // The mosaic's stacks and images belong to its target, judged once for the whole mosaic.
      if (OUTPUT_PARTS(rule))
        for (const id of project.targetIds) tasks.push(targetTask(evidenceOf(id, nameOf(id), framesOf.get(id)), rule, { integration: false }))
    } else {
      for (const id of project.targetIds) tasks.push(targetTask(evidenceOf(id, nameOf(id), framesOf.get(id)), rule))
    }
    const progress = projectProgress(tasks)
    let source: ProjectDescription['source'] = null
    const sourceId = project.catalogueId ?? project.collectionId
    const found = sourceList.find(s => s.id === sourceId)
    if (sourceId && found) {
      const members = project.catalogueId ? await deps.sources.catalogueTargets(sourceId) : await deps.sources.collectionTargets(sourceId)
      const have = new Set(project.targetIds)
      source = { kind: project.catalogueId ? 'catalogue' : 'collection', id: sourceId, name: found.name, notInProject: members.filter(m => !have.has(m)) }
    }
    return {
      project,
      progress,
      next: project.status === 'active' ? projectNextActions(tasks) : [],
      window: project.window ? campaignWindowState(project.window, at.toISOString().slice(0, 10)) : null,
      mosaic,
      source,
      at
    }
  }
}

/** Brings in the members its catalogue or collection gained since, linked as before. */
export function makeAddNewSourceMembers(deps: ProjectDeps) {
  const describe = makeDescribeProject(deps)
  const add = makeAddProjectTargets(deps)
  return async (projectId: string): Promise<ProjectResult> => {
    const d = await describe(projectId)
    if (!d) return missing
    if (!d.source) return { ok: false, problems: ['This project was not started from a catalogue or collection.'] }
    return add(projectId, d.source.notInProject)
  }
}

/** The project and every task as CSV or JSON (ExportProjectManifest). */
export function makeExportProjectManifest(deps: ProjectDeps) {
  const describe = makeDescribeProject(deps)
  return async (projectId: string, format: 'csv' | 'json'): Promise<{ fileName: string; text: string } | null> => {
    const d = await describe(projectId)
    if (!d) return null
    const input = { name: d.project.name, kind: d.project.kind, status: d.project.status, rule: d.project.rule, window: d.project.window, progress: d.progress, at: d.at.toISOString() }
    return { fileName: projectManifestName(d.project.name, format), text: format === 'csv' ? projectManifestCsv(input) : projectManifestJson(input) }
  }
}

/** The catalogues and collections a new project can start from, and the mosaics it can follow. */
export function makeListProjectSources(deps: Pick<ProjectDeps, 'sources'>) {
  return async () => {
    const [catalogues, collections] = await Promise.all([deps.sources.catalogues(), deps.sources.collections()])
    return { catalogues, collections }
  }
}
