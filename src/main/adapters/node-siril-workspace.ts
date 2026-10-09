import type Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import type { FrameDetail, PlacementResult, SirilWorkspace, WorkAreaSpace } from '@astro/application'
import { frameFileKind, frameTypeOfFolder, type FrameIndexSettings, type InputFrame, type SirilFolder, type SirilPlacement } from '@astro/domain'
import { parseUtc } from './sqlite-frame-catalogue'

/** FITS and camera RAW: Siril's `convert` reads both (RIG-004). */
const isFrameFile = (name: string) => frameFileKind(name) !== null
const SIRIL_FOLDERS: SirilFolder[] = ['lights', 'darks', 'flats', 'biases']

interface IndexedRow {
  naxis1: number | null
  naxis2: number | null
  exposure_sec: number | null
  gain: number | null
  ccd_temp: number | null
  filter: string | null
  date_obs: string | null
  xpixsz: number | null
  scope: string | null
  focallen: string | null
  bayer: number
  has_headers: number
  source_format: string | null
}

/** FOCALLEN is kept as header text; a number in it is the focal length in millimetres. */
function toSettings(r: IndexedRow): FrameIndexSettings {
  const focal = r.focallen === null ? NaN : Number(String(r.focallen).replace(/'/g, '').trim())
  return {
    exposureSec: r.exposure_sec,
    gain: r.gain,
    sensorTempC: r.ccd_temp,
    filter: r.filter?.trim() || null,
    capturedAt: parseUtc(r.date_obs),
    focalMm: Number.isFinite(focal) && focal > 0 ? focal : null,
    pixelUm: r.xpixsz && r.xpixsz > 0 ? r.xpixsz : null,
    scope: r.scope
  }
}
/** Copies keep the source's modified time; some file systems store it to the second. */
const MTIME_TOLERANCE_MS = 1000

/**
 * Siril work area on the local disk. Reads the source folder and never writes to it: frames are
 * hard-linked into the work area (instant, no extra space) or copied when the source is on another
 * volume, such as the NAS.
 */
export class NodeSirilWorkspace implements SirilWorkspace {
  /** The database is optional; when given, IMAGETYP from the catalogue decides a frame's folder. */
  constructor(private readonly db?: Database.Database) {}

  async listSourceFrames(sourceDir: string): Promise<{ path: string; name: string; imageType: string | null }[]> {
    const typeOf = this.db?.prepare('SELECT image_type FROM fits_files WHERE file_path = ?')
    const frames: { path: string; name: string; imageType: string | null }[] = []
    const walk = async (dir: string, hint: string | null): Promise<void> => {
      for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          // A folder named for calibration frames ("Darks", "Darks_ISO800", "Flats-L") tells what the
          // frames in it and below it are when their header does not; a target's "Dark Shark" does not.
          const type = frameTypeOfFolder(e.name)
          await walk(full, type && type !== 'Light' ? type : hint)
        } else if (e.isFile() && isFrameFile(e.name)) {
          const row = typeOf?.get(full) as { image_type: string | null } | undefined
          frames.push({ path: full, name: e.name, imageType: row?.image_type ?? hint })
        }
      }
    }
    await walk(sourceDir, null)
    return frames.sort((a, b) => a.path.localeCompare(b.path))
  }

  async prepareFolders(workDir: string): Promise<void> {
    for (const folder of SIRIL_FOLDERS) {
      await fs.promises.mkdir(path.join(workDir, folder), { recursive: true })
      await ownFolder(workDir, folder)
    }
  }

  async place(p: SirilPlacement, workDir: string): Promise<PlacementResult> {
    const dest = path.join(workDir, p.folder, p.name)
    const source = await fs.promises.stat(p.from)
    const existing = await fs.promises.stat(dest).catch(() => null)
    if (existing) {
      if (isCurrent(existing, source)) return 'existing'
      // Stale: the source was rewritten or replaced since. Only the work-area entry is removed.
      await fs.promises.unlink(dest)
    }
    try {
      await fs.promises.link(p.from, dest)
      return 'linked'
    } catch {
      await fs.promises.copyFile(p.from, dest, fs.constants.COPYFILE_EXCL)
      // The copy carries the source's modified time, so the next run can tell whether it is current.
      await fs.promises.utimes(dest, source.atime, source.mtime)
      return 'copied'
    }
  }

  async remove(workDir: string, folder: SirilFolder, names: string[]): Promise<string[]> {
    if (names.length === 0) return []
    const dir = await ownFolder(workDir, folder)
    if (dir === null) return []
    const removed: string[] = []
    for (const name of new Set(names)) {
      // A placement's name is a bare file name; anything else is not one of ours.
      if (name !== path.basename(name) || !isFrameFile(name)) continue
      const entry = path.join(dir, name)
      const stat = await fs.promises.lstat(entry).catch(() => null)
      if (!stat?.isFile()) continue
      await fs.promises.unlink(entry)
      removed.push(name)
    }
    return removed.sort()
  }

  async contains(dir: string, candidate: string): Promise<boolean> {
    const [d, c] = await Promise.all([realpathOfNearest(dir), realpathOfNearest(candidate)])
    const rel = path.relative(process.platform === 'win32' ? d.toLowerCase() : d, process.platform === 'win32' ? c.toLowerCase() : c)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  }

  async frameDetails(paths: string[]): Promise<FrameDetail[]> {
    const indexed = this.db?.prepare(
      `SELECT f.naxis1, f.naxis2, f.exposure_sec, f.gain, f.ccd_temp, f.filter, f.date_obs, f.xpixsz,
              COALESCE(NULLIF(TRIM(f.telescope), ''), NULLIF(TRIM(f.instrument), '')) AS scope,
              (SELECT h.value FROM fits_headers h WHERE h.file_id = f.id AND h.keyword = 'FOCALLEN' LIMIT 1) AS focallen,
              EXISTS (SELECT 1 FROM fits_headers h WHERE h.file_id = f.id AND h.keyword = 'BAYERPAT' AND TRIM(REPLACE(COALESCE(h.value, ''), '''', '')) <> '') AS bayer,
              EXISTS (SELECT 1 FROM fits_headers h WHERE h.file_id = f.id) AS has_headers,
              f.source_format
       FROM fits_files f WHERE f.file_path = ?`
    )
    return Promise.all(
      paths.map(async p => {
        const stat = await fs.promises.stat(p).catch(() => null)
        const row = indexed?.get(p) as IndexedRow | undefined
        return {
          path: p,
          sizeBytes: stat?.size ?? 0,
          width: row?.naxis1 ?? null,
          height: row?.naxis2 ?? null,
          // A camera RAW frame is a colour sensor's mosaic, whatever its tags say.
          colour: row?.source_format === 'raw' ? true : row && row.has_headers ? row.bayer === 1 : null,
          settings: row ? toSettings(row) : null
        }
      })
    )
  }

  async writeText(workDir: string, name: string, text: string): Promise<string> {
    if (!name || name !== path.basename(name) || name === '.' || name === '..') throw new Error(`${name} is not a bare file name, so it would land outside the work folder.`)
    await fs.promises.mkdir(workDir, { recursive: true })
    const file = path.join(workDir, name)
    // Written beside and moved into place, so a reader never sees half a file.
    await fs.promises.writeFile(`${file}.partial`, text, 'utf-8')
    await fs.promises.rename(`${file}.partial`, file)
    return file
  }

  async workAreaSpace(workDir: string): Promise<WorkAreaSpace> {
    const fsStats = await fs.promises.statfs(await nearestExisting(workDir)).catch(() => null)
    let usedBytes = 0
    for (const folder of ['process', 'masters']) {
      const entries = await fs.promises.readdir(path.join(workDir, folder), { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        if (e.isFile()) usedBytes += (await fs.promises.stat(path.join(workDir, folder, e.name)).catch(() => null))?.size ?? 0
      }
    }
    return { freeBytes: fsStats ? Number(fsStats.bavail) * Number(fsStats.bsize) : null, usedBytes }
  }

  async stackResults(workDir: string): Promise<{ path: string; sizeBytes: number; modifiedAt: Date | null }[]> {
    const entries = await fs.promises.readdir(workDir, { withFileTypes: true }).catch(() => [])
    const results = await Promise.all(
      entries
        .filter(e => e.isFile() && STACK_RESULT.test(e.name))
        .map(async e => {
          const full = path.join(workDir, e.name)
          const stat = await fs.promises.stat(full)
          return { path: full, sizeBytes: stat.size, modifiedAt: stat.mtime }
        })
    )
    return results.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
  }

  async inputFrames(workDir: string): Promise<InputFrame[]> {
    const frames: InputFrame[] = []
    for (const folder of SIRIL_FOLDERS) {
      const dir = path.join(workDir, folder)
      for (const e of await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (!isFrameFile(e.name)) continue
        // Siril reads through links, so a frame's size and time are its target's.
        const stat = await fs.promises.stat(path.join(dir, e.name)).catch(() => null)
        if (stat?.isFile()) frames.push({ folder, name: e.name, sizeBytes: stat.size, modifiedAt: stat.mtime })
      }
    }
    return frames.sort((a, b) => `${a.folder}/${a.name}`.localeCompare(`${b.folder}/${b.name}`))
  }

  async copyBytes(placements: SirilPlacement[], workDir: string): Promise<number> {
    // The work folder need not exist yet; its nearest existing ancestor is on the volume it will be.
    const work = await fs.promises.stat(await nearestExisting(workDir)).catch(() => null)
    let bytes = 0
    for (const p of placements) {
      const source = await fs.promises.stat(p.from).catch(() => null)
      if (!source) continue
      const existing = await fs.promises.stat(path.join(workDir, p.folder, p.name)).catch(() => null)
      if (existing && isCurrent(existing, source)) continue
      // Each frame is checked on its own: a subfolder of the source may be mounted from another disk.
      if (!work || source.dev !== work.dev) bytes += source.size
    }
    return bytes
  }
}

/** Siril's stock scripts save the stack as result_<livetime>s.fit in the work folder. */
const STACK_RESULT = /^result.*\.(fit|fits|fts)$/i

/** A work-area entry still matches its source: the same file (a hard link) or a copy of this version. */
function isCurrent(existing: fs.Stats, source: fs.Stats): boolean {
  const sameFile = existing.ino !== 0 && existing.ino === source.ino && existing.dev === source.dev
  const sameCopy = existing.size === source.size && Math.abs(existing.mtimeMs - source.mtimeMs) < MTIME_TOLERANCE_MS
  return sameFile || sameCopy
}

/** A frame folder that is, or links to, a folder outside the work area. */
export class WorkFolderLinksOutError extends Error {
  constructor(readonly folder: string) {
    super(`The work area's ${path.basename(folder)} folder (${folder}) links to a folder outside the work area, and the app only writes inside its work area. Remove the link, then try again.`)
    this.name = 'WorkFolderLinksOutError'
  }
}

/**
 * A frame folder's path under the work area as given (so paths match the work folder the caller
 * knows, even where Windows hands out short names) when it is a plain folder inside the work area;
 * null when it does not exist. Throws when it is a link, or resolves outside the work area, so nothing the app
 * writes or removes can reach a source folder through it.
 */
export async function ownFolder(workDir: string, folder: string): Promise<string | null> {
  const dir = path.join(workDir, folder)
  const stat = await fs.promises.lstat(dir).catch(() => null)
  if (!stat) return null
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new WorkFolderLinksOutError(dir)
  const [real, root] = await Promise.all([fs.promises.realpath(dir), fs.promises.realpath(workDir)])
  const rel = path.relative(root, real)
  if ((process.platform === 'win32' ? rel.toLowerCase() : rel) !== (process.platform === 'win32' ? folder.toLowerCase() : folder).split('/').join(path.sep)) throw new WorkFolderLinksOutError(dir)
  return dir
}

/** The path itself or its closest ancestor that exists, so space can be read before a folder is made. */
async function nearestExisting(p: string): Promise<string> {
  let current = path.resolve(p)
  for (;;) {
    if (await fs.promises.stat(current).then(() => true, () => false)) return current
    const parent = path.dirname(current)
    if (parent === current) return current
    current = parent
  }
}

/** The real path of `p`, resolving links through its nearest existing ancestor. */
async function realpathOfNearest(p: string): Promise<string> {
  const resolved = path.resolve(p)
  const missing: string[] = []
  let current = resolved
  for (;;) {
    try {
      return path.join(await fs.promises.realpath(current), ...missing.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return resolved
      missing.push(path.basename(current))
      current = parent
    }
  }
}
