import type Database from 'better-sqlite3'
import type { VesperaTransferStore } from '@astro/application'
import type { TransferJob } from '@astro/domain'

/** VesperaTransferStore over the vespera_transfers table: the job as JSON, one row per destination folder. */
export class SqliteVesperaTransferStore implements VesperaTransferStore {
  constructor(private readonly db: Database.Database) {}

  async save(job: TransferJob): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO vespera_transfers (id, session_id, state, job, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, state = excluded.state, job = excluded.job, updated_at = excluded.updated_at`
      )
      .run(job.id, job.sessionId, job.state, JSON.stringify(job), job.createdAt, job.updatedAt)
  }

  async get(id: string): Promise<TransferJob | null> {
    const row = this.db.prepare('SELECT job FROM vespera_transfers WHERE id = ?').get(id) as { job: string } | undefined
    return row ? (JSON.parse(row.job) as TransferJob) : null
  }

  async list(): Promise<TransferJob[]> {
    return (this.db.prepare('SELECT job FROM vespera_transfers ORDER BY created_at DESC, id').all() as { job: string }[]).map(r => JSON.parse(r.job) as TransferJob)
  }
}
