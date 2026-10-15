import fs from 'fs'
import http from 'http'
import net from 'net'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHttpHost, hostName, hostsFor, OpenInBrowser } from '../../src/main/http/http-host'
import { ChannelRouter } from '../../src/main/transport/router'

const TOKEN = 'a'.repeat(48)
const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-host-'))
fs.writeFileSync(path.join(staticDir, 'index.html'), '<html><head><title>astrorepo</title></head><body></body></html>')
fs.mkdirSync(path.join(staticDir, 'assets'))
fs.writeFileSync(path.join(staticDir, 'assets', 'app.js'), 'console.log(1)')
fs.writeFileSync(path.join(os.tmpdir(), 'http-host-secret.txt'), 'secret')
let linked = true
try {
  fs.symlinkSync(path.join(os.tmpdir(), 'http-host-secret.txt'), path.join(staticDir, 'leak.txt'))
} catch {
  linked = false // Windows without the right to make links
}

const ran: string[] = []
const router = new ChannelRouter()
router.handle('echo', (...args: unknown[]) => { ran.push('echo'); return { args } })
router.handle('nothing', () => { ran.push('nothing'); return undefined })
router.handle('broken', () => { ran.push('broken'); throw new Error('The disk is full.') })
router.handle('link', (url: unknown) => { ran.push('link'); throw new OpenInBrowser(String(url)) })
router.handle('strict', (raw: unknown) => { ran.push('strict'); return z.object({ n: z.number() }).parse(raw) })

const server = createHttpHost({ router, staticDir, token: TOKEN, allowedHosts: ['127.0.0.1', 'astropi.local'], maxBodyBytes: 2048 })
let port = 0

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  port = (server.address() as AddressInfo).port
})
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  fs.rmSync(staticDir, { recursive: true, force: true })
})

interface Answer { status: number; headers: http.IncomingHttpHeaders; body: string; json: () => { value?: unknown; error?: string; openInBrowser?: string } }

/** Sends raw bytes and returns what comes back, or '' when the server closes without answering. */
function raw(bytes: string, keepOpen = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(bytes))
    let got = ''
    socket.on('data', d => {
      got += d.toString('utf-8')
      if (keepOpen && got.includes('\r\n\r\n')) socket.destroy()
    })
    socket.on('close', () => resolve(got))
    socket.on('error', e => (got ? resolve(got) : reject(e)))
  })
}

function request(options: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: options.method ?? 'GET', path: options.path, headers: options.headers }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json: () => JSON.parse(body) })
      })
    })
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

const call = (channel: string, args: unknown[], headers: Record<string, string> = {}) => request({
  method: 'POST',
  path: `/api/invoke/${encodeURIComponent(channel)}`,
  headers: { 'Content-Type': 'application/json', 'X-Astrorepo-Token': TOKEN, ...headers },
  body: JSON.stringify({ args })
})

