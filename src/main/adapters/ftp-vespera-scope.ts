import { ScopeDisconnectedError, type ScopeConnection, type ScopeFiles, type ScopeRead, type VesperaScope } from '@astro/application'
import type { ScopeEntry } from '@astro/domain'

/** Errors that say the scope answered and refused, not that the link went away. */
const REFUSAL = /^The scope (refused|would not)/

/**
 * VesperaScope over the Vespera's FTP server (spec 034), on the FTP connection of spec 033: one
 * signed-in connection, opened when first needed and again after the link drops. Paths are from the
 * scope's root. It only lists and reads; every command goes through that connection's read-only
 * command list.
 */
export class FtpVesperaScope implements VesperaScope {
  private connection: Promise<ScopeConnection> | null = null

  constructor(
    private readonly files: ScopeFiles,
    private readonly host: string,
    private readonly port: number
  ) {}

  private connect(): Promise<ScopeConnection> {
    if (!this.connection) {
      this.connection = this.files.open(this.host, this.port)
      this.connection.catch(() => (this.connection = null))
    }
    return this.connection
  }

  /** Runs one call on the connection; a dropped link drops the connection too, and says so as ScopeDisconnectedError. */
  private async use<T>(call: (c: ScopeConnection) => Promise<T>): Promise<T> {
    let conn: ScopeConnection
    try {
      conn = await this.connect()
    } catch (error) {
      throw new ScopeDisconnectedError((error as Error).message)
    }
    try {
      return await call(conn)
    } catch (error) {
      if (error instanceof ScopeDisconnectedError) throw error
      const message = error instanceof Error ? error.message : String(error)
      if (REFUSAL.test(message)) throw error
      await this.drop()
      throw new ScopeDisconnectedError(message)
    }
  }

  private async drop(): Promise<void> {
    const conn = this.connection
    this.connection = null
    if (conn) await conn.then(c => c.close(), () => undefined)
  }

  async list(path: string): Promise<ScopeEntry[]> {
    const entries = await this.use(c => c.list(`/${path.replace(/^\/+/, '')}`))
    return entries.map(e => ({ name: e.name, type: e.kind, sizeBytes: e.sizeBytes ?? 0, modifiedAt: null }))
  }

  async read(path: string, offset: number): Promise<ScopeRead> {
    const queue: Uint8Array[] = []
    let wake: (() => void) | null = null
    let finished = false
    let failure: unknown = null
    let startFrom: (from: number) => void = () => undefined
    const started = new Promise<number>(resolve => (startFrom = resolve))
    const done = this.use(c =>
      c.retrieve(`/${path.replace(/^\/+/, '')}`, offset, startFrom, chunk => {
        queue.push(chunk)
        wake?.()
      })
    ).then(
      () => undefined,
      error => {
        failure = error
      }
    ).finally(() => {
      finished = true
      wake?.()
    })
    const from = await Promise.race([started, done.then(() => null)])
    if (from === null) throw failure
    async function* chunks(): AsyncIterable<Uint8Array> {
      for (;;) {
        if (queue.length > 0) {
          yield new Uint8Array(queue.shift()!)
          continue
        }
        if (finished) {
          if (failure) throw failure
          return
        }
        await new Promise<void>(resolve => (wake = resolve))
        wake = null
      }
    }
    return { from, chunks: chunks() }
  }

  async head(path: string, maxBytes: number): Promise<Uint8Array> {
    const read = await this.read(path, 0)
    const out = new Uint8Array(maxBytes)
    let have = 0
    for await (const chunk of read.chunks) {
      if (have < maxBytes) out.set(chunk.subarray(0, maxBytes - have), have)
      have += chunk.length
    }
    return out.slice(0, Math.min(have, maxBytes))
  }
}
