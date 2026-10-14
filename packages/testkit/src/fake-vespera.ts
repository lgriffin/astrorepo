import { createHash } from 'crypto'
import {
  ScopeDisconnectedError,
  type ContentHasher,
  type IngestDisk,
  type IngestWriter,
  type ScopeRead,
  type VesperaMetadata,
  type VesperaScope,
  type VesperaTransferStore
} from '@astro/application'
import type { FileStamp, ScopeEntry, TransferJob } from '@astro/domain'

/** The user/ listing of Leigh's Vespera Pro on 2026-10-14: the first discovery fixture. */
export const LEIGH_USER_LISTING: readonly string[] = [
  '2024-06-15_21-00-54_observation_NGC3372',
  '2024-06-15_21-07-20_observation_NGC3372',
  '2024-06-15_21-21-39_observation_NGC3372',
  '2024-06-15_21-32-11_observation_moon',
  '2024-06-15_21-32-41_observation_NGC3372',
  '2024-06-15_21-39-51_observation_moon',
  '2024-06-15_21-40-35_observation_NGC3372',
  '2024-06-15_21-44-08_observation_moon',
  '2024-06-15_21-44-56_observation_NGC3372',
  '2024-06-15_21-52-17_auto-init',
  '2024-06-15_22-04-15_observation_moon',
  '2024-06-15_22-25-23_auto-init',
  '2024-06-16_01-12-12_observation_M8_M20_10_18',
  '2024-07-12_13-31-31_sun-mode',
  '2024-07-13_13-53-41_sun-mode',
  '2024-07-16_20-36-30_auto-init',
  '2024-07-16_20-40-47_observation_moon',
  'expert-mode'
]

const clean = (p: string) => p.replace(/^\/+|\/+$/g, '')
const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

/**
 * A pretend Vespera: a tree of folders and files by path from the scope's root. It logs every
 * command a client would send, so a test can show nothing but reads ever reach it, and it can drop
 * the link after a given number of bytes or refuse to resume, as the real scope's Wi-Fi and FTP server do.
 */
export class FakeVesperaScope implements VesperaScope {
  readonly files = new Map<string, { bytes: Uint8Array; modifiedAt: Date | null }>()
  readonly dirs = new Set<string>([''])
  /** Every command, as an FTP client would send it: LIST, RETR, REST. */
  readonly commands: string[] = []
  /** Whether a read honours its offset (REST). */
  resumes = true
  /** Drop the link once this many more bytes have been sent; null never drops. */
  dropAfterBytes: number | null = null
  /** Drop the link on the next listing. */
  dropOnList = false
  /** Sends a file one byte short this many times, as a truncated transfer would. */
  shortReads = 0
  /** Bytes each chunk of a read carries. */
  chunkBytes = 64 * 1024

  dir(path: string): this {
    let p = clean(path)
    while (p !== '' && !this.dirs.has(p)) {
      this.dirs.add(p)
      p = parentOf(p)
    }
    return this
  }

  /** A file; its text stands for its bytes, or `size` zero bytes when a number is given. */
  file(path: string, content: string | number | Uint8Array, modifiedAt: Date | null = null): this {
    const p = clean(path)
    this.dir(parentOf(p))
    const bytes = typeof content === 'number' ? new Uint8Array(content) : typeof content === 'string' ? new TextEncoder().encode(content) : content
    this.files.set(p, { bytes, modifiedAt })
    return this
  }

  async list(path: string): Promise<ScopeEntry[]> {
    const p = clean(path)
    this.commands.push(`LIST ${p}`)
    if (this.dropOnList) {
      this.dropOnList = false
      throw new ScopeDisconnectedError('the Wi-Fi went away')
    }
    if (!this.dirs.has(p)) throw new Error(`550 ${p}: no such folder`)
    const prefix = p === '' ? '' : `${p}/`
    const out: ScopeEntry[] = []
    for (const d of this.dirs) if (d !== p && d.startsWith(prefix) && !d.slice(prefix.length).includes('/')) out.push({ name: d.slice(prefix.length), type: 'dir', sizeBytes: 0, modifiedAt: null })
    for (const [f, v] of this.files) if (f.startsWith(prefix) && !f.slice(prefix.length).includes('/')) out.push({ name: f.slice(prefix.length), type: 'file', sizeBytes: v.bytes.length, modifiedAt: v.modifiedAt })
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }

  async read(path: string, offset: number): Promise<ScopeRead> {
    const p = clean(path)
    const file = this.files.get(p)
    if (!file) throw new Error(`550 ${p}: no such file`)
    const from = this.resumes ? Math.max(0, Math.min(offset, file.bytes.length)) : 0
    if (from > 0) this.commands.push(`REST ${from}`)
    this.commands.push(`RETR ${p}`)
    let end = file.bytes.length
    if (this.shortReads > 0) {
      this.shortReads--
      end = Math.max(from, end - 1)
    }
    const bytes = file.bytes.subarray(from, end)
    const chunkBytes = Math.max(1, this.chunkBytes)
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scope = this
    async function* chunks(): AsyncIterable<Uint8Array> {
      for (let at = 0; at < bytes.length; at += chunkBytes) {
        let chunk = bytes.subarray(at, Math.min(bytes.length, at + chunkBytes))
        if (scope.dropAfterBytes !== null) {
          if (scope.dropAfterBytes < chunk.length) {
            const partial = chunk.subarray(0, scope.dropAfterBytes)
            scope.dropAfterBytes = null
            if (partial.length > 0) yield partial
            throw new ScopeDisconnectedError('the Wi-Fi went away')
          }
          scope.dropAfterBytes -= chunk.length
        }
        chunk = new Uint8Array(chunk)
        yield chunk
      }
    }
    return { from, chunks: chunks() }
  }