describe('The headless HTTP host (specs/035-pi-variant)', () => {
  it('[PI-007] Given a channel on the router, When it is posted with its arguments, Then its answer comes back as the value', async () => {
    const answer = await call('echo', [{ query: 'M31' }, 3])
    expect(answer.status).toBe(200)
    expect(answer.json()).toEqual({ value: { args: [{ query: 'M31' }, 3] } })
    expect(answer.headers['cache-control']).toBe('no-store')
  })

  it('[PI-007] Given a handler that answers nothing, When it is posted, Then the value is null', async () => {
    expect((await call('nothing', [])).json()).toEqual({ value: null })
  })

  it('[PI-007] Given a handler that throws, When it is posted, Then the error message comes back with 500', async () => {
    const answer = await call('broken', [])
    expect(answer.status).toBe(500)
    expect(answer.json()).toEqual({ error: 'The disk is full.' })
  })

  it('[PI-007] Given arguments a schema refuses, When they are posted, Then the validation error comes back with 400', async () => {
    const answer = await call('strict', [{ n: 'one' }])
    expect(answer.status).toBe(400)
    expect(answer.json().error).toMatch(/number/)
  })

  it('[PI-007] Given the page, When it is read, Then it carries this start\'s token and is never cached', async () => {
    const page = await request({ path: '/' })
    expect(page.status).toBe(200)
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(page.body).toContain(`<meta name="astrorepo-token" content="${TOKEN}">`)
    expect(page.headers['cache-control']).toBe('no-store')
    expect(page.headers['x-frame-options']).toBe('DENY')
    const asset = await request({ path: '/assets/app.js' })
    expect(asset.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(asset.body).toBe('console.log(1)')
    expect((await request({ method: 'HEAD', path: '/assets/app.js' })).body).toBe('')
  })

  it('[PI-008] Given a request to a host name that is not this machine\'s, When it arrives, Then it is refused with 403 and nothing runs', async () => {
    ran.length = 0
    expect((await request({ path: '/', headers: { Host: 'evil.example' } })).status).toBe(403)
    expect((await call('echo', [], { Host: 'evil.example:8090' })).status).toBe(403)
    expect(ran).toEqual([])
    expect((await request({ path: '/', headers: { Host: 'astropi.local:8090' } })).status).toBe(200)
  })

  it('[PI-009] Given an API request without the token or with a wrong one, When it arrives, Then it is refused with 401 and nothing runs', async () => {
    ran.length = 0
    expect((await call('echo', [], { 'X-Astrorepo-Token': '' })).status).toBe(401)
    expect((await call('echo', [], { 'X-Astrorepo-Token': 'b'.repeat(48) })).status).toBe(401)
    expect((await call('echo', [], { 'X-Astrorepo-Token': 'short' })).status).toBe(401)
    expect(ran).toEqual([])
  })

  it('[PI-009] Given an API request from another site, When it arrives, Then it is refused with 403 and nothing runs', async () => {
    ran.length = 0
    expect((await call('echo', [], { Origin: 'http://evil.example' })).status).toBe(403)
    expect((await call('echo', [], { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    expect(ran).toEqual([])
    expect((await call('echo', [], { Origin: `http://127.0.0.1:${port}` })).status).toBe(200)
  })

  it('[PI-009] Given an API request that is not JSON, When it arrives, Then it is refused with 415', async () => {
    const answer = await request({ method: 'POST', path: '/api/invoke/echo', headers: { 'Content-Type': 'text/plain', 'X-Astrorepo-Token': TOKEN }, body: '{"args":[]}' })
    expect(answer.status).toBe(415)
  })

  it('[PI-011] Given a body too large, malformed or without arguments, When it is posted, Then it is refused with 413 or 400 and nothing runs', async () => {
    ran.length = 0
    expect((await call('echo', ['x'.repeat(4096)])).status).toBe(413)
    const post = (body: string) => request({ method: 'POST', path: '/api/invoke/echo', headers: { 'Content-Type': 'application/json', 'X-Astrorepo-Token': TOKEN }, body })
    expect((await post('{not json')).status).toBe(400)
    expect((await post('{"args":"one"}')).status).toBe(400)
    expect((await post('null')).status).toBe(400)
    expect(ran).toEqual([])
  })

  it('[PI-011] Given an unknown channel or API address, When it is posted, Then it is refused with 404, and a GET of the API with 405', async () => {
    expect((await call('missing:channel', [])).json()).toEqual({ error: 'No handler for the channel "missing:channel".' })
    expect((await call('missing:channel', [])).status).toBe(404)
    expect((await request({ method: 'POST', path: '/api/other', headers: { 'X-Astrorepo-Token': TOKEN } })).status).toBe(404)
    expect((await request({ path: '/api/invoke/echo' })).status).toBe(405)
    expect((await request({ method: 'POST', path: '/api/invoke/%E0%A4%A', headers: { 'Content-Type': 'application/json', 'X-Astrorepo-Token': TOKEN }, body: '{"args":[]}' })).status).toBe(400)
  })

  it('[PI-015] Given a path outside the built renderer or a missing file, When it is read, Then it is not found and nothing outside is read', async () => {
    for (const p of ['/../http-host-secret.txt', '/%2e%2e/http-host-secret.txt', '/assets/../../http-host-secret.txt', '/missing.js', '/assets']) {
      const answer = await request({ path: p })
      expect(answer.status, p).toBe(404)
      expect(answer.body).not.toContain('secret')
    }
    expect((await request({ path: '/a%00b' })).status).toBe(400)
    expect((await request({ method: 'DELETE', path: '/' })).status).toBe(405)
  })
})

describe('The headless HTTP host under hostile requests (specs/035-pi-variant)', () => {
  it('[PI-016] Given a request line the URL parser rejects, When it arrives, Then the server answers 400 and keeps serving', async () => {
    const answer = await raw('GET http://a:99999/ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
    expect(answer).toMatch(/^HTTP\/1\.1 400/)
    expect((await request({ path: '/' })).status).toBe(200)
  })

  it('[PI-011] Given a chunked body that keeps streaming past the limit, When it crosses the limit, Then 413 comes back without waiting for the end', async () => {
    const head = `POST /api/invoke/echo HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nX-Astrorepo-Token: ${TOKEN}\r\nTransfer-Encoding: chunked\r\n\r\n`
    const chunk = 'x'.repeat(3000)
    const answer = await raw(`${head}${chunk.length.toString(16)}\r\n${chunk}\r\n`, true)
    expect(answer).toMatch(/^HTTP\/1\.1 413/)
  })

  it('[PI-015] Given a link inside the built renderer to a file outside it, When it is read, Then it is not found', async () => {
    if (!linked) return
    const answer = await request({ path: '/leak.txt' })
    expect(answer.status).toBe(404)
    expect(answer.body).not.toContain('secret')
  })

  it('[PI-012] Given a handler that asks the browser to open a web page, When posted, Then the address comes back for the browser; any other address is an error', async () => {
    expect((await call('link', ['https://en.wikipedia.org/wiki/M31'])).json()).toEqual({ openInBrowser: 'https://en.wikipedia.org/wiki/M31' })
    const notWeb = await call('link', ['file:///etc/passwd'])
    expect(notWeb.status).toBe(500)
    expect(notWeb.json().openInBrowser).toBeUndefined()
  })
})

describe('The names the host answers to (specs/035-pi-variant)', () => {
  it('[PI-008] Given Host headers with ports, IPv6 brackets and capitals, When read, Then the bare lower-case name comes back', () => {
    expect(hostName('AstroPi.local:8090')).toBe('astropi.local')
    expect(hostName('[::1]:8090')).toBe('::1')
    expect(hostName('127.0.0.1')).toBe('127.0.0.1')
    expect(hostName(undefined)).toBeNull()
    expect(hostName('a:b:c')).toBeNull()
  })

  it('[PI-008] Given the machine name, its addresses and extra names, When listed, Then each appears once with localhost, lower case', () => {
    expect(hostsFor('AstroPi', ['192.168.1.20', '127.0.0.1', 'fe80::1'], ['Observatory ', ''])).toEqual(
      ['localhost', '127.0.0.1', '::1', 'astropi', 'astropi.local', '192.168.1.20', 'fe80::1', 'observatory'])
  })
})
