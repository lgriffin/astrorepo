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

export type PrepareSirilWorkspace = (sourceDir: string, workDir: string) => Promise<SirilWorkspaceResult>

/**
 * Lays a target's frames out as Siril expects (lights, darks, flats, biases) inside the app's work
 * area. The source folder is only read: frames are hard-linked where the disk allows, else copied.
 */
export function makePrepareSirilWorkspace(deps: PrepareSirilWorkspaceDeps): PrepareSirilWorkspace {
  return async (sourceDir, workDir) => {
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
