import type { FolderSample, LibraryRole } from '@astro/domain'
import type { LibraryFolders, LibraryLayoutStore } from '@astro/application'

/** A home folder held in memory: its folders and the files sampled in each (specs/044-library-layout). */
export class InMemoryLibraryFolders implements LibraryFolders {
  constructor(
    private readonly homes: Record<string, FolderSample[]> = {},
    /** Folders elsewhere that can be chosen, beside those under each home. */
    private readonly elsewhere: string[] = []
  ) {}

  async survey(home: string): Promise<FolderSample[]> {
    return (this.homes[home] ?? []).map(f => ({ ...f, files: [...f.files] }))
  }

  async names(home: string): Promise<string[]> {
    return (this.homes[home] ?? []).map(f => f.name)
  }

  async isFolder(path: string): Promise<boolean> {
    return this.elsewhere.includes(path) || Object.values(this.homes).some(fs => fs.some(f => f.path === path))
  }

  join(home: string, name: string): string {
    return `${home}/${name}`
  }
}

export class InMemoryLibraryLayoutStore implements LibraryLayoutStore {
  private saved: Record<LibraryRole, string | null> = { raw: null, stacked: null, tif: null, images: null }

  constructor(private readonly homeFolder: string | null = null, chosen: Partial<Record<LibraryRole, string | null>> = {}) {
    Object.assign(this.saved, chosen)
  }

  async home(): Promise<string | null> {
    return this.homeFolder
  }

  async chosen(): Promise<Record<LibraryRole, string | null>> {
    return { ...this.saved }
  }

  async choose(layout: Partial<Record<LibraryRole, string | null>>): Promise<void> {
    for (const [role, path] of Object.entries(layout) as [LibraryRole, string | null | undefined][]) {
      if (path !== undefined) this.saved[role] = path && path.trim() ? path.trim() : null
    }
  }
}
