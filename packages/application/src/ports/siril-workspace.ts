import type { SirilPlacement } from '@astro/domain'

export type PlacementResult = 'linked' | 'copied' | 'existing'

/**
 * Driven port: the Siril work area the app owns. Source folders are only ever read; every write
 * lands under `workDir`.
 */
export interface SirilWorkspace {
  /**
   * FITS frames in the source folder and its subfolders, with IMAGETYP when the catalogue knows it
   * (else a hint from a folder named for the frame type, such as "darks").
   */
  listSourceFrames(sourceDir: string): Promise<{ path: string; name: string; imageType: string | null }[]>
  /**
   * Puts one frame in place: a hard link when the volume allows it, else a copy. A frame already
   * there is kept only while it still matches its source; a stale one is replaced.
   */
  place(placement: SirilPlacement, workDir: string): Promise<PlacementResult>
  /** Creates the four Siril folders under workDir. */
  prepareFolders(workDir: string): Promise<void>
  /** Whether `candidate` is `dir` or lies inside it, following links. */
  contains(dir: string, candidate: string): Promise<boolean>
}
