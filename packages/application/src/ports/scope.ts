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
   * Streams one file to `onChunk` from byte `offset`, asking the scope to start there (REST); when
   * it will not, the bytes start at 0. `onStart` hears where they start before the first byte.
   * Writes nothing on the PC (spec 034, VIN-024).
   */
  retrieve(remote: string, offset: number, onStart: (from: number) => void, onChunk: (chunk: Uint8Array) => void): Promise<void>
  /** Signs out and closes; never throws. */
  close(): Promise<void>
}

/** Nothing answered at the scope's address, or it refused the connection. */
export class ScopeUnreachableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ScopeUnreachableError'
  }
}