  async head(path: string, maxBytes: number): Promise<Uint8Array> {
    const p = clean(path)
    const file = this.files.get(p)
    if (!file) throw new Error(`550 ${p}: no such file`)
    this.commands.push(`RETR ${p} (first ${maxBytes} bytes)`)
    return file.bytes.slice(0, maxBytes)
  }
}

/**
 * Seeds a fake scope with a session: `runs` maps a run folder to its files (a name and a size or
 * text). observation.json is written at the session's top when given.
 */
export function seedVesperaSession(
  scope: FakeVesperaScope,
  id: string,
  runs: Record<string, Record<string, string | number>>,
  options: { userFolder?: string; observationJson?: string } = {}
): FakeVesperaScope {
  const base = `${options.userFolder ?? 'user'}/${id}`
  scope.dir(base)
  if (options.observationJson !== undefined) scope.file(`${base}/observation.json`, options.observationJson)
  for (const [run, files] of Object.entries(runs)) {
    scope.dir(`${base}/${run}`)
    for (const [name, content] of Object.entries(files)) scope.file(`${base}/${run}/${name}`, content)
  }
  return scope
}

/** A run of `frames` FITS with a JPEG and its JSON pair for each frame in `stacked`, and capture.json. */
export function vesperaImageRun(frames: number, stacked: number[] = [], options: { fitsBytes?: number; tiff?: number } = {}): Record<string, string | number> {
  const run: Record<string, string | number> = { 'capture.json': '{}' }
  const n = (i: number) => String(i).padStart(4, '0')
  for (let i = 1; i <= frames; i++) run[`img-${n(i)}.fits`] = options.fitsBytes ?? 32
  for (const i of stacked) {
    run[`img-${n(i)}-output.jpg`] = 16
    run[`img-${n(i)}-output.json`] = '{}'
    run[`img-${n(i)}-stacking.json`] = '{}'
  }
  if (options.tiff !== undefined) run[`img-${n(options.tiff)}.tif`] = 48
  return run
}

/**
 * A pretend destination disk: files by absolute path with forward slashes. It hashes like the
 * Node hasher (sha256 of every byte) and records every write, so a test can see what was touched.
 */
export class InMemoryIngestDisk implements IngestDisk, ContentHasher {
  readonly files = new Map<string, Uint8Array>()
  readonly writes: string[] = []
  /** A path whose writes fail, as a full or read-only disk would. */
  failWrites: string | null = null

  join(dir: string, ...parts: string[]): string {
    return [dir.replace(/\/+$/, ''), ...parts.map(p => p.replace(/^\/+|\/+$/g, ''))].filter(p => p !== '').join('/')
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || [...this.files.keys()].some(f => f.startsWith(`${path}/`))
  }

  async size(path: string): Promise<number | null> {
    return this.files.get(path)?.length ?? null
  }

  async append(path: string, from: number): Promise<IngestWriter> {
    if (this.failWrites !== null && path.startsWith(this.failWrites)) throw new Error(`EACCES: ${path}`)
    this.writes.push(path)
    let bytes = (this.files.get(path) ?? new Uint8Array(0)).slice(0, Math.max(0, from))
    if (bytes.length < from) bytes = new Uint8Array([...bytes, ...new Uint8Array(from - bytes.length)])
    this.files.set(path, bytes)
    return {
      write: async chunk => {
        const now = this.files.get(path) ?? new Uint8Array(0)
        const next = new Uint8Array(now.length + chunk.length)
        next.set(now)
        next.set(chunk, now.length)
        this.files.set(path, next)
      },
      close: async () => undefined
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const bytes = this.files.get(from)
    if (!bytes) throw new Error(`ENOENT: ${from}`)
    this.files.delete(from)
    this.files.set(to, bytes)
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }

  async readText(path: string): Promise<string | null> {
    const bytes = this.files.get(path)
    return bytes ? new TextDecoder().decode(bytes) : null
  }

  async writeText(path: string, text: string): Promise<void> {
    if (this.failWrites !== null && path.startsWith(this.failWrites)) throw new Error(`EACCES: ${path}`)
    this.writes.push(path)
    this.files.set(path, new TextEncoder().encode(text))
  }

  async quickKey(file: FileStamp): Promise<string> {
    return `quick:${file.path}:${file.sizeBytes}`
  }

  async fullHash(path: string): Promise<string> {
    const bytes = this.files.get(path)
    if (!bytes) throw new Error(`ENOENT: ${path}`)
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  }
}

/** Canned metadata: a JPEG or FITS "file" is its text, `EXIF:<description>` or `OBJECT:<name>`. */
export class FakeVesperaMetadata implements VesperaMetadata {
  exifDescription(bytes: Uint8Array): string | null {
    const m = /^EXIF:(.*)$/s.exec(new TextDecoder().decode(bytes))
    return m && m[1].trim() !== '' ? m[1].trim() : null
  }

  fitsObject(bytes: Uint8Array): string | null {
    const m = /^OBJECT:(.*)$/s.exec(new TextDecoder().decode(bytes))
    return m && m[1].trim() !== '' ? m[1].trim() : null
  }
}

export class InMemoryVesperaTransferStore implements VesperaTransferStore {
  readonly jobs = new Map<string, TransferJob>()

  async save(job: TransferJob): Promise<void> {
    this.jobs.set(job.id, structuredClone(job))
  }

  async get(id: string): Promise<TransferJob | null> {
    const job = this.jobs.get(id)
    return job ? structuredClone(job) : null
  }

  async list(): Promise<TransferJob[]> {
    return [...this.jobs.values()].map(j => structuredClone(j)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? -1 : 1))
  }
}
