import fs from 'fs'
import path from 'path'
import type { Desktop, SaveResult } from '../transport/desktop'

/**
 * The Desktop port when astrorepo is served to a browser (specs/035-pi-variant, PI-012). The
 * server has no screen of its own: pickers are answered in the browser (the bridge asks for a
 * typed path), exports are saved in an exports folder on the server, and folders and links cannot
 * be opened from here, which each says.
 */
export class ServedDesktop implements Desktop {
  constructor(private readonly exportsDir: string) {}

  async pickFolder(): Promise<string | null> {
    return null
  }

  async pickFile(): Promise<string | null> {
    return null
  }

  async saveText(defaultName: string, text: string): Promise<SaveResult> {
    fs.mkdirSync(this.exportsDir, { recursive: true })
    const base = path.basename(defaultName) || 'export.csv'
    const ext = path.extname(base)
    const stem = base.slice(0, base.length - ext.length)
    for (let n = 1; ; n++) {
      const candidate = path.join(this.exportsDir, n === 1 ? base : `${stem}-${n}${ext}`)
      try {
        fs.writeFileSync(candidate, text, { encoding: 'utf-8', flag: 'wx' })
        return { saved: true, path: candidate }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
  }

  async openFolder(folderPath: string): Promise<string> {
    return `Folders open only on the computer astrorepo runs on. The folder is ${folderPath}`
  }

  async openExternal(url: string): Promise<void> {
    throw new Error(`Links open only on the computer astrorepo runs on. The link is ${url}`)
  }
}
