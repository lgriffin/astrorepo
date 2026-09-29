import type { ContentHasher, FileHashStore, FileIndex, PlacementResult, SirilWorkspace } from '@astro/application'
import type { FileHash, FileStamp, SirilPlacement } from '@astro/domain'

/**
 * A pretend disk: paths map to text content with a size and a modified time. Tests use it to drive
 * ingest use cases without touching a real file system, and to prove nothing was written.
 */
export class InMemoryDisk implements FileIndex, ContentHasher {
  readonly files = new Map<string, { content: string; modifiedAt: string }>()
  readonly reads: { path: string; kind: 'sample' | 'full' }[] = []

  put(path: string, content: string, modifiedAt = '2026-03-01T09:00:00.000Z'): this {
    this.files.set(path, { content, modifiedAt })
    return this
  }

  remove(path: string): this {
    this.files.delete(path)
    return this
  }

  stamp(path: string): FileStamp {
    const f = this.files.get(path)
    if (!f) throw new Error(`no such file: ${path}`)
    return { path, sizeBytes: f.content.length, modifiedAt: f.modifiedAt }
  }

  async listIndexedFiles(): Promise<FileStamp[]> {
    return [...this.files.keys()].sort().map(p => this.stamp(p))
  }

  /** Samples the first 12 and last 4 characters, standing in for the real adapter's 64 KiB ends. */
  async quickKey(file: FileStamp): Promise<string> {
    const f = this.files.get(file.path)
    if (!f) throw new Error(`no such file: ${file.path}`)
    this.reads.push({ path: file.path, kind: 'sample' })
    return `sample:${f.content.length}:${f.content.slice(0, 12)}:${f.content.slice(-4)}`
  }

  async fullHash(path: string): Promise<string> {
    const f = this.files.get(path)
    if (!f) throw new Error(`no such file: ${path}`)
    this.reads.push({ path, kind: 'full' })
    return `full:${f.content}`
  }
}

export class InMemoryFileHashStore implements FileHashStore {
  private readonly byPath = new Map<string, FileHash>()

  async listHashes(): Promise<FileHash[]> {
    return [...this.byPath.values()].sort((a, b) => a.path.localeCompare(b.path)).map(h => structuredClone(h))
  }

  async saveHashes(hashes: FileHash[]): Promise<void> {
    for (const h of hashes) this.byPath.set(h.path, structuredClone(h))
  }

  async removeHashes(paths: string[]): Promise<void> {
    for (const p of paths) this.byPath.delete(p)
  }
}

/** A Siril work area over plain maps; `source` is read-only by construction. */
export class InMemorySirilWorkspace implements SirilWorkspace {
  readonly source = new Map<string, { name: string; imageType: string | null }[]>()
  readonly placed = new Map<string, string>()
  readonly folders = new Set<string>()
  /** Paths the fake treats as living on another volume, so they must be copied. */
  readonly otherVolume = new Set<string>()

  addSource(dir: string, ...frames: { name: string; imageType?: string | null }[]): this {
    this.source.set(dir, [...(this.source.get(dir) ?? []), ...frames.map(f => ({ name: f.name, imageType: f.imageType ?? null }))])
    return this
  }

  async listSourceFrames(sourceDir: string) {
    return (this.source.get(sourceDir) ?? []).map(f => ({ path: `${sourceDir}/${f.name}`, name: f.name, imageType: f.imageType }))
  }

  async prepareFolders(workDir: string): Promise<void> {
    for (const f of ['lights', 'darks', 'flats', 'biases']) this.folders.add(`${workDir}/${f}`)
  }

  async place(p: SirilPlacement, workDir: string): Promise<PlacementResult> {
    const dest = `${workDir}/${p.folder}/${p.name}`
    if (this.placed.has(dest)) return 'existing'
    this.placed.set(dest, p.from)
    return this.otherVolume.has(p.from) ? 'copied' : 'linked'
  }
}
