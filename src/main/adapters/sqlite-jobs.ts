import type Database from 'better-sqlite3'
import { ulid } from 'ulid'
import type { JobPatch, JobSettingsSource, JobStore } from '@astro/application'
import { parseJobSettings, type Job, type JobSettings, type NewJob } from '@astro/domain'

interface JobRow {
  id: string
  kind: Job['kind']
  target_id: string
  title: string
  timing: Job['timing']
  state: Job['state']
  command: string
  prepare: string | null
  space_dir: string
  needed_bytes: number
  queued_at: string
  started_at: string | null
  finished_at: string | null
  exit_code: number | null
  note: string | null
  attempts: number
}

const date = (s: string | null) => (s ? new Date(s) : null)

function toJob(r: JobRow): Job {
  return {
    id: r.id,
    kind: r.kind,
    targetId: r.target_id,
    title: r.title,
    timing: r.timing,
    state: r.state,
    command: JSON.parse(r.command),
    prepare: r.prepare ? JSON.parse(r.prepare) : null,
    spaceDir: r.space_dir,
    neededBytes: r.needed_bytes,
    queuedAt: new Date(r.queued_at),
    startedAt: date(r.started_at),
    finishedAt: date(r.finished_at),
    exitCode: r.exit_code,
    note: r.note,
    attempts: r.attempts
  }
}

const COLUMNS: Record<keyof JobPatch, string> = {
  state: 'state',
  timing: 'timing',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
  exitCode: 'exit_code',
  note: 'note',
  attempts: 'attempts'
}

/** JobStore over the jobs table. */
export class SqliteJobStore implements JobStore {
  constructor(private readonly db: Database.Database) {}

  async add(job: NewJob, queuedAt: Date): Promise<Job> {
    const id = ulid()
    this.db
      .prepare(
        `INSERT INTO jobs (id, kind, target_id, title, timing, state, command, prepare, space_dir, needed_bytes, queued_at, attempts)
         VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, 0)`
      )
      .run(id, job.kind, job.targetId, job.title, job.timing, JSON.stringify(job.command), job.prepare ? JSON.stringify(job.prepare) : null, job.spaceDir, job.neededBytes, queuedAt.toISOString())
    return (await this.get(id)) as Job
  }

  async get(id: string): Promise<Job | null> {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? toJob(row) : null
  }

  async list(): Promise<Job[]> {
    return (this.db.prepare('SELECT * FROM jobs ORDER BY queued_at, id').all() as JobRow[]).map(toJob)
  }

  async update(id: string, patch: JobPatch): Promise<Job> {
    const entries = Object.entries(patch).filter(([key, value]) => key in COLUMNS && value !== undefined) as [keyof JobPatch, unknown][]
    if (entries.length > 0) {
      const sets = entries.map(([key]) => `${COLUMNS[key]} = ?`).join(', ')
      const values = entries.map(([, value]) => (value instanceof Date ? value.toISOString() : value))
      this.db.prepare(`UPDATE jobs SET ${sets} WHERE id = ?`).run(...values, id)
    }
    const job = await this.get(id)
    if (!job) throw new Error(`No job ${id}`)
    return job
  }
}

/** The run window and idle rules from app_settings, with defaults for anything unset. */
export class SqliteJobSettings implements JobSettingsSource {
  constructor(private readonly db: Database.Database) {}

  async read(): Promise<JobSettings> {
    const get = this.db.prepare('SELECT value FROM app_settings WHERE key = ?')
    return parseJobSettings(key => (get.get(key) as { value: string } | undefined)?.value ?? null)
  }
}
