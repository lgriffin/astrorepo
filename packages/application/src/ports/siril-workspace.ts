import type { FrameIndexSettings, InputFrame, SirilFolder, SirilPlacement } from '@astro/domain'

export type PlacementResult = 'linked' | 'copied' | 'existing'

/** What the index and the disk say about one source frame. */
export interface FrameDetail {
  path: string
  sizeBytes: number
  /** NAXIS1 and NAXIS2 from the indexed header; null when the frame was never indexed. */
  width: number | null
  height: number | null
  /** True when the header names a Bayer pattern (a colour sensor), false when indexed without one, null when unknown. */
  colour: boolean | null
  /** Capture settings the index holds (exposure, gain, temperature, filter, time, optics); null when never indexed. */
  settings: FrameIndexSettings | null
}

export interface WorkAreaSpace {
  /** Free bytes on the work area's disk; null when the system will not say. */
  freeBytes: number | null
  /** Bytes already in the work folder's process and masters folders from an earlier run. */
  usedBytes: number
}

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
  /** Size, dimensions and sensor type of each frame, in the order given. Reads nothing but headers the index holds. */
  frameDetails(paths: string[]): Promise<FrameDetail[]>
  /** Free space where `workDir` lives (or will), and what an earlier run left there. Writes nothing. */
  workAreaSpace(workDir: string): Promise<WorkAreaSpace>
  /**
   * Bytes `place` would copy for these placements: nothing for a frame already current in the work
   * area or one it can hard-link (on the same volume as the work area). Writes nothing.
   */
  copyBytes(placements: SirilPlacement[], workDir: string): Promise<number>
  /**
   * Removes the named entries from one of the work folder's frame folders (frames an earlier run
   * placed that the plan now leaves out). Touches nothing else: files the user put there by hand
   * stay. Only ever writes inside the work area, refusing a frame folder that links elsewhere; a
   * removed hard link leaves its source untouched. Returns the names that were there and are gone.
   */
  remove(workDir: string, folder: SirilFolder, names: string[]): Promise<string[]>
  /** Stacks a Siril run left in `workDir` (its result*.fit files), newest first. Writes nothing. */
  stackResults(workDir: string): Promise<{ path: string; sizeBytes: number; modifiedAt: Date | null }[]>
  /**
   * Every frame in the work folder's input folders (lights, darks, flats, biases) as Siril will
   * read it, whoever put it there, with its size and modified time. Writes nothing.
   */
  inputFrames(workDir: string): Promise<InputFrame[]>
}
