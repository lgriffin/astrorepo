import fs from 'fs'
import type Database from 'better-sqlite3'
import type { StackCatalogue, StackFile } from '@astro/application'
import type { RecipeTarget } from '@astro/domain'
import { IS_LIGHT, parseUtc } from './sqlite-frame-catalogue'

/** A header card's number, without the quotes some writers put around it. */
const HEADER_NUMBER = (keyword: string) =>
  `(SELECT CAST(TRIM(REPLACE(h.value, '''', '')) AS REAL) FROM fits_headers h WHERE h.file_id = f.id AND h.keyword = '${keyword}' LIMIT 1)`

/**
 * An integration, not just a flagged file: the scanner also marks a calibrated sub (CALSTAT alone)
 * as stacked, and master calibration frames are stacks too, so neither is offered.
 */
const IS_INTEGRATED_LIGHT = `(${IS_LIGHT.replace("LIKE '%light%'", "LIKE '%light%' OR LOWER(f.image_type) LIKE '%stack%' OR LOWER(f.image_type) LIKE '%integrat%'")}
  AND (COALESCE(f.ncombine, 0) > 1
       OR (f.total_exposure IS NOT NULL AND f.exposure_sec IS NOT NULL AND f.total_exposure > f.exposure_sec)
       OR LOWER(COALESCE(f.image_type, '')) LIKE '%stack%'
       OR LOWER(COALESCE(f.image_type, '')) LIKE '%integrat%'))`

/** StackCatalogue over the targets and fits_files tables. Stacks whose file is gone are left out. */
export class SqliteStackCatalogue implements StackCatalogue {
  constructor(
    private readonly db: Database.Database,
    private readonly exists: (p: string) => boolean = p => fs.existsSync(p)
  ) {}

  async describeTarget(targetId: string): Promise<RecipeTarget | null> {
    const row = this.db
      .prepare('SELECT canonical_name, object_type, ra_hours, dec_degrees FROM targets WHERE id = ?')
      .get(targetId) as { canonical_name: string; object_type: string | null; ra_hours: number | null; dec_degrees: number | null } | undefined
    return row ? { name: row.canonical_name, objectType: row.object_type, raHours: row.ra_hours, decDeg: row.dec_degrees } : null
  }

  async listStacks(targetId: string): Promise<StackFile[]> {
    const rows = this.db
      .prepare(
        `SELECT f.file_path, f.file_size_bytes, f.naxis1, f.naxis2, f.xpixsz, f.file_modified_at, f.created_at,
                ${HEADER_NUMBER('NAXIS3')} AS naxis3, ${HEADER_NUMBER('FOCALLEN')} AS focal
         FROM fits_files f WHERE f.target_id = ? AND f.is_stacked = 1 AND ${IS_INTEGRATED_LIGHT}`
      )
      .all(targetId) as {
      file_path: string
      file_size_bytes: number
      naxis1: number | null
      naxis2: number | null
      xpixsz: number | null
      file_modified_at: string | null
      created_at: string | null
      naxis3: number | null
      focal: number | null
    }[]
    return rows
      .filter(r => this.exists(r.file_path))
      .map(r => ({
        path: r.file_path,
        sizeBytes: r.file_size_bytes,
        width: r.naxis1,
        height: r.naxis2,
        colour: r.naxis3 === null ? true : r.naxis3 >= 3,
        focalMm: r.focal || null,
        pixelUm: r.xpixsz || null,
        modifiedAt: parseUtc(r.file_modified_at) ?? parseUtc(r.created_at)
      }))
      .sort((a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0))
  }

  async targetOptics(targetId: string): Promise<{ focalMm: number; pixelUm: number } | null> {
    const row = this.db
      .prepare(
        `SELECT focal, xpixsz, COUNT(*) AS n FROM (
           SELECT ${HEADER_NUMBER('FOCALLEN')} AS focal, f.xpixsz
           FROM fits_files f WHERE f.target_id = ? AND f.is_stacked = 0 AND ${IS_LIGHT}
         ) WHERE focal > 0 AND xpixsz > 0
         GROUP BY focal, xpixsz ORDER BY n DESC LIMIT 1`
      )
      .get(targetId) as { focal: number; xpixsz: number } | undefined
    return row ? { focalMm: row.focal, pixelUm: row.xpixsz } : null
  }
}
