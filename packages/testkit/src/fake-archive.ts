import type { ArchiveArea, ArchiveRecord, ArchiveStore } from '@astro/application'
import { ARCHIVE_INDEX_FILE, INTERMEDIATE_FOLDERS, type ArchiveCopy, type ArchiveIndex, type WorkAreaFile } from '@astro/domain'

interface Entry {
  /** Names sharing an id are hard links to one file. */
  id: number
  sizeBytes: number
  text: string
  symlink: boolean
}

const parent = (p: string) => p.slice(0, p.lastIndexOf('/'))
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/**
 * A pretend disk for archiving: absolute paths with forward slashes map to files that may share
 * an id (hard links) or be symbolic links. Folders exist while a file is under them.
 */
export class InMemoryArchiveArea implements ArchiveArea {
  readonly disk = new Map<string, Entry>()
  /** Free bytes where archives go; null when the disk will not say. */
  free: number | null = 1024 ** 4
  private next = 1

  /** A file of its own; its text stands for its bytes unless a size is given. */
  put(path: string, text: string, sizeBytes = text.length): this {
    this.disk.set(path, { id: this.next++, sizeBytes, text, symlink: false })
    return this
  }

  /** Another name for an existing file, as a hard link is. */
  link(path: string, existing: string): this {
    const entry = this.disk.get(existing)
    if (!entry) throw new Error(`ENOENT: ${existing}`)
    this.disk.set(path, entry)
    return this
  }

  symlink(path: string): this {
    this.disk.set(path, { id: this.next++, sizeBytes: 0, text: '', symlink: true })
    return this
  }

  delete(path: string): this {
    this.disk.delete(path)
    return this
  }

  /** Every path under `dir`, relative, sorted. */
  listing(dir: string): string[] {
    return [...this.disk.keys()].filter(p => p.startsWith(`${dir}/`)).map(p => p.slice(dir.length + 1)).sort()
  }

  private links(entry: Entry): number {
    return [...this.disk.values()].filter(e => e === entry).length
  }

  async survey(workDir: string): Promise<WorkAreaFile[]> {
    return this.listing(workDir).map(rel => {
      const e = this.disk.get(`${workDir}/${rel}`) as Entry
      return { path: rel, sizeBytes: e.symlink ? 0 : e.sizeBytes, links: e.symlink ? 1 : this.links(e), fileId: e.symlink ? null : String(e.id), symlink: e.symlink }
    })
  }

  async readText(workDir: string, relative: string): Promise<string> {
    const e = relative.split('/').includes('..') ? undefined : this.disk.get(`${workDir}/${relative}`)
    if (!e) throw new Error(`ENOENT: ${relative}`)
    return e.text
  }

  async sizes(paths: string[]): Promise<(number | null)[]> {
    return paths.map(p => {
      const e = this.disk.get(p)
      return e && !e.symlink ? e.sizeBytes : null
    })
  }

  async freeBytes(): Promise<number | null> {
    return this.free
  }

  async exists(path: string): Promise<boolean> {
    return this.disk.has(path) || [...this.disk.keys()].some(p => p.startsWith(`${path}/`))
  }

  join(dir: string, name: string): string {
    return `${dir.replace(/\/+$/, '')}/${name}`
  }

  async build(workDir: string, dest: string, copies: ArchiveCopy[], index: ArchiveIndex): Promise<string> {
    if (await this.exists(dest)) throw new Error(`${dest} already exists.`)
    const staging = `${parent(dest)}/.${base(dest)}.partial`
    try {
      for (const c of copies) {
        if (c.to.split('/').includes('..') || (c.inWorkFolder && c.from.split('/').includes('..'))) throw new Error(`${c.to} is not inside the archive.`)
        const from = c.inWorkFolder ? `${workDir}/${c.from}` : c.from
        const e = this.disk.get(from)
        if (!e) throw new Error(`ENOENT: ${from}`)
        if (e.sizeBytes !== c.sizeBytes) throw new Error(`${from} changed while it was copied.`)
        this.put(`${staging}/${c.to}`, e.text, e.sizeBytes)
      }
      this.put(`${staging}/${ARCHIVE_INDEX_FILE}`, JSON.stringify(index))
    } catch (error) {
      for (const p of this.listing(staging)) this.disk.delete(`${staging}/${p}`)
      throw error
    }
    for (const p of this.listing(staging)) {
      this.disk.set(`${dest}/${p}`, this.disk.get(`${staging}/${p}`) as Entry)
      this.disk.delete(`${staging}/${p}`)
    }
    return `${dest}/${ARCHIVE_INDEX_FILE}`
  }

  async removeFolders(workDir: string, folders: string[]): Promise<string[]> {
    const removed: string[] = []
    for (const folder of new Set(folders)) {
      if (!INTERMEDIATE_FOLDERS.includes(folder)) continue
      const inside = this.listing(`${workDir}/${folder}`)
      if (inside.length === 0) continue
      for (const p of inside) this.disk.delete(`${workDir}/${folder}/${p}`)
      removed.push(folder)
    }
    return removed.sort()
  }
}

export class InMemoryArchiveStore implements ArchiveStore {
  private readonly byTarget = new Map<string, ArchiveRecord>()

  async get(targetId: string): Promise<ArchiveRecord | null> {
    const r = this.byTarget.get(targetId)
    return r ? structuredClone(r) : null
  }

  async list(): Promise<ArchiveRecord[]> {
    return [...this.byTarget.values()].sort((a, b) => a.archivedAt.getTime() - b.archivedAt.getTime()).map(r => structuredClone(r))
  }

  async save(record: ArchiveRecord): Promise<void> {
    this.byTarget.set(record.targetId, structuredClone(record))
  }
}
