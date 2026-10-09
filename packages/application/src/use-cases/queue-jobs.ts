import { parentDir, postProcessCommand, sirilStackCommand, SYQON_STEP_INFO, toolSpec, type Job, type JobTiming, type SirilScriptId } from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { JobStore } from '../ports/jobs'
import type { StackCatalogue } from '../ports/stack-catalogue'
import type { ToolHub } from '../ports/tool-hub'
import type { EstimateSirilRun } from './estimate-siril-run'
import type { PlanPostProcessing, PostProcessingOptions } from './plan-post-processing'
import type { PlanSyqon, SyqonOptions } from './plan-syqon'

/** A confirmed plan that no longer holds when the app works it out again, so nothing is queued. */
export class JobRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobRefusedError'
  }
}

export interface QueueStackDeps {
  estimate: EstimateSirilRun
  tools: ToolHub
  stacks: StackCatalogue
  store: JobStore
  clock: Clock
}

export interface QueueStackRequest {
  targetId: string
  sourceDir: string
  workDir: string
  script: SirilScriptId
  timing: JobTiming
  /** Stacks one filter of a mono target in its own work folder (RIG-009). */
  filter?: string
}

export type QueueStack = (request: QueueStackRequest) => Promise<Job>

/**
 * Queues a Siril stack the user confirmed. The plan is worked out again from the index and the
 * disk rather than taken from the page, so a job only ever runs Siril with a stock script over
 * the target's own frames, with its calibration present and room on the disk.
 */
export function makeQueueStack(deps: QueueStackDeps): QueueStack {
  return async request => {
    const filter = request.filter?.trim() || undefined
    // A filter's work folder is the one the whole plan gave it, so filters whose names make one
    // folder name never share it.
    const whole = filter ? await deps.estimate(request.sourceDir, request.workDir) : null
    const planned = filter ? whole?.filters?.stacks.find(s => s.filter === filter) : undefined
    if (filter && !planned) throw new JobRefusedError(`These lights are not stacked per filter, or have no ${filter} lights.`)
    const workDir = planned?.workDir ?? request.workDir
    const [estimate, target] = await Promise.all([deps.estimate(request.sourceDir, workDir, filter ? { filter } : {}), deps.stacks.describeTarget(request.targetId)])
    // One stack over several filters would mix them in one master (RIG-018).
    if (!filter && estimate.filters) {
      throw new JobRefusedError(`These mono lights carry ${estimate.filters.stacks.length} filters, and one stack would mix them. Queue each filter's stack on its own.`)
    }
    const script = estimate.scripts.find(s => s.script === request.script)
    if (!script) throw new JobRefusedError(`${request.script} is not a stock Siril script for these frames' sensor.`)
    if (estimate.counts.lights === 0) throw new JobRefusedError('There are no light frames to stack.')
    if (script.missing.length > 0) throw new JobRefusedError(`${request.script} needs ${script.missing.join(', ')}, which this target does not have.`)
    if (estimate.freeBytes === null) throw new JobRefusedError("The work area's disk does not report its free space, so the run could fill it.")
    if (!script.fits) throw new JobRefusedError(`The work area's disk is short of the space ${request.script} needs.`)
    const siril = (await deps.tools.locate()).find(t => t.id === 'siril')?.path ?? null
    if (!siril) throw new JobRefusedError('Siril was not found. Set where siril-cli is in Settings → Tools.')
    const scriptPath = await deps.tools.stockScript(`${request.script}.ssf`)
    if (!scriptPath) throw new JobRefusedError(`Siril's stock script ${request.script}.ssf was not found beside siril-cli.`)

    return deps.store.add(
      {
        kind: 'stack',
        targetId: request.targetId,
        title: `Stack ${target?.name ?? 'target'}${filter ? ` (${filter})` : ''} with ${request.script}`,
        timing: request.timing,
        command: sirilStackCommand(siril, scriptPath, workDir),
        prepare: { sourceDir: request.sourceDir, workDir, ...(filter ? { filter } : {}) },
        spaceDir: workDir,
        neededBytes: script.neededBytes
      },
      deps.clock.now()
    )
  }
}

