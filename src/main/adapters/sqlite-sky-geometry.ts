import path from 'path'
import type Database from 'better-sqlite3'
import { ulid } from 'ulid'
import type { MosaicStore, MosaicTarget, SavedMosaic, SolveStore, StoredSolve } from '@astro/application'
import { WCS_KEYWORDS, type SkyFile, type SolveSource, type WcsCards } from '@astro/domain'
import { IS_LIGHT, parseUtc } from './sqlite-frame-catalogue'
import { HEADER_NUMBER, IS_INTEGRATED_LIGHT } from './sqlite-stack-catalogue'

interface FileRow {
  id: string
  file_path: string
  target_id: string
  is_master: number
  date_obs: string | null
  exposure_sec: number | null
  file_size_bytes: number
  naxis1: number | null
  naxis2: number | null
  xpixsz: number | null
  focal: number | null
}

interface SolveRow {
  file_path: string
  ra_deg: number | null
  dec_deg: number | null
  rotation_deg: number | null
  scale_arcsec: number | null
  width_px: number | null
  height_px: number | null
  /** 1 mirrored, 0 the sky as seen, null when the solver did not say. */
  flipped: number | null
  solver: SolveSource
  solved_at: string
  error: string | null
}

/** Folder of a path written on Windows or elsewhere. */
const folderOf = (p: string) => (p.includes('\\') ? path.win32.dirname(p) : path.posix.dirname(p))

/**
 * SolveStore over fits_files, fits_headers and plate_solves. Lights are the target's unstacked
 * light subs with an exposure; masters are its integrated stacks (not calibrated subs or master
 * calibration frames, which point nowhere useful). Only FITS files: the solvers are handed a copy
 * named solve.fit, which a camera RAW frame is not (RIG-019).
 */
export class SqliteSolveStore implements SolveStore {
  constructor(private readonly db: Database.Database) {}

  async files(targetId?: string): Promise<SkyFile[]> {
    const rows = this.db
      .prepare(
        `SELECT f.id, f.file_path, f.target_id, f.date_obs, f.exposure_sec, f.file_size_bytes, f.naxis1, f.naxis2, f.xpixsz,
                CASE WHEN f.is_stacked = 1 THEN 1 ELSE 0 END AS is_master, ${HEADER_NUMBER('FOCALLEN')} AS focal
         FROM fits_files f
         WHERE f.target_id IS NOT NULL ${targetId ? 'AND f.target_id = @targetId' : ''}
           AND f.source_format = 'fits'
           AND ((f.is_stacked = 0 AND f.exposure_sec IS NOT NULL AND ${IS_LIGHT}) OR (f.is_stacked = 1 AND ${IS_INTEGRATED_LIGHT}))
         ORDER BY f.file_path`
      )
      .all(targetId ? { targetId } : {}) as FileRow[]
    const cards = new Map<string, WcsCards>()
    const headers = this.db
      .prepare(
        `SELECT h.file_id, h.keyword, h.value FROM fits_headers h
         JOIN fits_files f ON f.id = h.file_id
         WHERE h.keyword IN (${WCS_KEYWORDS.map(() => '?').join(', ')}) AND f.target_id IS NOT NULL ${targetId ? 'AND f.target_id = ?' : ''}`
      )
      .all(...WCS_KEYWORDS, ...(targetId ? [targetId] : [])) as { file_id: string; keyword: string; value: string | null }[]
    for (const h of headers) cards.set(h.file_id, { ...(cards.get(h.file_id) ?? {}), [h.keyword]: h.value })
    return rows.map(r => {
      const wcs = cards.get(r.id)
      return {
        path: r.file_path,
        targetId: r.target_id,
        kind: r.is_master ? 'master' : 'light',
        capturedAt: parseUtc(r.date_obs),
        folder: folderOf(r.file_path),
        exposureSec: r.exposure_sec,
        sizeBytes: r.file_size_bytes,
        widthPx: r.naxis1,
        heightPx: r.naxis2,
        optics: r.focal && r.focal > 0 && r.xpixsz && r.xpixsz > 0 ? { focalMm: r.focal, pixelUm: r.xpixsz } : null,
        wcs: wcs && wcs.CRVAL1 !== undefined && wcs.CRVAL2 !== undefined ? wcs : null
      }
    })
  }

  async solves(paths?: string[]): Promise<StoredSolve[]> {
    let rows: SolveRow[]
    if (paths === undefined) rows = this.db.prepare('SELECT * FROM plate_solves ORDER BY file_path').all() as SolveRow[]
    else {
      const get = this.db.prepare('SELECT * FROM plate_solves WHERE file_path = ?')
      rows = paths.map(p => get.get(p) as SolveRow | undefined).filter((r): r is SolveRow => !!r)
    }
    return rows.map(r => ({
      path: r.file_path,
      field:
        r.ra_deg !== null && r.dec_deg !== null && r.scale_arcsec !== null && r.width_px !== null && r.height_px !== null
          ? {
              raDeg: r.ra_deg,
              decDeg: r.dec_deg,
              rotationDeg: r.rotation_deg ?? 0,
              scaleArcsec: r.scale_arcsec,
              widthPx: r.width_px,
              heightPx: r.height_px,
              ...(r.flipped === null ? {} : { flipped: r.flipped === 1 })
            }
          : null,
      source: r.solver,
      solvedAt: new Date(r.solved_at),
      error: r.error
    }))
  }

