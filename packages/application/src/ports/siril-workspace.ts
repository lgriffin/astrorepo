import type { SirilPlacement } from '@astro/domain'

export type PlacementResult = 'linked' | 'copied' | 'existing'

/**
 * Driven port: the Siril work area the app owns. Source folders are only ever read; every write
 * lands under `workDir`.
 */
export interface SirilWorkspace {
  /** FITS frames directly inside the source folder, with IMAGETYP when the catalogue knows it. */
  listSourceFrames(sourceDir: string): Promise<{ path: string; name: string; imageType: string | null }[]>
  /** Puts one frame in place: a hard link when the volume allows it, else a copy. */
  place(placement: SirilPlacement, workDir: string): Promise<PlacementResult>
  /** Creates the four Siril folders under workDir. */
  prepareFolders(workDir: string): Promise<void>
}
