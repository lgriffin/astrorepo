import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'
import type { MessierCatalogue, MessierObject } from '@astro/application'
import { messierNumber, type PictureCandidate } from '@astro/domain'
import { IS_INTEGRATED_LIGHT, parseUtc } from './shared/sql'
import { imagesFolderOf, listFolderImages, type FolderImage } from './shared/images-folder'
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
   * Finished images of the object: those in the target's own images folder, in any other folder
   * directly under the library's shared images folder named for it (its Messier number, name or an
   * alias), and loose images at the top of the shared folder whose file names give its Messier
   * number. A scan can file several of these under one target but records only one folder, so the
   * shared folder is always looked at; its other images are other objects' (MES-003).
   */
  private finished(targetId: string): PictureCandidate[] {
    const dir = imagesFolderOf(this.db, targetId)
    const home = this.setting('home_folder_path')
    const sharedDir = home ? path.resolve(home, 'images') : null
    const folders = new Set<string>()
    if (dir && path.resolve(dir) !== sharedDir) folders.add(path.resolve(dir))
    let loose: FolderImage[] = []
    if (sharedDir) {
      const numbers = this.numbersOf(targetId).map(n => new RegExp(`(^|[^A-Za-z0-9])M[\\s_-]*0*${n}(?![0-9])`, 'i'))
      const names = this.namesOf(targetId)
      const namedFor = (folder: string) => {
        const f = folder.trim().toLowerCase()
        return numbers.some(re => re.test(folder)) || names.some(n => f === n || (f.startsWith(n) && /[\s_-]/.test(f[n.length])))
      }
      for (const sub of subfolders(sharedDir)) if (namedFor(sub)) folders.add(path.join(sharedDir, sub))
      if (numbers.length > 0) loose = listFolderImages(sharedDir, PICTURE, { maxDepth: 0, keep: name => numbers.some(re => re.test(name)) })
    }
    const seen = new Set<string>()
    return [...[...folders].flatMap(f => listFolderImages(f, PICTURE)), ...loose]
      .filter(f => !seen.has(path.resolve(f.path)) && seen.add(path.resolve(f.path)))
      .map(f => ({ path: f.path, kind: 'finished' as const, colour: null, modifiedAt: f.modifiedAt }))
  }

  /** The target's name and aliases, lower case, for matching folder names. */
  private namesOf(targetId: string): string[] {
    const rows = this.db
      .prepare(`SELECT canonical_name AS name FROM targets WHERE id = ? UNION SELECT alias AS name FROM target_aliases WHERE target_id = ?`)
      .all(targetId, targetId) as { name: string | null }[]
    return rows.map(r => (r.name ?? '').trim().toLowerCase()).filter(n => n.length >= 2)
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

/** The names of the folders directly inside a folder; none when it cannot be read. */
function subfolders(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
}
