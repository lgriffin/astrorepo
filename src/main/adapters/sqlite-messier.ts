import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'
import type { MessierCatalogue, MessierObject } from '@astro/application'
import { messierNumber, type PictureCandidate } from '@astro/domain'
import { IS_INTEGRATED_LIGHT, parseUtc } from './shared/sql'
import { imagesFolderOf, listFolderImages } from './shared/images-folder'
import { settingReader } from './shared/app-settings'

/** Finished images a tile could show: JPEG, PNG, TIFF and FITS. */
const PICTURE = /\.(jpe?g|png|tiff?|fits?|fts)$/i

const HEADER_NUMBER = (keyword: string) =>
  `(SELECT CAST(TRIM(REPLACE(h.value, '''', '')) AS REAL) FROM fits_headers h WHERE h.file_id = f.id AND h.keyword = '${keyword}' LIMIT 1)`

const squash = (s: string) => s.replace(/\s+/g, '').toUpperCase()

/**
 * MessierCatalogue over the seeded catalogues, fits_files and each target's images folder
 * (specs/032-messier-mosaic). Reads the index and lists folders; never opens an image.
 */
export class SqliteMessierCatalogue implements MessierCatalogue {
  private readonly setting: (key: string) => string | null

  constructor(private readonly db: Database.Database) {
    this.setting = settingReader(db)
  }

  async objects(): Promise<MessierObject[]> {
    const rows = this.db
      .prepare(
        `SELECT ce.designation, t.id, t.canonical_name, t.object_type, t.constellation, t.magnitude, t.ra_hours, t.dec_degrees
         FROM catalogue_entries ce
         JOIN catalogues c ON c.id = ce.catalogue_id
         JOIN targets t ON t.id = ce.target_id
         WHERE c.abbreviation = 'M'
         ORDER BY ce.designation`
      )
      .all() as { designation: string; id: string; canonical_name: string; object_type: string; constellation: string | null; magnitude: number | null; ra_hours: number | null; dec_degrees: number | null }[]
    const byNumber = new Map<number, MessierObject>()
    for (const r of rows) {
      const number = messierNumber(r.designation)
      if (number === null || byNumber.has(number)) continue
      byNumber.set(number, {
        number,
        designation: r.designation,
        targetId: r.id,
        name: squash(r.canonical_name) === squash(r.designation) ? null : r.canonical_name,
        objectType: r.object_type,
        constellation: r.constellation,
        magnitude: r.magnitude,
        raHours: r.ra_hours,
        decDeg: r.dec_degrees
      })
    }
    return [...byNumber.values()].sort((a, b) => a.number - b.number)
  }

  async pictures(targetId: string): Promise<PictureCandidate[]> {
    return [...this.finished(targetId), ...this.masters(targetId)]
  }

  /**
   * Images in the target's images folder. When the scan filed loose images at the top of the
   * library's shared images folder, only those whose file name gives the object's Messier number
   * belong to it; the rest are other objects' images.
   */
  private finished(targetId: string): PictureCandidate[] {
    const dir = imagesFolderOf(this.db, targetId)
    if (!dir) return []
    const home = this.setting('home_folder_path')
    const shared = home !== null && path.resolve(dir) === path.resolve(home, 'images')
    const numbers = shared ? this.numbersOf(targetId) : []
    const named = (name: string) => numbers.some(n => new RegExp(`(^|[^A-Za-z0-9])M[\\s_-]*0*${n}(?![0-9])`, 'i').test(name))
    return listFolderImages(dir, PICTURE)
      .filter(f => !shared || (f.topLevel && named(f.name)))
      .map(f => ({ path: f.path, kind: 'finished' as const, colour: null, modifiedAt: f.modifiedAt }))
  }

  private numbersOf(targetId: string): number[] {
    const rows = this.db
      .prepare(`SELECT ce.designation FROM catalogue_entries ce JOIN catalogues c ON c.id = ce.catalogue_id WHERE c.abbreviation = 'M' AND ce.target_id = ?`)
      .all(targetId) as { designation: string }[]
    return rows.map(r => messierNumber(r.designation)).filter((n): n is number => n !== null)
  }

  /** The target's stacked masters still on disk, with whether each has three channels. */
  private masters(targetId: string): PictureCandidate[] {
    const rows = this.db
      .prepare(
        `SELECT f.file_path, f.file_modified_at, f.created_at, ${HEADER_NUMBER('NAXIS3')} AS naxis3, ${HEADER_NUMBER('NAXIS')} AS naxis
         FROM fits_files f WHERE f.target_id = ? AND f.is_stacked = 1 AND ${IS_INTEGRATED_LIGHT}`
      )
      .all(targetId) as { file_path: string; file_modified_at: string | null; created_at: string | null; naxis3: number | null; naxis: number | null }[]
    return rows
      .filter(r => fs.existsSync(r.file_path))
      .map(r => ({
        path: r.file_path,
        kind: 'master' as const,
        colour: r.naxis3 !== null ? r.naxis3 >= 3 : r.naxis === 2 ? false : null,
        modifiedAt: parseUtc(r.file_modified_at) ?? parseUtc(r.created_at)
      }))
  }
}
