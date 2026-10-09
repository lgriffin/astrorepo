import fs from 'fs'
import path from 'path'
import type { ArchiveArea } from '@astro/application'
import { ARCHIVE_INDEX_FILE, INTERMEDIATE_FOLDERS, type ArchiveCopy, type ArchiveIndex, type WorkAreaFile } from '@astro/domain'

/** Whether `p` is strictly inside `dir`, both resolved. */
function inside(dir: string, p: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(p))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** The path itself or its closest ancestor that exists. */
async function nearestExisting(p: string): Promise<string> {
  let current = path.resolve(p)
  for (;;) {
    if (await fs.promises.stat(current).then(() => true, () => false)) return current
    const up = path.dirname(current)
    if (up === current) return current
    current = up
  }
}

/** A copy whose size differs from the plan's: the file changed, or the copy is short. */
export class ArchiveCopyError extends Error {
  constructor(readonly file: string) {
    super(`${file} changed or was cut short while it was copied, so the archive was not made. Try again once nothing is writing to it.`)
    this.name = 'ArchiveCopyError'
  }
}

/**
 * ArchiveArea on the local disk or a mounted share. Reads the work folder and the source frames,
 * writes only a new archive folder (staged beside it and renamed into place), and removes only the
 * work folder's own intermediate folders.
 */
export class NodeArchiveArea implements ArchiveArea {
  async survey(workDir: string): Promise<WorkAreaFile[]> {
    const files: WorkAreaFile[] = []
    const walk = async (dir: string, rel: string): Promise<void> => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        const full = path.join(dir, e.name)
        const relPath = rel === '' ? e.name : `${rel}/${e.name}`
        // bigint, so an NTFS file id survives intact; lstat, so links are never followed.
        const stat = await fs.promises.lstat(full, { bigint: true }).catch(() => null)
        if (!stat) continue
        if (stat.isSymbolicLink()) files.push({ path: relPath, sizeBytes: 0, links: 1, fileId: null, symlink: true })
        else if (stat.isDirectory()) await walk(full, relPath)
        else if (stat.isFile()) {
          files.push({ path: relPath, sizeBytes: Number(stat.size), links: Number(stat.nlink), fileId: stat.ino === 0n ? null : `${stat.dev}:${stat.ino}`, symlink: false })
        }
      }
    }
    await walk(workDir, '')
    return files.sort((a, b) => a.path.localeCompare(b.path))
  }

  async readText(workDir: string, relative: string): Promise<string> {
    const file = path.join(workDir, relative)
    if (!inside(workDir, file)) throw new Error(`${relative} is not inside the work folder.`)
    return fs.promises.readFile(file, 'utf8')
  }

  async sizes(paths: string[]): Promise<(number | null)[]> {
    return Promise.all(paths.map(async p => {
      const stat = await fs.promises.stat(p).catch(() => null)
      return stat?.isFile() ? stat.size : null
    }))
  }

  async freeBytes(dir: string): Promise<number | null> {
    const stats = await fs.promises.statfs(await nearestExisting(dir)).catch(() => null)
    return stats ? Number(stats.bavail) * Number(stats.bsize) : null
  }

  async exists(p: string): Promise<boolean> {
    return fs.promises.lstat(p).then(() => true, () => false)
  }

  join(dir: string, name: string): string {
    return path.join(dir, name)
  }

  async build(workDir: string, dest: string, copies: ArchiveCopy[], index: ArchiveIndex): Promise<string> {
    if (await this.exists(dest)) throw new Error(`${dest} already exists. Move or rename it, then archive again.`)
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    const staging = await fs.promises.mkdtemp(path.join(path.dirname(dest), `.${path.basename(dest)}.partial-`))
    try {
      for (const c of copies) {
        const from = c.inWorkFolder ? path.join(workDir, c.from) : c.from
        const to = path.join(staging, c.to)
        if ((c.inWorkFolder && !inside(workDir, from)) || !inside(staging, to)) throw new Error(`${c.to} would land outside the archive.`)
        await fs.promises.mkdir(path.dirname(to), { recursive: true })
        await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL)
        const [source, copy] = await Promise.all([fs.promises.stat(from), fs.promises.stat(to)])
        if (copy.size !== c.sizeBytes || source.size !== c.sizeBytes) throw new ArchiveCopyError(from)
        await fs.promises.utimes(to, source.atime, source.mtime)
      }
      await fs.promises.writeFile(path.join(staging, ARCHIVE_INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
      await fs.promises.rename(staging, dest)
    } catch (error) {
      await fs.promises.rm(staging, { recursive: true, force: true })
      throw error
    }
    return path.join(dest, ARCHIVE_INDEX_FILE)
  }

  async removeFolders(workDir: string, folders: string[]): Promise<string[]> {
    const root = await fs.promises.realpath(workDir).catch(() => null)
    if (!root) return []
    const removed: string[] = []
    for (const folder of new Set(folders)) {
      if (!INTERMEDIATE_FOLDERS.includes(folder)) continue
      const dir = path.join(workDir, folder)
      const stat = await fs.promises.lstat(dir).catch(() => null)
      if (!stat) continue
      // A link or junction could lead into a source folder; only a real folder of the work folder goes.
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`The work folder's ${folder} (${dir}) is a link, not a folder of its own, so it was left alone.`)
      const rel = path.relative(root, await fs.promises.realpath(dir))
      if (rel !== folder && !(process.platform === 'win32' && rel.toLowerCase() === folder.toLowerCase())) {
        throw new Error(`The work folder's ${folder} (${dir}) leads outside the work folder, so it was left alone.`)
      }
      // rm does not follow links inside the folder: a link is removed, never what it points to.
      await fs.promises.rm(dir, { recursive: true })
      removed.push(folder)
    }
    return removed.sort()
  }
}
