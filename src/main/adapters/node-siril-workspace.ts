import type Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import type { FrameDetail, PlacementResult, SirilWorkspace, WorkAreaSpace } from '@astro/application'
import type { SirilFolder, SirilPlacement } from '@astro/domain'

const FITS_EXTENSIONS = new Set(['.fit', '.fits', '.fts'])
const SIRIL_FOLDERS: SirilFolder[] = ['lights', 'darks', 'flats', 'biases']
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
      if (name !== path.basename(name) || !FITS_EXTENSIONS.has(path.extname(name).toLowerCase())) continue
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
 * The real path of a frame folder when it is a plain folder inside the work area; null when it
 * does not exist. Throws when it is a link, or resolves outside the work area, so nothing the app
 * writes or removes can reach a source folder through it.
 */
async function ownFolder(workDir: string, folder: SirilFolder): Promise<string | null> {
  const dir = path.join(workDir, folder)
  const stat = await fs.promises.lstat(dir).catch(() => null)
  if (!stat) return null
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new WorkFolderLinksOutError(dir)
  const [real, root] = await Promise.all([fs.promises.realpath(dir), fs.promises.realpath(workDir)])
  const rel = path.relative(root, real)
  if ((process.platform === 'win32' ? rel.toLowerCase() : rel) !== folder) throw new WorkFolderLinksOutError(dir)
  return real
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
