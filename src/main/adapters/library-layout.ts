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

/** Calls `visit` for each entry of a folder until it returns false; an unreadable folder has none. */
async function eachEntry(dir: string, visit: (e: fs.Dirent) => boolean): Promise<void> {
  let handle: fs.Dir
  try {
    handle = await fs.promises.opendir(dir, { bufferSize: 256 })
  } catch {
    return
  }
  try {
    for await (const e of handle) if (!visit(e)) break
  } catch {
    // A folder that stops answering mid-listing gives what it gave.
  } finally {
    await handle.close().catch(() => undefined)
  }
}

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
      let objectFolders = 0
      let looked = 0
      let level = [dir]
      const full = () => looked >= SAMPLE_ENTRIES || files.length >= SAMPLE_FILES
      for (let depth = 0; depth < SAMPLE_DEPTH && level.length > 0 && !full(); depth++) {
        const next: string[] = []
        for (const d of level) {
          if (full()) break
          // Streamed and given up at the limit, so a folder of 100,000 frames is never listed whole.
          await eachEntry(d, e => {
            looked++
            if (hidden(e.name)) return !full()
            if (e.isFile()) files.push(e.name)
            else if (e.isDirectory()) {
              next.push(path.join(d, e.name))
              if (depth === 0 && this.isObjectName(e.name)) objectFolders++
            }
            return !full()
          })
        }
        level = next
      }
      out.push({ name, path: dir, files, objectFolders, isObject: this.isObjectName(name) })
    }
    return out
  }

  async names(home: string): Promise<string[]> {
    return folderNames(home)
  }

  /**
   * The folder's one true path when it is a folder whose entries can be listed: links and ".."
   * resolved, so two spellings of one folder compare equal and the gallery reads it as a folder.
   */
  async folderAt(p: string): Promise<string | null> {
    try {
      const real = await fs.promises.realpath(p)
      const dir = await fs.promises.opendir(real)
      await dir.close()
      return real
    } catch {
      return null
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
