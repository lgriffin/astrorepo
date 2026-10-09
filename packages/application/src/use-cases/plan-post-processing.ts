import { buildPostProcessRecipe, isSyqonOutput, parentDir, type PostProcessRecipe, type Profile, type Quality, type RecipeTarget } from '@astro/domain'
import type { SirilWorkspace } from '../ports/siril-workspace'
import type { StackCatalogue, StackFile } from '../ports/stack-catalogue'
import type { ToolHub } from '../ports/tool-hub'
import { makeCheckCatalogues } from './check-tool-health'

export interface PlanPostProcessingDeps {
  stacks: StackCatalogue
  tools: ToolHub
  workspace: SirilWorkspace
}

/**
 * Every stack a target has, newest first: those the index holds, and the result*.fit a Siril run
 * left in its work folder.
 */
export async function targetStacks(deps: { stacks: StackCatalogue; workspace: Pick<SirilWorkspace, 'stackResults'> }, targetId: string, workDir?: string): Promise<StackFile[]> {
  const indexed = await deps.stacks.listStacks(targetId)
  const results = workDir ? await deps.workspace.stackResults(workDir) : []
  const known = new Set(indexed.map(s => s.path))
  return [
    ...indexed,
    ...results.filter(r => !known.has(r.path)).map(r => ({ ...r, width: null, height: null, colour: true, focalMm: null, pixelUm: null }))
  ]
    // A SyQon output sits beside its stack and is newer, but it is not a stack to process again (HUB-011).
    .filter(s => !isSyqonOutput(s.path))
    .sort((a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0))
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

    const stacks = await targetStacks(deps, targetId, options.workDir)

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
    const catalogues = await makeCheckCatalogues(deps)(tools)
    const recipe = buildPostProcessRecipe({
      stack: { ...stack, focalMm: stack.focalMm ?? lightOptics?.focalMm ?? null, pixelUm: stack.pixelUm ?? lightOptics?.pixelUm ?? null },
      target,
      tools,
      windows: deps.tools.windows,
      profile: options.profile,
      quality: options.quality,
      freeBytes: space.freeBytes,
      inReadOnlyFolder: readOnly.some(Boolean),
      catalogues
    })
    return { target, stacks, stack, recipe }
  }
}
