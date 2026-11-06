import type { FolderSample, LibraryRole } from '@astro/domain'

/** Driven port: looks inside the home folder, read only (specs/044-library-layout). */
export interface LibraryFolders {
  /**
   * Each folder directly under `home`, with the names of some files inside it at any depth. Hidden
   * folders and links are left out; an unreadable or missing home folder has none.
   */
  survey(home: string): Promise<FolderSample[]>
  /** The names of the folders directly under `home`; none when it cannot be read. */
  names(home: string): Promise<string[]>
  /**
   * The folder's canonical path (links and ".." resolved) when it is a folder whose entries can be
   * listed; null otherwise.
   */
  folderAt(path: string): Promise<string | null>
  /** A path under the home folder. */
  join(home: string, name: string): string
}

/** Driven port: the home folder and the folder chosen for each part, as saved in Settings → Folders. */
export interface LibraryLayoutStore {
  home(): Promise<string | null>
  /** The folder chosen for each part; null where none was chosen. */
  chosen(): Promise<Record<LibraryRole, string | null>>
  /** Saves the parts given; null clears a choice, so the conventional folder is read again. */
  choose(layout: Partial<Record<LibraryRole, string | null>>): Promise<void>
}
