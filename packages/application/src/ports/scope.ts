import type { RemoteEntry } from '@astro/domain'

/**
 * Driven port: a scope's file server (the Vespera's FTP server). It only reads: an adapter sends
 * nothing that could remove, rename or write a file on the scope (VSP-005).
 */
export interface ScopeFiles {
  /**
   * Connects and signs in (anonymously). Throws ScopeUnreachableError when nothing answers at
   * `host`, or the server refuses the sign-in.
   */
  open(host: string, port: number): Promise<ScopeConnection>
}

/** One signed-in connection to a scope, used by one caller at a time. */
export interface ScopeConnection {
  /** A folder's entries, sorted by name; throws when the folder cannot be listed. */
  list(dir: string): Promise<RemoteEntry[]>
  /**
   * Copies one file from the scope to `local` on the PC. The bytes go to a partial file beside
   * `local`, which becomes `local` only when the whole file has arrived and, when `expectedBytes`
   * is known, it is exactly that long; on any failure or cancel the partial file is removed and
   * nothing is left at `local`. Refuses when `local` already exists. Calls `onBytes` with the bytes
   * received so far, and stops at the next chunk once `cancelled()` is true (throwing
   * CopyCancelledError). Returns the bytes copied.
   */
  download(remote: string, local: string, expectedBytes: number | null, onBytes: (received: number) => void, cancelled: () => boolean): Promise<number>
  /** Signs out and closes; never throws. */
  close(): Promise<void>
}

/** Driven port: the PC folder copies land in. */
export interface LandingArea {
  /** A path under `root` from folder and file parts, spelled the way this disk spells paths. */
  join(root: string, parts: string[]): string
  /** Each file's size, in the order given; null when nothing is there. */
  sizes(paths: string[]): Promise<(number | null)[]>
  /** Free bytes on the disk where `dir` is or will be; null when the system will not say. */
  freeBytes(dir: string): Promise<number | null>
}

/** Nothing answered at the scope's address, or it refused the connection. */
export class ScopeUnreachableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ScopeUnreachableError'
  }
}

/** A copy stopped because the user cancelled it. */
export class CopyCancelledError extends Error {
  constructor() {
    super('The copy was cancelled.')
    this.name = 'CopyCancelledError'
  }
}
