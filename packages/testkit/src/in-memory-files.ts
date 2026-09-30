import type { ContentHasher, FileHashStore, FileIndex, FrameDetail, PlacementResult, SirilWorkspace, WorkAreaSpace } from '@astro/application'
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
  /** Work-area path to the source path it was placed from, and the source version it matched. */
  readonly placed = new Map<string, string>()
  private readonly placedVersion = new Map<string, number>()
  readonly folders = new Set<string>()
  /** Paths the fake treats as living on another volume, so they must be copied. */
  readonly otherVolume = new Set<string>()
  /** Source paths rewritten since they were placed, by how many times. */
  private readonly versions = new Map<string, number>()

  /** `name` may include subfolders, for example "night1/darks/d1.fit". */
  addSource(dir: string, ...frames: { name: string; imageType?: string | null }[]): this {
    this.source.set(dir, [...(this.source.get(dir) ?? []), ...frames.map(f => ({ name: f.name, imageType: f.imageType ?? null }))])
    return this
  }

  /** Simulates the source file changing on disk. */
  rewrite(path: string): this {
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1)
    return this
  }

  async listSourceFrames(sourceDir: string) {
    return (this.source.get(sourceDir) ?? [])
      .map(f => ({ path: `${sourceDir}/${f.name}`, name: f.name.split('/').pop() ?? f.name, imageType: f.imageType }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  async prepareFolders(workDir: string): Promise<void> {
    for (const f of ['lights', 'darks', 'flats', 'biases']) this.folders.add(`${workDir}/${f}`)
  }

  async place(p: SirilPlacement, workDir: string): Promise<PlacementResult> {
    const dest = `${workDir}/${p.folder}/${p.name}`
    const version = this.versions.get(p.from) ?? 0
    if (this.placed.get(dest) === p.from && this.placedVersion.get(dest) === version) return 'existing'
    this.placed.set(dest, p.from)
    this.placedVersion.set(dest, version)
    return this.otherVolume.has(p.from) ? 'copied' : 'linked'
  }

  async contains(dir: string, candidate: string): Promise<boolean> {
    const d = dir.replace(/\/+$/, '')
    return candidate === d || candidate.startsWith(`${d}/`)
  }

  /** Size, dimensions and sensor per source path; unset frames are 50 MB and never indexed. */
  readonly details = new Map<string, Omit<FrameDetail, 'path'>>()
  space: WorkAreaSpace = { freeBytes: null, usedBytes: 0 }

  describe(path: string, detail: Partial<Omit<FrameDetail, 'path'>>): this {
    this.details.set(path, { sizeBytes: 50_000_000, width: null, height: null, colour: null, ...this.details.get(path), ...detail })
    return this
  }

  async frameDetails(paths: string[]): Promise<FrameDetail[]> {
    return paths.map(path => ({ path, ...(this.details.get(path) ?? { sizeBytes: 50_000_000, width: null, height: null, colour: null }) }))
  }

  async workAreaSpace(): Promise<WorkAreaSpace> {
    return { ...this.space }
  }

  async copyBytes(placements: SirilPlacement[], workDir: string): Promise<number> {
    let bytes = 0
    for (const p of placements) {
      const dest = `${workDir}/${p.folder}/${p.name}`
      const current = this.placed.get(dest) === p.from && this.placedVersion.get(dest) === (this.versions.get(p.from) ?? 0)
      if (!current && this.otherVolume.has(p.from)) bytes += this.details.get(p.from)?.sizeBytes ?? 50_000_000
    }
    return bytes
  }
}
