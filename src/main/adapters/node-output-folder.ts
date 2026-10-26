import fs from 'fs'
import path from 'path'
import type { FolderFile, OutputFolder } from '@astro/application'

/** What is in a folder and how big a file is, read only: nothing here writes or deletes. */
export class NodeOutputFolder implements OutputFolder {
  async list(dir: string): Promise<FolderFile[] | null> {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return null
    }
    const files: FolderFile[] = []
    for (const e of entries.filter(x => x.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name)
      const stat = await this.stat(full)
      if (stat) files.push({ path: full, name: e.name, sizeBytes: stat.sizeBytes })
    }
    return files
  }

  async stat(file: string): Promise<{ sizeBytes: number; modifiedAt: Date } | null> {
    try {
      const s = await fs.promises.stat(file)
      return s.isFile() ? { sizeBytes: s.size, modifiedAt: s.mtime } : null
    } catch {
      return null
    }
  }
}
