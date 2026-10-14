import { CopyCancelledError, ScopeUnreachableError, type LandingArea, type ScopeConnection, type ScopeFiles } from '@astro/application'
import { remotePath, type RemoteEntry } from '@astro/domain'

/** A pretend PC folder copies land in: absolute paths with forward slashes map to file text. */
export class InMemoryLandingArea implements LandingArea {
  readonly disk = new Map<string, string>()
  /** Free bytes on the landing disk; null when it will not say. */
  free: number | null = 1024 ** 4

  put(path: string, text: string): this {
    this.disk.set(path, text)
    return this
  }

  join(root: string, parts: string[]): string {
    return [root.replace(/\/+$/, ''), ...parts].join('/')
  }

  async sizes(paths: string[]): Promise<(number | null)[]> {
    return paths.map(p => this.disk.get(p)?.length ?? null)
  }

  async freeBytes(): Promise<number | null> {
    return this.free
  }

  /** Every file under a folder, relative with forward slashes, sorted. */
  listing(dir: string): string[] {
    const prefix = `${dir.replace(/\/+$/, '')}/`
    return [...this.disk.keys()].filter(p => p.startsWith(prefix)).map(p => p.slice(prefix.length)).sort()
  }
}

/**
 * A pretend Vespera: files on the scope by their absolute path, folders implied by the files
 * under them (or added empty). Downloads land in an InMemoryLandingArea. It records every call,
 * so a test can show nothing but listing and reading ever happened.
 */
export class InMemoryScope implements ScopeFiles {
  readonly files = new Map<string, string>()
  readonly folders = new Set<string>(['/'])
  readonly calls: string[] = []
  /** When set, open() fails as an unreachable scope does. */
  unreachable = false
  /** The one address the pretend scope answers at. */
  answersAt = '10.0.0.1:21'
  /** A file whose download fails part way, as a Wi-Fi drop does, after half its bytes. */
  dropAt: string | null = null
  /** Sizes the listing reports instead of the real ones, as a server that lies would. */
  readonly listedSize = new Map<string, number | null>()
  /** Called after each chunk of a download, so a test can cancel mid-copy. */
  onChunk: ((remote: string, received: number) => void) | null = null
  /** How many connections are open now. */
  openConnections = 0

  constructor(readonly landing: InMemoryLandingArea = new InMemoryLandingArea()) {}

  put(path: string, text: string): this {
    const p = remotePath(path)
    this.files.set(p, text)
    for (let at = p.lastIndexOf('/'); at > 0; at = p.lastIndexOf('/', at - 1)) this.folders.add(p.slice(0, at))
    return this
  }

  folder(path: string): this {
    this.folders.add(remotePath(path))
    return this
  }

  private self(): InMemoryScope {
    return this
  }

  async open(host: string, port: number): Promise<ScopeConnection> {
    this.calls.push(`open ${host}:${port}`)
    if (this.unreachable || `${host}:${port}` !== this.answersAt) throw new ScopeUnreachableError(`Nothing answered at ${host}:${port}.`)
    this.openConnections++
    let closed = false
    const scope: InMemoryScope = this.self()
    return {
      async list(dir) {
        if (closed) throw new Error('The connection is closed.')
        const d = remotePath(dir)
        scope.calls.push(`list ${d}`)
        if (!scope.folders.has(d)) throw new Error(`550 ${d}: no such folder`)
        const prefix = d === '/' ? '/' : `${d}/`
        const out = new Map<string, RemoteEntry>()
        for (const f of scope.folders) {
          if (f !== d && f.startsWith(prefix) && !f.slice(prefix.length).includes('/')) out.set(f.slice(prefix.length), { name: f.slice(prefix.length), kind: 'dir', sizeBytes: null })
        }
        for (const [f, text] of scope.files) {
          if (f.startsWith(prefix) && !f.slice(prefix.length).includes('/')) {
            const size = scope.listedSize.has(f) ? scope.listedSize.get(f)! : text.length
            out.set(f.slice(prefix.length), { name: f.slice(prefix.length), kind: 'file', sizeBytes: size })
          }
        }
        return [...out.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
      },
      async download(remote, local, expectedBytes, onBytes, cancelled) {
        if (closed) throw new Error('The connection is closed.')
        const r = remotePath(remote)
        scope.calls.push(`download ${r}`)
        const text = scope.files.get(r)
        if (text === undefined) throw new Error(`550 ${r}: no such file`)
        if (scope.landing.disk.has(local)) throw new Error(`${local} already exists`)
        let received = 0
        // Two chunks, so progress and cancelling between chunks can be seen.
        for (const chunk of [text.slice(0, Math.ceil(text.length / 2)), text.slice(Math.ceil(text.length / 2))]) {
          if (cancelled()) throw new CopyCancelledError()
          if (scope.dropAt === r && received > 0) throw new Error('The connection to the scope was lost.')
          received += chunk.length
          onBytes(received)
          scope.onChunk?.(r, received)
        }
        if (cancelled()) throw new CopyCancelledError()
        if (expectedBytes !== null && received !== expectedBytes) {
          throw new Error(`${r} arrived with ${received} bytes, not the ${expectedBytes} the scope listed.`)
        }
        scope.landing.disk.set(local, text)
        return received
      },
      async close() {
        if (!closed) scope.openConnections--
        closed = true
      }
    }
  }
}
