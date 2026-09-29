import type { FileHash, FileStamp } from '@astro/domain'

/** Driven port: the indexed files that still exist, with their size and modified time as they are now. */
export interface FileIndex {
  listIndexedFiles(): Promise<FileStamp[]>
}

/** Driven port: reads file content to identify it. Read-only by contract. */
export interface ContentHasher {
  /** A cheap key from the file's size and sampled bytes (its start and end). */
  quickKey(file: FileStamp): Promise<string>
  /** A hash of every byte. */
  fullHash(path: string): Promise<string>
}

/** Driven port: remembers hashes so unchanged files are never read twice. */
export interface FileHashStore {
  listHashes(): Promise<FileHash[]>
  /** Upserts by path. */
  saveHashes(hashes: FileHash[]): Promise<void>
  /** Forgets paths no longer indexed. */
  removeHashes(paths: string[]): Promise<void>
}
