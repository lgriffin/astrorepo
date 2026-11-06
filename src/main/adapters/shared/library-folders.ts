import fs from 'fs'
import path from 'path'
import { LIBRARY_FOLDER_KEYS, LIBRARY_ROLES, resolveLayout, type FolderSource, type LibraryRole } from '@astro/domain'
import type { SettingReader } from './app-settings'

/** The folder chosen in Settings for each part of the library; null where none was (specs/044-library-layout). */
export function chosenFolders(setting: SettingReader): Record<LibraryRole, string | null> {
  return Object.fromEntries(LIBRARY_ROLES.map(role => [role, setting(LIBRARY_FOLDER_KEYS[role])?.trim() || null])) as Record<LibraryRole, string | null>
}

/**
 * The folder each part of the library reads now, for the code that needs it at once: the scan,
 * the gallery, the Messier mosaic and the Vespera landing (LAY-001, LAY-004). Null with no home
 * folder. Lists the home folder once, to find a conventional folder in any case.
 */
export function libraryLayoutNow(setting: SettingReader): { home: string; layout: Record<LibraryRole, { path: string; source: FolderSource }> } | null {
  const home = setting('home_folder_path')?.trim()
  if (!home) return null
  let names: string[] = []
  try {
    names = fs.readdirSync(home, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    // An unreadable home folder has no folders; each part reads its conventional name.
  }
  return { home, layout: resolveLayout(chosenFolders(setting), names, name => path.join(home, name)) }
}

/** The folder one part reads now; null with no home folder. A chosen folder needs no listing of the home folder. */
export function libraryFolder(setting: SettingReader, role: LibraryRole): string | null {
  if (!setting('home_folder_path')?.trim()) return null
  return chosenFolders(setting)[role] ?? libraryLayoutNow(setting)?.layout[role].path ?? null
}

/** The folders the user chose for the library, which the app only reads, like the home folder. */
export function chosenLibraryFolders(setting: SettingReader): string[] {
  return Object.values(chosenFolders(setting)).filter((p): p is string => !!p)
}
