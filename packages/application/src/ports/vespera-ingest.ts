import type { ScopeEntry, TransferJob } from '@astro/domain'

/** What a read from the scope gives: the offset it really starts at (0 when the server will not resume) and the bytes from there. */
export type ScopeRead = { from: number; chunks: AsyncIterable<Uint8Array> }

/**
 * Driven port: a Vespera Pro's files, read-only (specs/034-vespera-ingest). There is no method to
 * write, rename, make or delete anything on the scope, and an adapter must never send a command that
 * does. Every method throws ScopeDisconnectedError when the link drops, including part way through
 * a read's chunks.
 */
export interface VesperaScope {
  /** The entries of a folder, `path` relative to the scope's root ('' for the root). */
  list(path: string): Promise<ScopeEntry[]>
  /** A file's bytes from `offset`; the result says where it really starts. */
  read(path: string, offset: number): Promise<ScopeRead>
  /** Up to the first `maxBytes` bytes of a file, for reading a name from its metadata. */
  head(path: string, maxBytes: number): Promise<Uint8Array>
}

/** The scope's link dropped: a transfer pauses on it and can be resumed. */
export class ScopeDisconnectedError extends Error {
  constructor(reason: string) {
    super(`The connection to the scope dropped: ${reason.replace(/\.?$/, '.')}`)
    this.name = 'ScopeDisconnectedError'
  }
}

/** A file being written on the destination disk. */
export type IngestWriter = { write(chunk: Uint8Array): Promise<void>; close(): Promise<void> }

/**
 * Driven port: the disk a copy from the scope lands on. Paths are absolute, made with `join`.
 */
export interface IngestDisk {
  join(dir: string, ...parts: string[]): string
  exists(path: string): Promise<boolean>
  /** A file's size; null when there is no file there. */
  size(path: string): Promise<number | null>
  /**
   * Opens `path` for writing from byte `from`: what is there is cut to `from` bytes (a missing file
   * is created, with its folders) and writes go after it.
   */
  append(path: string, from: number): Promise<IngestWriter>
  /** Moves a file over whatever is at `to`. */
  rename(from: string, to: string): Promise<void>
  /** Removes a file; nothing when it is not there. */
  remove(path: string): Promise<void>
  /** A text file's content; null when there is none. */
  readText(path: string): Promise<string | null>
  /** Writes a text file whole, making its folders: a reader never sees half of it. */
  writeText(path: string, text: string): Promise<void>
  /** Free bytes on the disk where `path` is or would be; null when the system will not say. */
  freeBytes(path: string): Promise<number | null>
}

/** Driven port: reads a target's name from a file's metadata. Pure; never throws on bad bytes. */
export interface VesperaMetadata {
  /** The ImageDescription of a JPEG's EXIF, where the scope writes the object and stack count; null when there is none. */
  exifDescription(bytes: Uint8Array): string | null
  /** The OBJECT card of a FITS header; null when there is none. */
  fitsObject(bytes: Uint8Array): string | null
}

/** Driven port: the transfers astrorepo has planned, by job id. Saving again replaces a job. */
export interface VesperaTransferStore {
  save(job: TransferJob): Promise<void>
  get(id: string): Promise<TransferJob | null>
  /** Every job, newest first. */
  list(): Promise<TransferJob[]>
}
