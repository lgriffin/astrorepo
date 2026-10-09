import type Database from 'better-sqlite3'
import type { FrameGradeStore, GradeLimitsSource } from '@astro/application'
import { parseGradeLimits, type FrameMeasurement, type GradableLight, type GradeLimits, type GradeOverride } from '@astro/domain'
import { IS_LIGHT, parseUtc } from './sqlite-frame-catalogue'

interface LightRow {
  id: string
  file_path: string
  date_obs: string | null
  filter: string | null
  file_size_bytes: number
  file_modified_at: string | null
  g_size: number | null
  g_modified: string | null
  fwhm: number | null
  eccentricity: number | null
  star_count: number | null
  background: number | null
  noise: number | null
  snr: number | null
  measure_error: string | null
  measured_at: string | null
  override: string | null
  override_by: string | null
}

const SELECT = `
  SELECT f.id, f.file_path, f.target_id, f.date_obs, NULLIF(TRIM(f.filter), '') AS filter, f.file_size_bytes, f.file_modified_at,
         g.size_bytes AS g_size, g.modified_at AS g_modified, g.fwhm, g.eccentricity, g.star_count, g.background,
         g.noise, g.snr, g.measure_error, g.measured_at, g.override, g.override_by
  FROM fits_files f
  LEFT JOIN frame_grades g ON g.file_path = f.file_path`

function toLight(r: LightRow): GradableLight {
  // A measurement taken before the file changed on disk describes other pixels.
  const current = r.measured_at !== null && r.g_size === r.file_size_bytes && (r.g_modified ?? null) === (r.file_modified_at ?? null)
  const measurement: FrameMeasurement | null =
    current && r.measure_error === null && r.background !== null && r.noise !== null
      ? { fwhm: r.fwhm, eccentricity: r.eccentricity, starCount: r.star_count ?? 0, background: r.background, noise: r.noise, snr: r.snr }
      : null
  return {
    fileId: r.id,
    path: r.file_path,
    capturedAt: parseUtc(r.date_obs),
    filter: r.filter,
    measurement,
    measureError: current ? r.measure_error : null,
    override: r.override === 'keep' || r.override === 'reject' ? r.override : null,
    overrideBy: r.override_by === 'night' ? 'night' : r.override ? 'frame' : null
  }
}

/** FrameGradeStore over fits_files and frame_grades. */
export class SqliteFrameGradeStore implements FrameGradeStore {
  constructor(private readonly db: Database.Database) {}

  async lightsOf(targetId: string): Promise<GradableLight[]> {
    const rows = this.db
      .prepare(`${SELECT} WHERE f.target_id = ? AND f.is_stacked = 0 AND ${IS_LIGHT} ORDER BY f.date_obs, f.file_path`)
      .all(targetId) as LightRow[]
    return rows.map(toLight)
  }

  async lightsAlongside(paths: string[]): Promise<GradableLight[]> {
    const byPath = new Map<string, GradableLight>()
    const targets = new Set<string>()
    // SQLite caps bound parameters; 500 a query stays well inside every build's limit.
    for (let i = 0; i < paths.length; i += 500) {
      const chunk = paths.slice(i, i + 500)
      const rows = this.db
        .prepare(`${SELECT} WHERE f.is_stacked = 0 AND ${IS_LIGHT} AND f.file_path IN (${chunk.map(() => '?').join(',')})`)
        .all(...chunk) as (LightRow & { target_id: string | null })[]
      for (const r of rows) {
        byPath.set(r.file_path, toLight(r))
        if (r.target_id) targets.add(r.target_id)
      }
    }
    const asked = paths.flatMap(p => byPath.get(p) ?? [])
    const peers: GradableLight[] = []
    for (const target of targets) for (const l of await this.lightsOf(target)) if (!byPath.has(l.path)) peers.push(l)
    return [...asked, ...peers]
  }

  async saveMeasurement(fileId: string, result: { measurement: FrameMeasurement } | { error: string }, at: Date): Promise<void> {
    const file = this.file(fileId)
    const m = 'measurement' in result ? result.measurement : null
    this.db
      .prepare(
        `INSERT INTO frame_grades (file_path, size_bytes, modified_at, fwhm, eccentricity, star_count, background, noise, snr, measure_error, measured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_path) DO UPDATE SET size_bytes = excluded.size_bytes, modified_at = excluded.modified_at, fwhm = excluded.fwhm,
           eccentricity = excluded.eccentricity, star_count = excluded.star_count, background = excluded.background, noise = excluded.noise,
           snr = excluded.snr, measure_error = excluded.measure_error, measured_at = excluded.measured_at`
      )
      .run(
        file.file_path, file.file_size_bytes, file.file_modified_at,
        m?.fwhm ?? null, m?.eccentricity ?? null, m?.starCount ?? null, m?.background ?? null, m?.noise ?? null, m?.snr ?? null,
        'error' in result ? result.error : null,
        at.toISOString()
      )
  }

  async setOverride(fileId: string, override: GradeOverride | null, at: Date): Promise<void> {
    const file = this.file(fileId)
    this.db
      .prepare(
        `INSERT INTO frame_grades (file_path, override, override_by, override_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(file_path) DO UPDATE SET override = excluded.override, override_by = excluded.override_by, override_at = excluded.override_at`
      )
      .run(file.file_path, override, override ? 'frame' : null, override ? at.toISOString() : null)
  }

  async setNightLeftOut(fileIds: string[], leftOut: boolean, at: Date): Promise<number> {
    const leave = this.db.prepare(
      `INSERT INTO frame_grades (file_path, override, override_by, override_at) VALUES (?, 'reject', 'night', ?)
       ON CONFLICT(file_path) DO UPDATE SET override = 'reject', override_by = 'night', override_at = excluded.override_at
       WHERE frame_grades.override IS NULL OR frame_grades.override_by = 'night'`
    )
    const restore = this.db.prepare(`UPDATE frame_grades SET override = NULL, override_by = NULL, override_at = NULL WHERE file_path = ? AND override_by = 'night'`)
    // One transaction: a frame missing from the index undoes the whole change.
    return this.db.transaction(() => {
      let changed = 0
      for (const id of fileIds) {
        const { file_path } = this.file(id)
        changed += (leftOut ? leave.run(file_path, at.toISOString()) : restore.run(file_path)).changes
      }
      return changed
    })()
  }

  private file(fileId: string) {
    const file = this.db.prepare('SELECT file_path, file_size_bytes, file_modified_at FROM fits_files WHERE id = ?').get(fileId) as
      | { file_path: string; file_size_bytes: number; file_modified_at: string | null }
      | undefined
    if (!file) throw new Error('That frame is no longer in the index. Scan its folder again.')
    return file
  }
}

/** Grading limits from app_settings, each falling back to its default. */
export class SqliteGradeLimits implements GradeLimitsSource {
  constructor(private readonly db: Database.Database) {}

  async read(): Promise<GradeLimits> {
    const get = this.db.prepare('SELECT value FROM app_settings WHERE key = ?')
    return parseGradeLimits(key => (get.get(key) as { value: string } | undefined)?.value ?? null)
  }
}
