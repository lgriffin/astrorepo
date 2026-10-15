import fs from 'fs'
import { dialog, shell } from 'electron'
import type { Desktop, FileKind, SaveResult } from '../transport/desktop'

/** The Desktop port over Electron's dialogs and shell (specs/035-pi-variant, PI-004). */
export const electronDesktop: Desktop = {
  async pickFolder(title: string): Promise<string | null> {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  },

  async pickFile(title: string, kinds: FileKind[]): Promise<string | null> {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], title, filters: kinds })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  },

  async saveText(defaultName: string, text: string, kinds: FileKind[]): Promise<SaveResult> {
    const result = await dialog.showSaveDialog({ defaultPath: defaultName, filters: kinds })
    if (result.canceled || !result.filePath) return { saved: false }
    fs.writeFileSync(result.filePath, text, 'utf-8')
    return { saved: true, path: result.filePath }
  },

  openFolder: (folderPath: string) => shell.openPath(folderPath),

  openExternal: (url: string) => shell.openExternal(url)
}
