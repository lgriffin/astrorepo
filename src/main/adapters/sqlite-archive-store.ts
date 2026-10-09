import type Database from 'better-sqlite3'
import type { ArchiveRecord, ArchiveStore } from '@astro/application'
import type { ArchiveMode } from '@astro/domain'

interface Row {
  target_id: string
  archived_at: string
  mode: string
  archive_path: string
  fingerprint: string
  copied_bytes: number
  removed: string
  freed_bytes: number
}

const toRecord = (r: Row): ArchiveRecord => ({
  targetId: r.target_id,
  archivedAt: new Date(r.archived_at),
  mode: r.mode as ArchiveMode,
  path: r.archive_path,
  fingerprint: r.fingerprint,
  copiedBytes: r.copied_bytes,
  removed: JSON.parse(r.removed) as string[],
  freedBytes: r.freed_bytes
})

/** ArchiveStore over the target_archives table: one row per target. */
export class SqliteArchiveStore implements ArchiveStore {
  constructor(private readonly db: Database.Database) {}

  async get(targetId: string): Promise<ArchiveRecord | null> {
    const row = this.db.prepare('SELECT * FROM target_archives WHERE target_id = ?').get(targetId) as Row | undefined
    return row ? toRecord(row) : null
  }

  async list(): Promise<ArchiveRecord[]> {
    return (this.db.prepare('SELECT * FROM target_archives ORDER BY archived_at').all() as Row[]).map(toRecord)
  }

  async save(r: ArchiveRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO target_archives (target_id, archived_at, mode, archive_path, fingerprint, copied_bytes, removed, freed_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_id) DO UPDATE SET archived_at = excluded.archived_at, mode = excluded.mode,
         archive_path = excluded.archive_path, fingerprint = excluded.fingerprint, copied_bytes = excluded.copied_bytes,
         removed = excluded.removed, freed_bytes = excluded.freed_bytes`
    ).run(r.targetId, r.archivedAt.toISOString(), r.mode, r.path, r.fingerprint, r.copiedBytes, JSON.stringify(r.removed), r.freedBytes)
  }
}