  async save(solve: StoredSolve): Promise<void> {
    const f = solve.field
    this.db
      .prepare(
        `INSERT OR REPLACE INTO plate_solves (file_path, ra_deg, dec_deg, rotation_deg, scale_arcsec, width_px, height_px, flipped, solver, solved_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        solve.path,
        f?.raDeg ?? null,
        f?.decDeg ?? null,
        f?.rotationDeg ?? null,
        f?.scaleArcsec ?? null,
        f?.widthPx ?? null,
        f?.heightPx ?? null,
        f?.flipped === undefined ? null : f.flipped ? 1 : 0,
        solve.source,
        solve.solvedAt.toISOString(),
        solve.error
      )
  }
}

interface PlanRow {
  target_id: string
  field_width_deg: number
  field_height_deg: number
  rotation_deg: number
  overlap: number
  saved_at: string
}

const toPlan = (r: PlanRow): SavedMosaic => ({
  targetId: r.target_id,
  field: { widthDeg: r.field_width_deg, heightDeg: r.field_height_deg },
  rotationDeg: r.rotation_deg,
  overlap: r.overlap,
  savedAt: new Date(r.saved_at)
})

/** MosaicStore over targets, integration_goals, mosaic_plans and target_relationships (part_of_mosaic). */
export class SqliteMosaicStore implements MosaicStore {
  constructor(private readonly db: Database.Database) {}

  async target(targetId: string): Promise<MosaicTarget | null> {
    const row = this.db
      .prepare(
        `SELECT t.id, t.canonical_name, t.ra_hours, t.dec_degrees, t.angular_size_arcmin,
                (SELECT SUM(g.goal_seconds) FROM integration_goals g WHERE g.target_id = t.id) AS goal_sec
         FROM targets t WHERE t.id = ?`
      )
      .get(targetId) as { id: string; canonical_name: string; ra_hours: number | null; dec_degrees: number | null; angular_size_arcmin: number | null; goal_sec: number | null } | undefined
    if (!row) return null
    return { id: row.id, name: row.canonical_name, raHours: row.ra_hours, decDeg: row.dec_degrees, sizeArcmin: row.angular_size_arcmin, goalSec: row.goal_sec }
  }

  async plan(targetId: string): Promise<SavedMosaic | null> {
    const row = this.db.prepare('SELECT * FROM mosaic_plans WHERE target_id = ?').get(targetId) as PlanRow | undefined
    return row ? toPlan(row) : null
  }

  async plans(): Promise<SavedMosaic[]> {
    return (this.db.prepare('SELECT * FROM mosaic_plans ORDER BY target_id').all() as PlanRow[]).map(toPlan)
  }

  async savePlan(plan: SavedMosaic): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO mosaic_plans (target_id, field_width_deg, field_height_deg, rotation_deg, overlap, saved_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(plan.targetId, plan.field.widthDeg, plan.field.heightDeg, plan.rotationDeg, plan.overlap, plan.savedAt.toISOString())
  }

  /**
   * One link per pair whichever side asks: the check and the insert run in one transaction, and a
   * new link is written lesser id first so the table's unique pair catches a second writer.
   */
  async linkPanels(targetId: string, panelTargetIds: string[]): Promise<void> {
    const exists = this.db.prepare(
      `SELECT 1 FROM target_relationships WHERE relationship_type = 'part_of_mosaic'
         AND ((source_target_id = @a AND related_target_id = @b) OR (source_target_id = @b AND related_target_id = @a))`
    )
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO target_relationships (id, source_target_id, related_target_id, relationship_type, created_at)
       VALUES (?, ?, ?, 'part_of_mosaic', ?)`
    )
    const now = new Date().toISOString()
    this.db.transaction(() => {
      for (const other of new Set(panelTargetIds)) {
        if (other === targetId) continue
        const [a, b] = other < targetId ? [other, targetId] : [targetId, other]
        if (!exists.get({ a, b })) insert.run(ulid(), a, b, now)
      }
    })()
  }

  async linked(targetId: string): Promise<string[]> {
    const rows = this.db
      .prepare(
        `SELECT CASE WHEN source_target_id = ? THEN related_target_id ELSE source_target_id END AS other
         FROM target_relationships WHERE relationship_type = 'part_of_mosaic' AND (source_target_id = ? OR related_target_id = ?)`
      )
      .all(targetId, targetId, targetId) as { other: string }[]
    return [...new Set(rows.map(r => r.other))].sort()
  }
}
