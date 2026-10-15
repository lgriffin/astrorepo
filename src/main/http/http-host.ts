import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import path from 'path'
import type { ChannelRouter } from '../transport/router'

/** The largest request body read; anything bigger is refused unread (PI-011). */
export const MAX_BODY_BYTES = 1024 * 1024

/** The header that carries the per-start token on every API request (PI-009). */
export const TOKEN_HEADER = 'x-astrorepo-token'

export interface HttpHostOptions {
  router: ChannelRouter
  /** The built renderer (out/renderer). */
  staticDir: string
  /** Made fresh at each start and written into index.html; every API request must carry it. */
  token: string
  /** Host names a request may address, without port; anything else is refused (PI-008). */
  allowedHosts: string[]
  maxBodyBytes?: number
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'"
}

/** The host name a Host header names, lower case, without its port or IPv6 brackets. */
export function hostName(header: string | undefined): string | null {
  if (!header) return null
  const m = /^\[([^\]]+)\](?::\d+)?$/.exec(header) ?? /^([^:]+)(?::\d+)?$/.exec(header)
  return m ? m[1].toLowerCase() : null
}

/**
 * The names this machine answers to: localhost, its host name with and without .local, each of
 * its network addresses, and any extra names the person configured (PI-008).
 */
export function hostsFor(hostname: string, addresses: string[], extra: string[]): string[] {
  const names = ['localhost', '127.0.0.1', '::1', hostname, `${hostname}.local`, ...addresses, ...extra]
  return [...new Set(names.map(n => n.trim().toLowerCase()).filter(n => n.length > 0))]
}

function sameToken(given: string | string[] | undefined, token: string): boolean {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(token)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function send(res: http.ServerResponse, status: number, body: unknown, method = 'POST'): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) })
  res.end(method === 'HEAD' ? undefined : text)
}

/**
 * Reads the body up to `limit` bytes; resolves null as soon as it is longer, without reading the
 * rest, so a sender cannot hold the connection by streaming without end (PI-011).
 */
function readBody(req: http.IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length'] ?? 0) > limit) {
      resolve(null)
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    const onData = (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        req.off('data', onData)
        req.pause()
        resolve(null)
      } else {
        chunks.push(chunk)
      }
    }
    req.on('data', onData)
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

/** Answers and then closes the connection, for a request whose body is left unread. */
function refuseUnread(res: http.ServerResponse, status: number, body: unknown): void {
  res.setHeader('Connection', 'close')
  send(res, status, body)
  res.on('finish', () => res.req.destroy())
}

/** An error a Desktop throws when the browser itself should open a web page (PI-012). */
export class OpenInBrowser extends Error {
  constructor(readonly url: string) {
    super(`Open ${url} in the browser.`)
    this.name = 'OpenInBrowser'
  }
}

const webPage = (url: string) => /^https?:\/\//i.test(url)

/**
 * Serves the renderer and every channel of the router over HTTP, so a browser on the network or a
 * kiosk on a Raspberry Pi can use astrorepo without Electron (specs/035-pi-variant, slice 2).
 * `POST /api/invoke/<channel>` with `{ "args": [...] }` answers `{ "value": ... }` or `{ "error": "..." }`.
 */
export function createHttpHost(options: HttpHostOptions): http.Server {
  const limit = options.maxBodyBytes ?? MAX_BODY_BYTES
  const allowed = new Set(options.allowedHosts.map(h => h.toLowerCase()))
  const root = path.resolve(options.staticDir)
  let realRootCache: string | null = null
  const realRoot = () => (realRootCache ??= fs.realpathSync(root))

  async function api(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
    const m = /^\/api\/invoke\/([^/]+)$/.exec(pathname)
    if (!m) return send(res, 404, { error: 'There is no such API address.' })
    if (req.method !== 'POST') return send(res, 405, { error: 'API requests are POSTs.' })
    const origin = req.headers.origin
    if (origin !== undefined && origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Requests from another site are refused.' })
    if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Requests from another site are refused.' })
    if (!sameToken(req.headers[TOKEN_HEADER], options.token)) return send(res, 401, { error: 'The page is out of date. Reload it to carry on.' })
    if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return send(res, 415, { error: 'API requests carry JSON.' })
    const text = await readBody(req, limit)
    if (text === null) return refuseUnread(res, 413, { error: `The request is larger than ${Math.round(limit / 1024)} KB.` })
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return send(res, 400, { error: 'The request is not valid JSON.' })
    }
    const args = (body as { args?: unknown } | null)?.args
    if (!Array.isArray(args)) return send(res, 400, { error: 'The request has no list of arguments.' })
    let channel: string
    try {
      channel = decodeURIComponent(m[1])
    } catch {
      return send(res, 400, { error: 'The channel name is not valid.' })
    }
    if (!options.router.has(channel)) return send(res, 404, { error: `No handler for the channel "${channel}".` })
    try {
      const value = await options.router.invoke(channel, ...args)
      send(res, 200, { value: value === undefined ? null : value })
    } catch (error) {
      if (error instanceof OpenInBrowser && webPage(error.url)) return send(res, 200, { openInBrowser: error.url })
      const message = error instanceof Error ? error.message : String(error)
      send(res, error instanceof Error && error.name === 'ZodError' ? 400 : 500, { error: message })
    }
  }

  function file(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Only GET and HEAD read files.' }, req.method)
    let rel: string
    try {
      rel = decodeURIComponent(pathname)
    } catch {
      return send(res, 400, { error: 'The address is not valid.' }, req.method)
    }
    if (rel.includes('\0')) return send(res, 400, { error: 'The address is not valid.' }, req.method)
    const target = path.resolve(root, `.${rel === '/' ? '/index.html' : rel}`)
    if (target !== root && !target.startsWith(root + path.sep)) return send(res, 404, { error: 'Not found.' }, req.method)
    let data: Buffer
    try {
      // A link inside the built renderer must not lead outside it.
      const real = fs.realpathSync(target)
      if (real !== realRoot() && !real.startsWith(realRoot() + path.sep)) return send(res, 404, { error: 'Not found.' }, req.method)
      if (!fs.statSync(real).isFile()) return send(res, 404, { error: 'Not found.' }, req.method)
      data = fs.readFileSync(real)
    } catch {
      return send(res, 404, { error: 'Not found.' }, req.method)
    }
    const isIndex = target === path.join(root, 'index.html')
    if (isIndex) data = Buffer.from(data.toString('utf-8').replace('</head>', `<meta name="astrorepo-token" content="${options.token}">\n</head>`))
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': isIndex ? 'no-store' : 'public, max-age=3600'
    })
    res.end(req.method === 'HEAD' ? undefined : data)
  }

  const fail = (res: http.ServerResponse, error: unknown) => {
    if (res.headersSent) res.destroy()
    else send(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }

  return http.createServer((req, res) => {
    // Nothing a request carries may take the server down (PI-016).
    try {
      const host = hostName(req.headers.host)
      if (host === null || !allowed.has(host)) return send(res, 403, { error: 'astrorepo does not answer to that address. Add it to ASTRO_HOSTS.' }, req.method)
      let pathname: string
      try {
        pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      } catch {
        return send(res, 400, { error: 'The address is not valid.' }, req.method)
      }
      if (pathname.startsWith('/api/')) {
        api(req, res, pathname).catch(error => fail(res, error))
        return
      }
      file(req, res, pathname)
    } catch (error) {
      fail(res, error)
    }
  })
}