export interface QueuePostProcessDeps {
  plan: PlanPostProcessing
  tools: ToolHub
  store: JobStore
  clock: Clock
}

export type QueuePostProcess = (targetId: string, options: PostProcessingOptions, timing: JobTiming) => Promise<Job>

/** Queues Siril_Scripts v2 for a stack the user confirmed, with the recipe worked out again. */
export function makeQueuePostProcess(deps: QueuePostProcessDeps): QueuePostProcess {
  return async (targetId, options, timing) => {
    const plan = await deps.plan(targetId, options)
    const { recipe, stack, target } = plan
    if (!recipe || !stack || !target) throw new JobRefusedError('This target has no stack to post-process.')
    // The confirmed stack, or none: never another one the plan fell back to.
    if (options.stackPath && stack.path !== options.stackPath) throw new JobRefusedError(`${options.stackPath} is no longer there to post-process.`)
    if (recipe.missing.length > 0 || !recipe.program) throw new JobRefusedError(`Siril_Scripts needs ${recipe.missing.join(', ')}, which the tool hub did not find.`)
    if (recipe.misplaced.length > 0) {
      throw new JobRefusedError(`Siril_Scripts v2 only runs ${recipe.misplaced.map(id => toolSpec(id).label).join(' and ')} from its standard install folder, where it is not installed, so the run would fail.`)
    }
    if (recipe.missingCatalogues) throw new JobRefusedError(recipe.missingCatalogues)
    if (recipe.inReadOnlyFolder) throw new JobRefusedError('The stack is in a folder the app only reads, and Siril_Scripts writes beside it. Stack it into the work area, or copy it there, first.')
    if (recipe.space.headroomBytes === null && recipe.space.shortBytes === null) throw new JobRefusedError("The stack's disk does not report its free space, so the run could fill it.")
    if (!recipe.space.fits) throw new JobRefusedError("The stack's disk is short of the space Siril_Scripts needs.")
    const bash = (await deps.tools.locate()).find(t => t.id === 'bash')?.path ?? null
    const stackDir = parentDir(stack.path).dir

    return deps.store.add(
      {
        kind: 'post-process',
        targetId,
        title: `Post-process ${target.name} (${recipe.profile}, ${recipe.quality})`,
        timing,
        command: postProcessCommand(recipe.program, recipe.args, bash, stackDir),
        prepare: null,
        spaceDir: stackDir,
        neededBytes: recipe.peakBytes
      },
      deps.clock.now()
    )
  }
}

export interface QueueSyqonDeps {
  plan: PlanSyqon
  store: JobStore
  clock: Clock
}

export type QueueSyqon = (targetId: string, options: SyqonOptions & Required<Pick<SyqonOptions, 'step' | 'model'>>, timing: JobTiming) => Promise<Job>

/**
 * Queues one SyQon CLI step the user confirmed (HUB-011). The plan is worked out again: the model
 * must still be one the CLI reports as available, the stack the confirmed one, and the output
 * replaced only when the user said so.
 */
export function makeQueueSyqon(deps: QueueSyqonDeps): QueueSyqon {
  return async (targetId, options, timing) => {
    const plan = await deps.plan(targetId, options)
    const { stack, target, command } = plan
    if (!target || !stack) throw new JobRefusedError(plan.blocked ?? 'This target has no stack for SyQon.')
    if (options.stackPath && stack.path !== options.stackPath) throw new JobRefusedError(`${options.stackPath} is no longer there for SyQon.`)
    if (plan.blocked) throw new JobRefusedError(plan.blocked)
    if (plan.model !== options.model || !command) throw new JobRefusedError(`The SyQon CLI does not report ${options.model} as available for this step any more.`)
    return deps.store.add(
      {
        kind: 'syqon',
        targetId,
        title: `${SYQON_STEP_INFO[plan.step].label} for ${target.name} with SyQon ${plan.model}`,
        timing,
        command,
        prepare: null,
        spaceDir: parentDir(stack.path).dir,
        neededBytes: plan.neededBytes
      },
      deps.clock.now()
    )
  }
}
