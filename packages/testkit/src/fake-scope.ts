import { ScopeUnreachableError, type ScopeConnection, type ScopeFiles } from '@astro/application'
import { remotePath, type RemoteEntry } from '@astro/domain'

/**
 * A pretend Vespera: files on the scope by their absolute path, folders implied by the files
 * under them (or added empty). It records every call, so a test can show nothing but listing
 * and reading ever happened.
 */
export class InMemoryScope implements ScopeFiles {
  readonly files = new Map<string, string>()
  readonly folders = new Set<string>(['/'])
  readonly calls: string[] = []
  /** When set, open() fails as an unreachable scope does. */
  unreachable = false
  /** The one address the pretend scope answers at. */
  answersAt = '10.0.0.1:21'
  /** Sizes the listing reports instead of the real ones, as a server that lies would. */
  readonly listedSize = new Map<string, number | null>()
  /** How many connections are open now. */
  openConnections = 0

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
      async retrieve(remote, offset, onStart, onChunk) {
        if (closed) throw new Error('The connection is closed.')
        const r = remotePath(remote)
        const text = scope.files.get(r)
        if (text === undefined) throw new Error(`550 ${r}: no such file`)
        const bytes = new TextEncoder().encode(text)
        const from = Math.max(0, Math.min(Math.trunc(offset), bytes.length))
        scope.calls.push(`retrieve ${r} from ${from}`)
        onStart(from)
        if (bytes.length > from) await onChunk(bytes.slice(from))
      },
      async close() {
        if (!closed) scope.openConnections--
        closed = true
      }
    }
  }
}
