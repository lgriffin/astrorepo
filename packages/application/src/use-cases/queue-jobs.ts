import { parentDir, postProcessCommand, sirilStackCommand, toolSpec, type Job, type JobTiming, type SirilScriptId } from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { JobStore } from '../ports/jobs'
import type { StackCatalogue } from '../ports/stack-catalogue'
import type { ToolHub } from '../ports/tool-hub'
import type { EstimateSirilRun } from './estimate-siril-run'
import type { PlanPostProcessing, PostProcessingOptions } from './plan-post-processing'

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
}

export type QueueStack = (request: QueueStackRequest) => Promise<Job>

/**
 * Queues a Siril stack the user confirmed. The plan is worked out again from the index and the
 * disk rather than taken from the page, so a job only ever runs Siril with a stock script over
 * the target's own frames, with its calibration present and room on the disk.
 */
export function makeQueueStack(deps: QueueStackDeps): QueueStack {
  return async request => {
    const [estimate, target] = await Promise.all([deps.estimate(request.sourceDir, request.workDir), deps.stacks.describeTarget(request.targetId)])
    const script = estimate.scripts.find(s => s.script === request.script)
    if (!script) throw new JobRefusedError(`${request.script} is not a stock Siril script for these frames' sensor.`)
    if (estimate.counts.lights === 0) throw new JobRefusedError('There are no light frames to stack.')
    if (script.missing.length > 0) throw new JobRefusedError(`${request.script} needs ${script.missing.join(', ')}, which this target does not have.`)
    if (estimate.freeBytes === null) throw new JobRefusedError("The work area's disk does not report its free space, so the run could fill it.")
    if (!script.fits) throw new JobRefusedError(`The work area's disk is short of the space ${request.script} needs.`)
    const siril = (await deps.tools.locate()).find(t => t.id === 'siril')?.path ?? null
    if (!siril) throw new JobRefusedError('Siril was not found. Set where siril-cli is in Settings > Tools.')
    const scriptPath = await deps.tools.stockScript(`${request.script}.ssf`)
    if (!scriptPath) throw new JobRefusedError(`Siril's stock script ${request.script}.ssf was not found beside siril-cli.`)

    return deps.store.add(
      {
        kind: 'stack',
        targetId: request.targetId,
        title: `Stack ${target?.name ?? 'target'} with ${request.script}`,
        timing: request.timing,
        command: sirilStackCommand(siril, scriptPath, request.workDir),
        prepare: { sourceDir: request.sourceDir, workDir: request.workDir },
        spaceDir: request.workDir,
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
