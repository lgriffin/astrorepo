import type Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import type { FrameDetail, PlacementResult, SirilWorkspace, WorkAreaSpace } from '@astro/application'
import type { SirilPlacement } from '@astro/domain'

const FITS_EXTENSIONS = new Set(['.fit', '.fits', '.fts'])
const SIRIL_FOLDERS = ['lights', 'darks', 'flats', 'biases']
/** A folder named for a frame type tells what its frames are when the header does not. */
const FRAME_TYPE_FOLDER = /dark|flat|bias|offset/i
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
          await walk(full, FRAME_TYPE_FOLDER.test(e.name) ? e.name : hint)
        } else if (e.isFile() && FITS_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
          const row = typeOf?.get(full) as { image_type: string | null } | undefined
          frames.push({ path: full, name: e.name, imageType: row?.image_type ?? hint })
        }
      }
    }
    await walk(sourceDir, null)
    return frames.sort((a, b) => a.path.localeCompare(b.path))
  }

  async prepareFolders(workDir: string): Promise<void> {
    for (const folder of SIRIL_FOLDERS) await fs.promises.mkdir(path.join(workDir, folder), { recursive: true })
  }

  async place(p: SirilPlacement, workDir: string): Promise<PlacementResult> {
    const dest = path.join(workDir, p.folder, p.name)
    const source = await fs.promises.stat(p.from)
    const existing = await fs.promises.stat(dest).catch(() => null)
    if (existing) {
      const sameFile = existing.ino !== 0 && existing.ino === source.ino && existing.dev === source.dev
      const sameCopy = existing.size === source.size && Math.abs(existing.mtimeMs - source.mtimeMs) < MTIME_TOLERANCE_MS
      if (sameFile || sameCopy) return 'existing'
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

  async contains(dir: string, candidate: string): Promise<boolean> {
    const [d, c] = await Promise.all([realpathOfNearest(dir), realpathOfNearest(candidate)])
    const rel = path.relative(process.platform === 'win32' ? d.toLowerCase() : d, process.platform === 'win32' ? c.toLowerCase() : c)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  }

  async frameDetails(paths: string[]): Promise<FrameDetail[]> {
    const indexed = this.db?.prepare(
      `SELECT f.naxis1, f.naxis2,
              EXISTS (SELECT 1 FROM fits_headers h WHERE h.file_id = f.id AND h.keyword = 'BAYERPAT' AND TRIM(REPLACE(COALESCE(h.value, ''), '''', '')) <> '') AS bayer,
              EXISTS (SELECT 1 FROM fits_headers h WHERE h.file_id = f.id) AS has_headers
       FROM fits_files f WHERE f.file_path = ?`
    )
    return Promise.all(
      paths.map(async p => {
        const stat = await fs.promises.stat(p).catch(() => null)
        const row = indexed?.get(p) as { naxis1: number | null; naxis2: number | null; bayer: number; has_headers: number } | undefined
        return {
          path: p,
          sizeBytes: stat?.size ?? 0,
          width: row?.naxis1 ?? null,
          height: row?.naxis2 ?? null,
          colour: row && row.has_headers ? row.bayer === 1 : null
        }
      })
    )
  }

  async workAreaSpace(sourceDir: string, workDir: string): Promise<WorkAreaSpace> {
    const existing = await nearestExisting(workDir)
    const [fsStats, work, source] = await Promise.all([
      fs.promises.statfs(existing).catch(() => null),
      fs.promises.stat(existing).catch(() => null),
      fs.promises.stat(sourceDir).catch(() => null)
    ])
    let usedBytes = 0
    for (const folder of ['process', 'masters']) {
      const entries = await fs.promises.readdir(path.join(workDir, folder), { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        if (e.isFile()) usedBytes += (await fs.promises.stat(path.join(workDir, folder, e.name)).catch(() => null))?.size ?? 0
      }
    }
    return {
      freeBytes: fsStats ? Number(fsStats.bavail) * Number(fsStats.bsize) : null,
      sameVolume: !!work && !!source && work.dev === source.dev,
      usedBytes
    }
  }
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
