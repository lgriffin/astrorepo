import type Database from 'better-sqlite3'
import type { FileHashStore, FileIndex } from '@astro/application'
import type { FileHash, FileStamp } from '@astro/domain'

/** FileIndex over the FITS files the scanners have indexed. */
export class SqliteFileIndex implements FileIndex {
  constructor(private readonly db: Database.Database) {}

  async listIndexedFiles(): Promise<FileStamp[]> {
    const rows = this.db.prepare(
      'SELECT file_path, file_size_bytes, file_modified_at FROM fits_files ORDER BY file_path'
    ).all() as { file_path: string; file_size_bytes: number; file_modified_at: string | null }[]
    return rows.map(r => ({ path: r.file_path, sizeBytes: r.file_size_bytes, modifiedAt: r.file_modified_at ?? '' }))
  }
}

/** FileHashStore over the file_hashes table. */
export class SqliteFileHashStore implements FileHashStore {
  constructor(private readonly db: Database.Database, private readonly now: () => Date = () => new Date()) {}

  async listHashes(): Promise<FileHash[]> {
    const rows = this.db.prepare(
      'SELECT file_path, size_bytes, modified_at, quick_key, full_hash FROM file_hashes ORDER BY file_path'
    ).all() as { file_path: string; size_bytes: number; modified_at: string; quick_key: string; full_hash: string | null }[]
    return rows.map(r => ({
      path: r.file_path,
      sizeBytes: r.size_bytes,
      modifiedAt: r.modified_at,
      quickKey: r.quick_key,
      fullHash: r.full_hash
    }))
  }

  async saveHashes(hashes: FileHash[]): Promise<void> {
    const upsert = this.db.prepare(
      `INSERT INTO file_hashes (file_path, size_bytes, modified_at, quick_key, full_hash, hashed_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_path) DO UPDATE SET size_bytes = excluded.size_bytes, modified_at = excluded.modified_at,
         quick_key = excluded.quick_key, full_hash = excluded.full_hash, hashed_at = excluded.hashed_at`
    )
    const at = this.now().toISOString()
    this.db.transaction(() => {
      for (const h of hashes) upsert.run(h.path, h.sizeBytes, h.modifiedAt, h.quickKey, h.fullHash, at)
    })()
  }

  async removeHashes(paths: string[]): Promise<void> {
    const del = this.db.prepare('DELETE FROM file_hashes WHERE file_path = ?')
    this.db.transaction(() => {
      for (const p of paths) del.run(p)
    })()
  }
}
