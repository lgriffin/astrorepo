import type Database from 'better-sqlite3'
import type { FrameCatalogue } from '@astro/application'
import type { TargetFrames } from '@astro/domain'

interface FrameRow {
  target_id: string
  target_name: string
  is_stacked: number
  exposure_sec: number | null
  date_obs: string | null
  file_modified_at: string | null
  created_at: string
}

/** FITS DATE-OBS is UTC but usually written without a zone; read it as UTC, not local time. */
export function parseUtc(value: string | null): Date | null {
  if (!value) return null
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value)
  const d = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * FrameCatalogue over the desktop app's existing fits_files table.
 * Takes the database handle instead of calling getSqlite(), so it can be composed and tested
 * without mocking modules.
 */
export class SqliteFrameCatalogue implements FrameCatalogue {
  constructor(private readonly db: Database.Database) {}

  async listTargetFrames(): Promise<TargetFrames[]> {
    const rows = this.db.prepare(
      `SELECT f.target_id, t.canonical_name AS target_name, f.is_stacked, f.exposure_sec,
              f.date_obs, f.file_modified_at, f.created_at
       FROM fits_files f
       JOIN targets t ON t.id = f.target_id
       WHERE f.is_stacked = 1
          OR (f.exposure_sec IS NOT NULL
              AND (f.image_type = 'Light Frame' OR f.image_type = 'light' OR f.image_type IS NULL))
       ORDER BY t.canonical_name, f.date_obs`
    ).all() as FrameRow[]

    const byTarget = new Map<string, TargetFrames>()
    for (const r of rows) {
      let t = byTarget.get(r.target_id)
      if (!t) {
        t = { targetId: r.target_id, targetName: r.target_name, subs: [], stacks: [] }
        byTarget.set(r.target_id, t)
      }
      if (r.is_stacked) {
        // A stack inherits DATE-OBS from its first sub, so when it was written is the better clock.
        const producedAt = parseUtc(r.file_modified_at) ?? parseUtc(r.date_obs) ?? parseUtc(r.created_at)
        if (producedAt) t.stacks.push({ producedAt })
      } else {
        t.subs.push({ exposureSec: r.exposure_sec ?? 0, capturedAt: parseUtc(r.date_obs) })
      }
    }
    return [...byTarget.values()]
  }
}
