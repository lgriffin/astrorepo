import { planSirilWorkspace, type SirilFolder } from '@astro/domain'
import type { SirilWorkspace } from '../ports/siril-workspace'

export interface PrepareSirilWorkspaceDeps {
  workspace: SirilWorkspace
}

export interface SirilWorkspaceResult {
  workDir: string
  linked: number
  copied: number
  existing: number
  byFolder: Record<SirilFolder, number>
}

export type PrepareSirilWorkspace = (sourceDir: string, workDir: string, protectedDirs?: string[]) => Promise<SirilWorkspaceResult>

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
  return async (sourceDir, workDir, protectedDirs = []) => {
    for (const dir of [sourceDir, ...protectedDirs]) {
      if ((await deps.workspace.contains(dir, workDir)) || (await deps.workspace.contains(workDir, dir))) {
        throw new WorkAreaOverlapsSourceError(workDir, dir)
      }
    }
    const frames = await deps.workspace.listSourceFrames(sourceDir)
    await deps.workspace.prepareFolders(workDir)
    const result: SirilWorkspaceResult = {
      workDir,
      linked: 0,
      copied: 0,
      existing: 0,
      byFolder: { lights: 0, darks: 0, flats: 0, biases: 0 }
    }
    for (const placement of planSirilWorkspace(frames)) {
      const outcome = await deps.workspace.place(placement, workDir)
      result[outcome]++
      result.byFolder[placement.folder]++
    }
    return result
  }
}
