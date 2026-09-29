import type Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import type { PlacementResult, SirilWorkspace } from '@astro/application'
import type { SirilPlacement } from '@astro/domain'

const FITS_EXTENSIONS = new Set(['.fit', '.fits', '.fts'])
const SIRIL_FOLDERS = ['lights', 'darks', 'flats', 'biases']

/**
 * Siril work area on the local disk. Reads the source folder and never writes to it: frames are
 * hard-linked into the work area (instant, no extra space) or copied when the source is on another
 * volume, such as the NAS.
 */
export class NodeSirilWorkspace implements SirilWorkspace {
  /** The database is optional; when given, IMAGETYP from the catalogue decides a frame's folder. */
  constructor(private readonly db?: Database.Database) {}

  async listSourceFrames(sourceDir: string): Promise<{ path: string; name: string; imageType: string | null }[]> {
    const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true })
    const typeOf = this.db?.prepare('SELECT image_type FROM fits_files WHERE file_path = ?')
    return entries
      .filter(e => e.isFile() && FITS_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
      .map(e => {
        const full = path.join(sourceDir, e.name)
        const row = typeOf?.get(full) as { image_type: string | null } | undefined
        return { path: full, name: e.name, imageType: row?.image_type ?? null }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async prepareFolders(workDir: string): Promise<void> {
    for (const folder of SIRIL_FOLDERS) await fs.promises.mkdir(path.join(workDir, folder), { recursive: true })
  }

  async place(p: SirilPlacement, workDir: string): Promise<PlacementResult> {
    const dest = path.join(workDir, p.folder, p.name)
    if (fs.existsSync(dest)) return 'existing'
    try {
      await fs.promises.link(p.from, dest)
      return 'linked'
    } catch {
      await fs.promises.copyFile(p.from, dest, fs.constants.COPYFILE_EXCL)
      return 'copied'
    }
  }
}
