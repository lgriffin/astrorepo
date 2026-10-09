import {
  parentDir,
  spaceVerdict,
  SYQON_STEP_INFO,
  syqonCommand,
  syqonModelsFor,
  syqonNeededBytes,
  syqonOutputPath,
  type JobCommand,
  type RecipeTarget,
  type SpaceVerdict,
  type SyqonModel,
  type SyqonStep
} from '@astro/domain'
import type { SirilWorkspace } from '../ports/siril-workspace'
import type { StackCatalogue, StackFile } from '../ports/stack-catalogue'
import type { ToolHub } from '../ports/tool-hub'
import type { ListSyqonModels } from './check-tool-health'
import { targetStacks } from './plan-post-processing'

export interface PlanSyqonDeps {
  stacks: StackCatalogue
  tools: ToolHub
  workspace: Pick<SirilWorkspace, 'stackResults' | 'workAreaSpace' | 'contains'>
  models: ListSyqonModels
}

export interface SyqonOptions {
  /** The target's Siril work folder, where a Siril run leaves result*.fit. */
  workDir?: string
  /** Folders the app only reads; SyQon writes beside the stack, so a stack inside one is refused. */
  readOnlyDirs?: string[]
  stackPath?: string
  step?: SyqonStep
  model?: string
  /** Replace an output already there (never implied). */
  overwrite?: boolean
}

export interface SyqonPlan {
  target: RecipeTarget | null
  stacks: StackFile[]
  stack: StackFile | null
  step: SyqonStep
  /** The models the account may use for the step; empty when none, null when they could not be listed. */
  models: SyqonModel[] | null
  model: string | null
  output: string | null
  /** A file is already where the step writes. */
  outputExists: boolean
  overwrite: boolean
  command: JobCommand | null
  neededBytes: number
  space: SpaceVerdict | null
  /** Why the step cannot be queued, in the user's words; null when it can. */
  blocked: string | null
}

export type PlanSyqon = (targetId: string, options?: SyqonOptions) => Promise<SyqonPlan>

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

/**
 * One SyQon CLI step for a target's stack (HUB-011): the models the account may use for it, the
 * output beside the stack, and the command, or why it cannot run. Lists models and folders only.
 */
export function makePlanSyqon(deps: PlanSyqonDeps): PlanSyqon {
  return async (targetId, options = {}) => {
    const step = options.step ?? 'star-separation'
    const overwrite = options.overwrite === true
    const empty = { step, models: null, model: null, output: null, outputExists: false, overwrite, command: null, neededBytes: 0, space: null }
    const target = await deps.stacks.describeTarget(targetId)
    if (!target) return { ...empty, target: null, stacks: [], stack: null, blocked: 'This target is not in the catalogue.' }
    const stacks = await targetStacks(deps, targetId, options.workDir)
    const stack = stacks.find(s => s.path === options.stackPath) ?? stacks[0] ?? null
    if (!stack) return { ...empty, target, stacks, stack: null, blocked: 'No stack yet. Stack this target first, and its SyQon steps appear here.' }

    const listed = await deps.models()
    const models = listed.models ? syqonModelsFor(step, listed.models) : null
    const model = models?.find(m => m.id === options.model)?.id ?? models?.[0]?.id ?? null
    const { dir } = parentDir(stack.path)
    const output = syqonOutputPath(stack.path, step)
    const [names, space, readOnly] = await Promise.all([
      deps.tools.listFolder(dir),
      deps.workspace.workAreaSpace(dir),
      Promise.all((options.readOnlyDirs ?? []).map(d => deps.workspace.contains(d, stack.path)))
    ])
    const outputExists = (names ?? []).some(n => n.toLowerCase() === fileName(output).toLowerCase())
    const neededBytes = syqonNeededBytes(stack.sizeBytes)
    const verdict = spaceVerdict(outputExists && overwrite ? 0 : neededBytes, space.freeBytes)
    const command = listed.program && model ? syqonCommand({ program: listed.program, model, input: stack.path, output, overwrite }) : null

    const label = SYQON_STEP_INFO[step].label.toLowerCase()
    const blocked = !listed.program
      ? 'The SyQon CLI was not found. Install SyQon Studio, or set where syqon-cli is in Settings, under Tools.'
      : listed.error
        ? listed.error
        : !model
          ? `Your SyQon account has no model for ${label} available. Settings, under Tools, lists the models and whether each is available.`
          : readOnly.some(Boolean)
            ? 'The stack is in a folder the app only reads, and SyQon writes beside it. Stack it into the work area, or copy it there, first.'
            : outputExists && !overwrite
              ? `${fileName(output)} is already beside the stack. Tick Replace it to write over it, or move it away first.`
              : space.freeBytes === null
                ? "The stack's disk does not report its free space, so the run could fill it."
                : !verdict.fits
                  ? "The stack's disk is short of the space the step needs."
                  : null
    return { target, stacks, stack, step, models, model, output, outputExists, overwrite, command, neededBytes, space: verdict, blocked }
  }
}
