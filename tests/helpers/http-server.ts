import http from 'http'
import net from 'net'

export interface SeenRequest {
  url: string
  headers: http.IncomingHttpHeaders
}

export type Reply = { status?: number; body: string; delayMs?: number; contentType?: string }

/** A local HTTP server for weather adapters: answers every request with what the test sets, and records what it was asked. */
export class TestHttpServer {
  readonly seen: SeenRequest[] = []
  private reply: Reply = { body: '{}' }
  private readonly server = http.createServer((req, res) => {
    this.seen.push({ url: req.url ?? '', headers: req.headers })
    const r = this.reply
    const send = () => {
      if (res.destroyed) return
      res.writeHead(r.status ?? 200, { 'content-type': r.contentType ?? 'application/json' })
      res.end(r.body)
    }
    if (r.delayMs) setTimeout(send, r.delayMs)
    else send()
  })

  answer(reply: Reply | unknown): this {
    this.reply = isReply(reply) ? reply : { body: JSON.stringify(reply) }
    return this
  }

  async start(): Promise<string> {
    await new Promise<void>(resolve => this.server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${(this.server.address() as net.AddressInfo).port}`
  }

  stop(): Promise<void> {
    this.server.closeAllConnections()
    return new Promise(resolve => this.server.close(() => resolve()))
  }
}

const isReply = (v: unknown): v is Reply => typeof v === 'object' && v !== null && typeof (v as Reply).body === 'string'

/** A port where nothing listens: one the system just handed out and took back. */
export async function deadHttpAddress(): Promise<string> {
  const s = net.createServer()
  await new Promise<void>(resolve => s.listen(0, '127.0.0.1', resolve))
  const port = (s.address() as net.AddressInfo).port
  await new Promise<void>(resolve => s.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}
