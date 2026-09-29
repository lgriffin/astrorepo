import type Database from 'better-sqlite3'
import type { FrameCatalogue } from '@astro/application'
import type { CalibrationFrame, CalibrationKind, LightSetting, TargetFrames, UnassignedLight } from '@astro/domain'

interface FrameRow {
  target_id: string
  is_stacked: number
  exposure_sec: number | null
  date_obs: string | null
  file_modified_at: string | null
  created_at: string
  filter: string | null
  scope: string | null
  quality_flag: string | null
}

interface TargetRow {
  id: string
  canonical_name: string
  goal_sec: number | null
  processed: number | null
  final: number | null
}

/** FITS DATE-OBS is UTC but usually written without a zone; read it as UTC, not local time. */
export function parseUtc(value: string | null): Date | null {
  if (!value) return null
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value)
  const d = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Light frames as the scanners record them: typed as light, or untyped. */
const IS_LIGHT = `(f.image_type IS NULL OR LOWER(f.image_type) LIKE '%light%')`

/**
 * FrameCatalogue over the desktop app's existing fits_files table.
 * Takes the database handle instead of calling getSqlite(), so it can be composed and tested
 * without mocking modules.
 */
export class SqliteFrameCatalogue implements FrameCatalogue {
  constructor(private readonly db: Database.Database) {}

  async listTargetFrames(): Promise<TargetFrames[]> {
    const frames = this.db.prepare(
      `SELECT f.target_id, f.is_stacked, f.exposure_sec, f.date_obs, f.file_modified_at, f.created_at,
              f.filter, COALESCE(NULLIF(TRIM(f.telescope), ''), NULLIF(TRIM(f.instrument), '')) AS scope,
              f.quality_flag
       FROM fits_files f
       WHERE f.target_id IS NOT NULL
         AND (f.is_stacked = 1 OR (f.exposure_sec IS NOT NULL AND ${IS_LIGHT}))
       ORDER BY f.date_obs`
    ).all() as FrameRow[]

    const targets = this.db.prepare(
      `SELECT t.id, t.canonical_name,
              (SELECT SUM(g.goal_seconds) FROM integration_goals g WHERE g.target_id = t.id) AS goal_sec,
              h.tif_files AS processed, h.image_files AS final
       FROM targets t
       LEFT JOIN target_home_data h ON h.target_id = t.id
       WHERE EXISTS (SELECT 1 FROM fits_files f WHERE f.target_id = t.id)
          OR EXISTS (SELECT 1 FROM integration_goals g WHERE g.target_id = t.id)
          OR COALESCE(h.tif_files, 0) > 0 OR COALESCE(h.image_files, 0) > 0`
    ).all() as TargetRow[]

    const byTarget = new Map<string, TargetFrames>()
    for (const t of targets) {
      byTarget.set(t.id, {
        targetId: t.id,
        targetName: t.canonical_name,
        subs: [],
        stacks: [],
        goalSec: t.goal_sec,
        processedCount: t.processed ?? 0,
        finalCount: t.final ?? 0
      })
    }
    for (const r of frames) {
      const t = byTarget.get(r.target_id)
      if (!t) continue
      if (r.is_stacked) {
        // A stack inherits DATE-OBS from its first sub, so when it was written is the better clock.
        const producedAt = parseUtc(r.file_modified_at) ?? parseUtc(r.date_obs) ?? parseUtc(r.created_at)
        if (producedAt) t.stacks.push({ producedAt })
      } else {
        t.subs.push({
          exposureSec: r.exposure_sec ?? 0,
          capturedAt: parseUtc(r.date_obs),
          filter: r.filter,
          scope: r.scope,
          rejected: r.quality_flag === 'reject'
        })
      }
    }
    return [...byTarget.values()]
      .filter(t => t.subs.length > 0 || t.stacks.length > 0 || t.goalSec !== null || t.processedCount > 0 || t.finalCount > 0)
      .sort((a, b) => a.targetName.localeCompare(b.targetName))
  }

  async listUnassignedLights(): Promise<UnassignedLight[]> {
    const rows = this.db.prepare(
      `SELECT f.exposure_sec, f.date_obs, f.folder_name, f.object_name, f.quality_flag
       FROM fits_files f
       WHERE f.target_id IS NULL AND f.is_stacked = 0 AND f.exposure_sec IS NOT NULL AND ${IS_LIGHT}
       ORDER BY f.date_obs`
    ).all() as { exposure_sec: number; date_obs: string | null; folder_name: string | null; object_name: string | null; quality_flag: string | null }[]
    return rows.map(r => ({
      exposureSec: r.exposure_sec,
      capturedAt: parseUtc(r.date_obs),
      folder: r.folder_name,
      objectName: r.object_name,
      rejected: r.quality_flag === 'reject'
    }))
  }

  async listCalibrationFrames(): Promise<CalibrationFrame[]> {
    const rows = this.db.prepare(
      `SELECT LOWER(f.image_type) AS image_type, f.exposure_sec, f.gain, f.ccd_temp, f.filter
       FROM fits_files f
       WHERE f.is_stacked = 0
         AND (LOWER(f.image_type) LIKE '%dark%' OR LOWER(f.image_type) LIKE '%flat%'
              OR LOWER(f.image_type) LIKE '%bias%' OR LOWER(f.image_type) LIKE '%offset%')`
    ).all() as { image_type: string; exposure_sec: number | null; gain: number | null; ccd_temp: number | null; filter: string | null }[]
    return rows.map(r => ({
      kind: calibrationKind(r.image_type),
      exposureSec: r.exposure_sec,
      gain: r.gain,
      sensorTempC: r.ccd_temp,
      filter: r.filter
    }))
  }

  async listLightSettings(): Promise<LightSetting[]> {
    const rows = this.db.prepare(
      `SELECT f.exposure_sec, f.gain, ROUND(f.ccd_temp) AS temp, f.filter, COUNT(*) AS count
       FROM fits_files f
       WHERE f.is_stacked = 0 AND f.exposure_sec IS NOT NULL AND ${IS_LIGHT}
       GROUP BY f.exposure_sec, f.gain, ROUND(f.ccd_temp), f.filter`
    ).all() as { exposure_sec: number | null; gain: number | null; temp: number | null; filter: string | null; count: number }[]
    return rows.map(r => ({
      exposureSec: r.exposure_sec,
      gain: r.gain,
      sensorTempC: r.temp,
      filter: r.filter,
      count: r.count
    }))
  }
}

/** Same reading of IMAGETYP as services/image-type.ts; "dark flat" counts as a dark. */
function calibrationKind(imageType: string): CalibrationKind {
  if (imageType.includes('dark')) return 'dark'
  if (imageType.includes('flat')) return 'flat'
  return 'bias'
}
