import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'
import type { GalleryCatalogue, GalleryImage, PaletteStore } from '@astro/application'
import { PALETTE_IDS, type CatalogueObject, type FilterIntegration, type PaletteId } from '@astro/domain'
import { IS_LIGHT, parseUtc } from './sqlite-frame-catalogue'
import { IS_INTEGRATED_LIGHT } from './sqlite-stack-catalogue'

/** Finished images the inspector can read: FITS, and PNG as Siril_Scripts and most editors export. */
const FINISHED = /\.(png|fits?|fts)$/i

const HAS_HEADER = (keyword: string) => `EXISTS (SELECT 1 FROM fits_headers h WHERE h.file_id = f.id AND h.keyword = '${keyword}')`
const HEADER_NUMBER = (keyword: string) =>
  `(SELECT CAST(TRIM(REPLACE(h.value, '''', '')) AS REAL) FROM fits_headers h WHERE h.file_id = f.id AND h.keyword = '${keyword}' LIMIT 1)`

/**
 * GalleryCatalogue over fits_files, the target's images folder and the seeded catalogues. Reads
 * the index and lists folders; never opens an image.
 */

/** The scope a frame names, for telling the Seestar's dual-band LP filter apart. */
const SCOPE = "COALESCE(NULLIF(TRIM(f.telescope), ''), NULLIF(TRIM(f.instrument), ''))"
export class SqliteGalleryCatalogue implements GalleryCatalogue {
  constructor(private readonly db: Database.Database) {}

  async fileById(fileId: string): Promise<{ path: string; name: string } | null> {
    const row = this.db.prepare('SELECT file_path, file_name FROM fits_files WHERE id = ?').get(fileId) as { file_path: string; file_name: string } | undefined
    return row ? { path: row.file_path, name: row.file_name } : null
  }

  async targetImages(targetId: string): Promise<GalleryImage[]> {
    const rows = this.db
      .prepare(
        `SELECT f.file_path, f.file_name, f.filter, f.file_modified_at, f.created_at, ${SCOPE} AS scope,
                ${HEADER_NUMBER('NAXIS3')} AS naxis3, ${HEADER_NUMBER('NAXIS')} AS naxis
         FROM fits_files f WHERE f.target_id = ? AND f.is_stacked = 1 AND ${IS_INTEGRATED_LIGHT}`
      )
      .all(targetId) as { file_path: string; file_name: string; filter: string | null; scope: string | null; file_modified_at: string | null; created_at: string | null; naxis3: number | null; naxis: number | null }[]
    const time = (i: GalleryImage) => i.modifiedAt?.getTime() ?? 0
    const masters: GalleryImage[] = rows
      .filter(r => fs.existsSync(r.file_path))
      .map(r => ({
        path: r.file_path,
        name: r.file_name,
        kind: 'master' as const,
        filter: r.filter?.trim() || null,
        colour: r.naxis3 !== null ? r.naxis3 >= 3 : r.naxis === 2 ? false : null,
        scope: r.scope,
        modifiedAt: parseUtc(r.file_modified_at) ?? parseUtc(r.created_at)
      }))
      .sort((a, b) => time(b) - time(a))
    return [...masters, ...this.finished(targetId).sort((a, b) => time(b) - time(a))]
  }

  /** PNG and FITS files in the target's images folder and the folders directly inside it. */
  private finished(targetId: string): GalleryImage[] {
    const row = this.db.prepare('SELECT images_path FROM target_home_data WHERE target_id = ?').get(targetId) as { images_path: string | null } | undefined
    const dir = row?.images_path
    if (!dir) return []
    const out: GalleryImage[] = []
    const list = (folder: string, depth: number) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(folder, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const full = path.join(folder, e.name)
        if (e.isDirectory() && depth === 0) list(full, 1)
        else if (e.isFile() && FINISHED.test(e.name)) {
          let modifiedAt: Date
          try {
            modifiedAt = fs.statSync(full).mtime
          } catch {
            continue
          }
          out.push({ path: full, name: e.name, kind: 'finished', filter: null, colour: null, modifiedAt })
        }
      }
    }
    list(dir, 0)
    return out
  }

  async filterIntegration(targetId: string): Promise<FilterIntegration[]> {
    const rows = this.db
      .prepare(
        `SELECT NULLIF(TRIM(f.filter), '') AS filter, ${HAS_HEADER('BAYERPAT')} AS colour, ${SCOPE} AS scope, SUM(f.exposure_sec) AS seconds
         FROM fits_files f
         WHERE f.target_id = ? AND f.is_stacked = 0 AND f.exposure_sec > 0 AND ${IS_LIGHT}
         GROUP BY NULLIF(TRIM(f.filter), ''), colour, scope`
      )
      .all(targetId) as { filter: string | null; colour: number; scope: string | null; seconds: number }[]
    return rows.map(r => ({ filter: r.filter, colour: r.colour === 1, scope: r.scope, seconds: r.seconds }))
  }

  async catalogueObjects(): Promise<CatalogueObject[]> {
    const rows = this.db
      .prepare(
        `SELECT ce.designation, t.canonical_name, t.ra_hours, t.dec_degrees, t.angular_size_arcmin
         FROM catalogue_entries ce
         JOIN catalogues c ON c.id = ce.catalogue_id
         JOIN targets t ON t.id = ce.target_id
         WHERE c.abbreviation IN ('M', 'NGC', 'IC') AND t.ra_hours IS NOT NULL AND t.dec_degrees IS NOT NULL
         ORDER BY CASE c.abbreviation WHEN 'M' THEN 0 WHEN 'NGC' THEN 1 ELSE 2 END, ce.designation`
      )
      .all() as { designation: string; canonical_name: string; ra_hours: number; dec_degrees: number; angular_size_arcmin: number | null }[]
    return rows.map(r => ({
      designation: r.designation,
      name: r.canonical_name && r.canonical_name !== r.designation ? r.canonical_name : null,
      raDeg: r.ra_hours * 15,
      decDeg: r.dec_degrees,
      sizeArcmin: r.angular_size_arcmin
    }))
  }
}

/** PaletteStore over the target_palettes table. */
export class SqlitePaletteStore implements PaletteStore {
  constructor(private readonly db: Database.Database) {}

  async chosen(targetId: string): Promise<PaletteId | null> {
    const row = this.db.prepare('SELECT palette FROM target_palettes WHERE target_id = ?').get(targetId) as { palette: string } | undefined
    // A palette this version does not know is no choice at all.
    return row && (PALETTE_IDS as readonly string[]).includes(row.palette) ? (row.palette as PaletteId) : null
  }

  async choose(targetId: string, palette: PaletteId | null, at: Date): Promise<void> {
    if (palette === null) this.db.prepare('DELETE FROM target_palettes WHERE target_id = ?').run(targetId)
    else
      this.db
        .prepare('INSERT INTO target_palettes (target_id, palette, chosen_at) VALUES (?, ?, ?) ON CONFLICT(target_id) DO UPDATE SET palette = excluded.palette, chosen_at = excluded.chosen_at')
        .run(targetId, palette, at.toISOString())
  }
}
