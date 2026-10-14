import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'

/** A file found in a target's images folder. */
export interface FolderImage {
  path: string
  name: string
  modifiedAt: Date
  /** Whether the file sits in the folder itself rather than a folder inside it. */
  topLevel: boolean
}

/** The images folder the last image scan recorded for a target, or null when it has none. */
export function imagesFolderOf(db: Database.Database, targetId: string): string | null {
  const row = db.prepare('SELECT images_path FROM target_home_data WHERE target_id = ?').get(targetId) as { images_path: string | null } | undefined
  return row?.images_path || null
}

export interface ListFolderOptions {
  /** 1 (the default) also lists the folders directly inside; 0 lists the folder alone. */
  maxDepth?: 0 | 1
  /** Keeps only files whose names pass, before any is looked at on disk. */
  keep?: (name: string) => boolean
}

/**
 * Files whose names match `pattern` in a folder and, unless `maxDepth` is 0, the folders directly
 * inside it. A folder that cannot be read gives nothing, and a file that vanishes while listed is
 * left out. Lists; never opens a file.
 */
export function listFolderImages(dir: string, pattern: RegExp, options: ListFolderOptions = {}): FolderImage[] {
  const maxDepth = options.maxDepth ?? 1
  const out: FolderImage[] = []
  const list = (folder: string, depth: number) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(folder, e.name)
      if (e.isDirectory() && depth < maxDepth) list(full, depth + 1)
      else if (e.isFile() && pattern.test(e.name) && (options.keep?.(e.name) ?? true)) {
        let modifiedAt: Date
        try {
          modifiedAt = fs.statSync(full).mtime
        } catch {
          continue
        }
        out.push({ path: full, name: e.name, modifiedAt, topLevel: depth === 0 })
      }
    }
  }
  list(dir, 0)
  return out
}
