import type { RecipeTarget, StackToProcess } from '@astro/domain'

export interface StackFile extends StackToProcess {
  /** When the stack was written; null when the index does not know. */
  modifiedAt: Date | null
}

/** Driven port: what the index knows about a target and its stacked images. */
export interface StackCatalogue {
  describeTarget(targetId: string): Promise<RecipeTarget | null>
  /** Stacked images linked to the target, newest first. */
  listStacks(targetId: string): Promise<StackFile[]>
  /** Focal length (mm) and pixel size (µm) most of the target's light subs were taken with. */
  targetOptics(targetId: string): Promise<{ focalMm: number; pixelUm: number } | null>
}
