import { buildPostProcessRecipe, parentDir, type PostProcessRecipe, type Profile, type Quality, type RecipeTarget } from '@astro/domain'
import type { SirilWorkspace } from '../ports/siril-workspace'
import type { StackCatalogue, StackFile } from '../ports/stack-catalogue'
import type { ToolHub } from '../ports/tool-hub'

export interface PlanPostProcessingDeps {
  stacks: StackCatalogue
  tools: ToolHub
  workspace: SirilWorkspace
}

export interface PostProcessingOptions {
  /** The target's Siril work folder, where a Siril run leaves result*.fit. */
  workDir?: string
  /** Folders the app only reads; a stack inside one gets a warning. */
  readOnlyDirs?: string[]
  /** Which stack to process; the newest when not given. */
  stackPath?: string
  profile?: Profile
  quality?: Quality
}

export interface PostProcessingPlan {
  target: RecipeTarget | null
  /** Every stack the plan could use, newest first. */
  stacks: StackFile[]
  stack: StackFile | null
  recipe: PostProcessRecipe | null
}

export type PlanPostProcessing = (targetId: string, options?: PostProcessingOptions) => Promise<PostProcessingPlan>

/**
 * The Siril_Scripts v2 command for a target's stack, before anything runs: profile from the object
 * type, coordinates and optics from the index, and the tools the hub found. Nothing is run or
 * written (NFR-011).
 */
export function makePlanPostProcessing(deps: PlanPostProcessingDeps): PlanPostProcessing {
  return async (targetId, options = {}) => {
    const target = await deps.stacks.describeTarget(targetId)
    if (!target) return { target: null, stacks: [], stack: null, recipe: null }

    const indexed = await deps.stacks.listStacks(targetId)
    const results = options.workDir ? await deps.workspace.stackResults(options.workDir) : []
    const known = new Set(indexed.map(s => s.path))
    const stacks: StackFile[] = [
      ...indexed,
      ...results
        .filter(r => !known.has(r.path))
        .map(r => ({ ...r, width: null, height: null, colour: true, focalMm: null, pixelUm: null }))
    ].sort((a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0))

    const stack = stacks.find(s => s.path === options.stackPath) ?? stacks[0] ?? null
    if (!stack) return { target, stacks, stack: null, recipe: null }

    const stackDir = parentDir(stack.path).dir
    const [tools, space, readOnly, lightOptics] = await Promise.all([
      deps.tools.locate(),
      deps.workspace.workAreaSpace(stackDir),
      Promise.all((options.readOnlyDirs ?? []).map(dir => deps.workspace.contains(dir, stack.path))),
      deps.stacks.targetOptics(targetId)
    ])
    // A stack straight from Siril may carry no optics; the target's light subs fill each gap.
    const recipe = buildPostProcessRecipe({
      stack: { ...stack, focalMm: stack.focalMm ?? lightOptics?.focalMm ?? null, pixelUm: stack.pixelUm ?? lightOptics?.pixelUm ?? null },
      target,
      tools,
      windows: deps.tools.windows,
      profile: options.profile,
      quality: options.quality,
      freeBytes: space.freeBytes,
      inReadOnlyFolder: readOnly.some(Boolean)
    })
    return { target, stacks, stack, recipe }
  }
}
