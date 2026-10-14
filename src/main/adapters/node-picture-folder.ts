import fs from 'fs'
import path from 'path'
import type { Picture, PictureFile, PictureFolder } from '@astro/application'
import type { SettingReader } from './shared/app-settings'

/** Pictures the window can draw: PNG, as Siril_Scripts and most editors export, and JPEG. */
const PICTURE = /\.(png|jpe?g)$/i

/** How deep under the root the gallery looks; deeper folders are left out. */
export const MAX_FOLDER_DEPTH = 8

/** The largest file read when it cannot be shrunk first, so one huge export cannot stall the window. */
export const MAX_UNSHRUNK_BYTES = 50 * 1024 * 1024

/**
 * Shrinks a picture to at most `maxWidth` wide; the time it was saved lets the shrinker keep what it
 * made until the file changes. The app passes Electron's image decoder; tests leave it out.
 */
export type PictureShrinker = (filePath: string, maxWidth: number, modifiedMs: number) => Promise<Picture>

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

/**
 * PictureFolder over the images folder of the home folder (spec 031). Walks it for PNG and JPEG
 * files, leaving out hidden folders and links so a loop or a link out of the folder is never
 * followed, and reads a picture only to send it to the window.
 */
export class NodePictureFolder implements PictureFolder {
  constructor(
    private readonly setting: SettingReader,
    private readonly shrink: PictureShrinker | null = null
  ) {}

  async root(): Promise<string | null> {
    const home = this.setting('home_folder_path')?.trim()
    if (!home) return null
    const dir = path.join(home, 'images')
    try {
      return fs.statSync(dir).isDirectory() ? dir : null
    } catch {
      return null
    }
  }

  async list(): Promise<PictureFile[]> {
    const root = await this.root()
    if (!root) return []
    const out: PictureFile[] = []
    const walk = (dir: string, folders: string[]) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (folders.length < MAX_FOLDER_DEPTH) walk(full, [...folders, e.name])
        } else if (e.isFile() && PICTURE.test(e.name)) {
          try {
            const st = fs.statSync(full)
            out.push({ path: full, name: e.name, folders, sizeBytes: st.size, modifiedAt: st.mtime })
          } catch {
            // Gone between the listing and the look: left out.
          }
        }
      }
    }
    walk(root, [])
    return out
  }

  async read(filePath: string, maxWidth: number): Promise<Picture> {
    let st: fs.Stats
    try {
      st = fs.statSync(filePath)
    } catch {
      throw new Error(`${path.basename(filePath)} is no longer there. Open the gallery again to see what is.`)
    }
    if (this.shrink) return this.shrink(filePath, maxWidth, st.mtimeMs)
    if (st.size > MAX_UNSHRUNK_BYTES) throw new Error(`${path.basename(filePath)} is too large to show here. Open its folder to view it.`)
    const mime = MIME[path.extname(filePath).toLowerCase()]
    if (!mime) throw new Error(`${path.basename(filePath)} is not a PNG or JPEG.`)
    return { data: fs.readFileSync(filePath).toString('base64'), mime, width: null, height: null }
  }
}
