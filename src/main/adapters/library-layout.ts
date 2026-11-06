import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'
import type { LibraryFolders, LibraryLayoutStore } from '@astro/application'
import { LIBRARY_FOLDER_KEYS, LIBRARY_ROLES, type FolderSample, type LibraryRole } from '@astro/domain'
import { settingReader } from './shared/app-settings'
import { chosenFolders } from './shared/library-folders'

/** Files named per folder surveyed: enough to judge what it holds. */
const SAMPLE_FILES = 60
/** Directory entries looked at per folder, so a folder of 100,000 frames is judged from its first few. */
const SAMPLE_ENTRIES = 2000
/** How deep a survey looks: object, night, filter and one more. */
const SAMPLE_DEPTH = 4

const hidden = (name: string) => name.startsWith('.') || name.startsWith('$') || name === 'System Volume Information'

async function folderNames(dir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    // Links are not followed: a link out of the home folder is not part of the library.
    return entries.filter(e => e.isDirectory() && !hidden(e.name)).map(e => e.name)
  } catch {
    return []
  }
}

/**
 * LibraryFolders over the file system (specs/044-library-layout): surveys each folder under the
 * home folder breadth first, naming at most 60 files from at most 2,000 entries four folders deep,
 * so a survey of a large library takes moments. Reads names only, never a file.
 */
export class NodeLibraryFolders implements LibraryFolders {
  constructor(private readonly isObjectName: (name: string) => boolean) {}

  async survey(home: string): Promise<FolderSample[]> {
    const names = await folderNames(home)
    const out: FolderSample[] = []
    for (const name of names.sort((a, b) => a.localeCompare(b))) {
      const dir = path.join(home, name)
      const files: string[] = []
      let looked = 0
      let level = [dir]
      for (let depth = 0; depth < SAMPLE_DEPTH && level.length > 0 && files.length < SAMPLE_FILES && looked < SAMPLE_ENTRIES; depth++) {
        const next: string[] = []
        for (const d of level) {
          let entries: fs.Dirent[]
          try {
            entries = await fs.promises.readdir(d, { withFileTypes: true })
          } catch {
            continue
          }
          for (const e of entries) {
            if (++looked > SAMPLE_ENTRIES || files.length >= SAMPLE_FILES) break
            if (hidden(e.name)) continue
            if (e.isFile()) files.push(e.name)
            else if (e.isDirectory()) next.push(path.join(d, e.name))
          }
          if (looked > SAMPLE_ENTRIES || files.length >= SAMPLE_FILES) break
        }
        level = next
      }
      const objectFolders = (await folderNames(dir)).filter(n => this.isObjectName(n)).length
      out.push({ name, path: dir, files, objectFolders, isObject: this.isObjectName(name) })
    }
    return out
  }

  async names(home: string): Promise<string[]> {
    return folderNames(home)
  }

  async isFolder(p: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(p)).isDirectory()
    } catch {
      return false
    }
  }

  join(home: string, name: string): string {
    return path.join(home, name)
  }
}

/** LibraryLayoutStore over app_settings: the home folder and one key per part (specs/044-library-layout). */
export class SqliteLibraryLayoutStore implements LibraryLayoutStore {
  constructor(private readonly db: Database.Database) {}

  async home(): Promise<string | null> {
    return settingReader(this.db)('home_folder_path')?.trim() || null
  }

  async chosen(): Promise<Record<LibraryRole, string | null>> {
    return chosenFolders(settingReader(this.db))
  }

  async choose(layout: Partial<Record<LibraryRole, string | null>>): Promise<void> {
    const set = this.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    this.db.transaction(() => {
      for (const role of LIBRARY_ROLES) {
        const p = layout[role]
        if (p !== undefined) set.run(LIBRARY_FOLDER_KEYS[role], p?.trim() ?? '')
      }
    })()
  }
}
