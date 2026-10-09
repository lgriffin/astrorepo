import type { ArchiveCopy, ArchiveIndex, ArchiveMode, WorkAreaFile } from '@astro/domain'

/**
 * Driven port: the disk an archive is made on. It reads the work folder and the source frames,
 * writes only a new archive folder, and removes only the work folder's intermediate folders.
 * Source folders are never written to.
 */
export interface ArchiveArea {
  /**
   * Every file under the work folder, links not followed; empty when it does not exist. Throws when
   * a folder or file in it cannot be read, so nothing is judged on a partial listing. Writes nothing.
   */
  survey(workDir: string): Promise<WorkAreaFile[]>
  /** A text file of the work folder (a stack manifest), by its path relative to the work folder. */
  readText(workDir: string, relative: string): Promise<string>
  /** Each file's size now, in the order given; null when it is gone. Reads nothing but metadata. */
  sizes(paths: string[]): Promise<(number | null)[]>
  /** Free bytes on the disk where `dir` is or will be; null when the system will not say. */
  freeBytes(dir: string): Promise<number | null>
  /** Whether anything exists at `path`. */
  exists(path: string): Promise<boolean>
  /** A folder inside `dir`, spelled the way this disk spells paths. */
  join(dir: string, name: string): string
  /**
   * Makes the archive folder `dest` in one go: copies each file into a staging folder beside it,
   * checks every copy's size against the plan, writes the index, then renames the staging folder
   * to `dest`. On any failure the staging folder is removed, so nothing is left at `dest`.
   * Refuses a `dest` that already exists. Returns the index's path.
   */
  build(workDir: string, dest: string, copies: ArchiveCopy[], index: ArchiveIndex): Promise<string>
  /**
   * Removes these top-level intermediate folders of the work folder and everything in them, and
   * nothing else: a name that is not an intermediate folder is skipped, and a folder that is a link
   * or leads outside the work folder is refused before any folder is removed. Returns the folders
   * that were there and are gone; throws FolderRemovalError when one fails part way.
   */
  removeFolders(workDir: string, folders: string[]): Promise<string[]>
}

/**
 * A removal that stopped part way: every folder was checked before any went, but one could not be
 * removed. `removed` are the folders already gone.
 */
export class FolderRemovalError extends Error {
  constructor(
    readonly removed: string[],
    readonly folder: string,
    reason: string
  ) {
    super(`The work folder's ${folder} could not be removed: ${reason.replace(/\.?$/, '.')}`)
    this.name = 'FolderRemovalError'
  }
}

/** A target that was archived, and while its frames looked like `fingerprint`. */
export interface ArchiveRecord {
  targetId: string
  archivedAt: Date
  mode: ArchiveMode
  /** The archive folder. */
  path: string
  fingerprint: string
  copiedBytes: number
  /** The intermediate folders removed afterwards, and the bytes that gave back. */
  removed: string[]
  freedBytes: number
}

/** Driven port: which targets are archived. One record per target; archiving again replaces it. */
export interface ArchiveStore {
  get(targetId: string): Promise<ArchiveRecord | null>
  list(): Promise<ArchiveRecord[]>
  save(record: ArchiveRecord): Promise<void>
}
