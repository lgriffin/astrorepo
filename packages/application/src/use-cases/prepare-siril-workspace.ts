import { planSirilWorkspace, type SirilFolder, type SirilPlacement } from '@astro/domain'
import type { SirilWorkspace } from '../ports/siril-workspace'
import { selectFrames } from './estimate-siril-run'
import type { FrameSelection } from './frame-grading'

export interface PrepareSirilWorkspaceDeps {
  workspace: SirilWorkspace
  /** Grading, when wired: rejected lights are not placed, and any an earlier run placed are removed. */
  selection?: FrameSelection
}

export interface SirilWorkspaceResult {
  workDir: string
  linked: number
  copied: number
  existing: number
  /** Lights grading rejected, left out of the work area. */
  rejected: number
  /** Rejected lights an earlier run placed in the work area, removed. */
  pruned: number
  byFolder: Record<SirilFolder, number>
  /** Every frame now laid out for the stack, for its manifest (PRV-001). */
  placements: SirilPlacement[]
  /** Source paths of the lights grading left out. */
  rejectedPaths: string[]
}

export interface PrepareOptions {
  /** Lays out one filter's lights and flats with every dark and bias, for that filter's stack (RIG-009). */
  filter?: string
}

export type PrepareSirilWorkspace = (sourceDir: string, workDir: string, protectedDirs?: string[], options?: PrepareOptions) => Promise<SirilWorkspaceResult>

/** The work area would overlap a folder the app only reads. */
export class WorkAreaOverlapsSourceError extends Error {
  constructor(readonly workDir: string, readonly sourceDir: string) {
    super(`The Siril work area ${workDir} overlaps ${sourceDir}, which the app never writes to. Choose a work area outside your data folders in Settings.`)
    this.name = 'WorkAreaOverlapsSourceError'
  }
}

/**
 * Lays a target's frames out as Siril expects (lights, darks, flats, biases) inside the app's work
 * area. The source folder is only read: frames are hard-linked where the disk allows, else copied,
 * and a work area that overlaps the source or any other indexed folder is refused before anything
 * is written.
 */
export function makePrepareSirilWorkspace(deps: PrepareSirilWorkspaceDeps): PrepareSirilWorkspace {
  return async (sourceDir, workDir, protectedDirs = [], options = {}) => {
    for (const dir of [sourceDir, ...protectedDirs]) {
      if ((await deps.workspace.contains(dir, workDir)) || (await deps.workspace.contains(workDir, dir))) {
        throw new WorkAreaOverlapsSourceError(workDir, dir)
      }
    }
    const { frames, rejected, rejectedPaths } = await selectFrames(deps, sourceDir, options.filter)
    await deps.workspace.prepareFolders(workDir)
    const result: SirilWorkspaceResult = {
      workDir,
      linked: 0,
      copied: 0,
      existing: 0,
      rejected,
      pruned: 0,
      byFolder: { lights: 0, darks: 0, flats: 0, biases: 0 },
      placements: [],
      rejectedPaths: [...rejectedPaths]
    }
    // Laid out with every frame, so a rejected light has the name an earlier run gave it.
    const layout = planSirilWorkspace(frames)
    for (const placement of layout.filter(p => !rejectedPaths.has(p.from))) {
      const outcome = await deps.workspace.place(placement, workDir)
      result[outcome]++
      result.byFolder[placement.folder]++
      result.placements.push(placement)
    }
    // Siril stacks whatever is in the folders, so a light rejected since an earlier run must go.
    // Only those: anything else in the folders, such as frames the user added, stays.
    const leftOut = layout.filter(p => rejectedPaths.has(p.from)).map(p => p.name)
    result.pruned = (await deps.workspace.remove(workDir, 'lights', leftOut)).length
    return result
  }
}
