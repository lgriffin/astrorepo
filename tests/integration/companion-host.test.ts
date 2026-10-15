import fs from 'fs'
import http from 'http'
import net from 'net'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { makeCompanion, type Companion } from '@astro/application'
import { FakeCompanionSecrets, FixedClock, InMemoryCompanionStore } from '@astro/testkit'
import { createHttpHost } from '../../src/main/http/http-host'
import { DEFAULT_COMPANION_PORT, makeCompanionHost, osNetwork, type CompanionHost } from '../../src/main/http/companion-host'
import { registerCompanionHandlers } from '../../src/main/ipc/companion-handlers'
import { ChannelRouter } from '../../src/main/transport/router'

const PLACES = { home: '/dashboard', sky: '/sky-planner', jobs: '/jobs', images: '/images', messier: '/messier' }
const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-host-'))
fs.writeFileSync(path.join(staticDir, 'index.html'), '<html><head><title>astrorepo</title></head><body></body></html>')

function companionWith(codes: string[] = []) {
  const devices = new InMemoryCompanionStore()
  const clock = new FixedClock(new Date('2026-10-15T21:00:00Z'))
  return { devices, clock, companion: makeCompanion({ devices, secrets: new FakeCompanionSecrets(codes), clock, places: PLACES }) }
}

const ran: string[] = []
const router = new ChannelRouter()
router.handle('echo', (...args: unknown[]) => { ran.push('echo'); return { args } })
router.handle('companion:approve', () => { ran.push('companion:approve'); return null })
router.handle('settings:set', () => { ran.push('settings:set'); return null })
router.handle('db:reset', () => { ran.push('db:reset'); return null })

const world = companionWith(['482913', '777777', '555555'])
const server = createHttpHost({ router, staticDir, companions: world.companion, allowedHosts: ['127.0.0.1', 'studio-pc.local'] })
let port = 0

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  port = (server.address() as AddressInfo).port
})
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  fs.rmSync(staticDir, { recursive: true, force: true })
})

interface Answer { status: number; json: () => { value?: unknown; error?: string; pair?: boolean }; body: string }

function post(urlPath: string, body: unknown, headers: Record<string, string> = {}): Promise<Answer> {
  return send({ method: 'POST', path: urlPath, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
}

function send(options: { method: string; path: string; headers?: Record<string, string>; body?: string }): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: options.method, path: options.path, headers: options.headers }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        resolve({ status: res.statusCode ?? 0, body: text, json: () => JSON.parse(text) })
      })
    })
    req.on('error', reject)
    req.end(options.body)
  })
}

/** Pairs a screen the way the companion page does, typing the code as a person would on the PC. */
async function pairScreen(name: string): Promise<string> {
  const started = (await post('/api/companion/pair', { name })).json().value as { requestId: string; code: string }
  await world.companion.approvePairing(started.code)
  const status = (await post('/api/companion/pair-status', { requestId: started.requestId })).json().value as { state: string; key: string }
  expect(status.state).toBe('paired')
  return status.key
}

describe('The companion host (specs/035-pi-variant, companion slice)', () => {
  afterEach(() => { ran.length = 0 })

  it('[PI-018] Given the companion host, When a screen opens the page, Then it is told to pair and carries no token', async () => {
    const page = await send({ method: 'GET', path: '/' })
    expect(page.body).toContain('<meta name="astrorepo-companion" content="pair">')
    expect(page.body).not.toContain('astrorepo-token')
  })

  it('[PI-018] Given a screen with a name, When it asks to pair, Then it gets a six-digit code and waits until the code is typed on the PC, then gets its key', async () => {
    const started = await post('/api/companion/pair', { name: 'Pi by the scope' })
    expect(started.status).toBe(200)
    const { requestId, code } = started.json().value as { requestId: string; code: string }
    expect(code).toMatch(/^\d{6}$/)
    expect((await post('/api/companion/pair-status', { requestId })).json().value).toMatchObject({ state: 'waiting' })
    await world.companion.approvePairing(code)
    const paired = (await post('/api/companion/pair-status', { requestId })).json().value as { state: string; key: string; name: string }
    expect(paired).toMatchObject({ state: 'paired', name: 'Pi by the scope' })
    expect((await post('/api/companion/pair-status', { requestId })).json().value).toMatchObject({ state: 'paired', key: paired.key })
    const echoed = await post('/api/invoke/echo', { args: [1] }, { 'X-Astrorepo-Device': paired.key })
    expect(echoed.json()).toEqual({ value: { args: [1] } })
  })

  it('[PI-019] Given a screen that asks for a code again, When it asks, Then its earlier code stops working', async () => {
    const first = (await post('/api/companion/pair', { name: 'Porch' })).json().value as { code: string }
    const second = (await post('/api/companion/pair', { name: 'Porch' })).json().value as { code: string }
    await expect(world.companion.approvePairing(first.code)).rejects.toThrow('No screen is showing that code.')
    await expect(world.companion.approvePairing(second.code)).resolves.toMatchObject({ name: 'Porch' })
  })

  it('[PI-019] Given a pairing request without a usable name or request id, When it arrives, Then it is refused with what to do', async () => {
    expect((await post('/api/companion/pair', {})).json()).toEqual({ error: 'Say what the screen is called.' })
    expect((await post('/api/companion/pair', { name: '  ' })).json()).toEqual({ error: 'Give the screen a name, such as "Pi by the scope".' })
    expect((await post('/api/companion/pair-status', { requestId: 7 })).status).toBe(400)
  })

  it('[PI-020] Given an API call with no key, an unknown key or a removed screen\'s key, When it arrives, Then it is refused with 401 and the screen is told to pair again', async () => {
    const none = await post('/api/invoke/echo', { args: [] })
    expect(none.status).toBe(401)
    expect(none.json()).toMatchObject({ pair: true })
    expect((await post('/api/invoke/echo', { args: [] }, { 'X-Astrorepo-Device': 'guess' })).status).toBe(401)
    const key = await pairScreen('Tablet')
    const [tablet] = (await world.companion.listCompanions()).filter(d => d.name === 'Tablet')
    await world.companion.removeCompanion(tablet.id)
    expect((await post('/api/invoke/echo', { args: [] }, { 'X-Astrorepo-Device': key })).status).toBe(401)
    expect((await post('/api/companion/screen', {}, { 'X-Astrorepo-Device': key })).status).toBe(401)
    expect(ran).toEqual([])
  })

  it('[PI-022] Given a paired screen, When it calls a companion channel, a companion setting or a library wipe, Then it is refused with 403 and nothing runs', async () => {
    const key = await pairScreen('Kitchen')
    const headers = { 'X-Astrorepo-Device': key }
    expect((await post('/api/invoke/companion%3Aapprove', { args: [{ code: '123456' }] }, headers)).status).toBe(403)
    expect((await post('/api/invoke/settings%3Aset', { args: [{ key: 'companion_enabled', value: 'false' }] }, headers)).status).toBe(403)
    expect((await post('/api/invoke/db%3Areset', { args: [] }, headers)).status).toBe(403)
    expect(ran).toEqual([])
    expect((await post('/api/invoke/settings%3Aset', { args: [{ key: 'home_folder', value: '/x' }] }, headers)).status).toBe(200)
    expect(ran).toEqual(['settings:set'])
  })

  it('[PI-021] Given a paired screen, When it asks where to be, Then it follows the PC unless set to a place', async () => {
    const key = await pairScreen('Hall')
    const headers = { 'X-Astrorepo-Device': key }
    world.companion.reportPcRoute('/targets/m31')
    expect((await post('/api/companion/screen', {}, headers)).json()).toEqual({ value: { screen: 'follow', route: '/targets/m31' } })
    const [hall] = (await world.companion.listCompanions()).filter(d => d.name === 'Hall')
    await world.companion.setScreen(hall.id, 'jobs')
    expect((await post('/api/companion/screen', {}, headers)).json()).toEqual({ value: { screen: 'jobs', route: '/jobs' } })
  })

  it('[PI-008] [PI-009] Given the companion host, When a request names a foreign host, comes from another site or is not a POST, Then it is refused before pairing', async () => {
    expect((await post('/api/companion/pair', { name: 'x' }, { Host: 'evil.example' })).status).toBe(403)
    expect((await post('/api/companion/pair', { name: 'x' }, { Origin: 'http://evil.example' })).status).toBe(403)
    expect((await send({ method: 'GET', path: '/api/companion/pair' })).status).toBe(405)
    expect((await send({ method: 'POST', path: '/api/companion/pair', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415)
  })

  it('[PI-017] Given the headless server with a token, When a screen asks to pair, Then there is no such address', async () => {
    const tokenHost = createHttpHost({ router, staticDir, token: 't'.repeat(48), allowedHosts: ['127.0.0.1'] })
    await new Promise<void>(resolve => tokenHost.listen(0, '127.0.0.1', () => resolve()))
    const tokenPort = (tokenHost.address() as AddressInfo).port
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: tokenPort, method: 'POST', path: '/api/companion/pair', headers: { 'Content-Type': 'application/json', 'X-Astrorepo-Token': 't'.repeat(48) } }, res => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end('{"name":"x"}')
    })
    await new Promise<void>(resolve => tokenHost.close(() => resolve()))
    expect(status).toBe(404)
    expect(() => createHttpHost({ router, staticDir, allowedHosts: [] })).toThrow('A host needs either a token or companions, not both.')
    expect(() => createHttpHost({ router, staticDir, token: 'x', companions: world.companion, allowedHosts: [] })).toThrow('A host needs either a token or companions, not both.')
  })
})

describe('Serving companions from the desktop app (specs/035-pi-variant, PI-017)', () => {
  const hosts: CompanionHost[] = []
  afterEach(async () => {
    for (const h of hosts.splice(0)) await h.stop()
  })

  function hostWith(options: { staticDir?: string; settings?: Record<string, string>; listen?: (s: http.Server, port: number) => Promise<void>; addresses?: string[] } = {}) {
    const settings = new Map(Object.entries(options.settings ?? {}))
    const ports: number[] = []
    const servers: http.Server[] = []
    const addresses = options.addresses ?? ['127.0.0.1', '192.168.1.20']
    const listen = options.listen ?? ((s: http.Server, p: number) => {
      ports.push(p)
      return new Promise<void>(resolve => s.listen(0, '127.0.0.1', () => resolve()))
    })
    const host = makeCompanionHost({
      router,
      staticDir: options.staticDir ?? staticDir,
      companion: () => companionWith().companion as Companion,
      settings: { get: k => settings.get(k) ?? null, set: (k, v) => { settings.set(k, v) } },
      network: () => ({ hostname: 'studio-pc', addresses: addresses, shown: addresses.filter(a => a !== '127.0.0.1') }),
      listen: (s: http.Server, p: number) => { servers.push(s); return listen(s, p) }
    })
    hosts.push(host)
    return { host, settings, ports, addresses, servers }
  }

  it('[PI-017] Given companion screens are off, When the app starts, Then nothing is served', async () => {
    const { host, ports } = hostWith()
    expect(await host.resume()).toEqual({ enabled: false, running: false, port: DEFAULT_COMPANION_PORT, addresses: [], problem: null })
    expect(ports).toEqual([])
  })

  it('[PI-017] Given companion screens are turned on, When the host starts, Then it serves on port 8090 and lists the addresses to open, and turning off stops it', async () => {
    const { host, settings, ports } = hostWith()
    expect(await host.setEnabled(true)).toEqual({
      enabled: true,
      running: true,
      port: 8090,
      addresses: ['http://studio-pc.local:8090/', 'http://192.168.1.20:8090/'],
      problem: null
    })
    expect(ports).toEqual([8090])
    expect(settings.get('companion_enabled')).toBe('true')
    expect(await host.setEnabled(false)).toMatchObject({ enabled: false, running: false, addresses: [] })
    expect(settings.get('companion_enabled')).toBe('false')
  })

  it('[PI-017] Given companion screens were left on with another port, When the app starts again, Then it serves on that port', async () => {
    const { host, ports } = hostWith({ settings: { companion_enabled: 'true', companion_port: '9100' } })
    expect(await host.resume()).toMatchObject({ running: true, port: 9100 })
    expect(await host.resume()).toMatchObject({ running: true })
    expect(ports).toEqual([9100])
  })

  it('[PI-017] Given a port chosen in Settings, When it is not from 1024 to 65535, Then it is refused and the saved port is kept', async () => {
    const { host, settings } = hostWith({ settings: { companion_port: '9100' } })
    await expect(host.setEnabled(true, 80)).rejects.toThrow('The companion port is a whole number from 1024 to 65535.')
    expect(settings.get('companion_port')).toBe('9100')
    expect(await host.setEnabled(true, 9200)).toMatchObject({ port: 9200 })
    const odd = hostWith({ settings: { companion_port: 'eighty' } })
    expect(odd.host.status().port).toBe(8090)
  })

  it('[PI-017] Given the port is in use or the pages are not built, When companion screens are turned on, Then the host says why it is not serving', async () => {
    const busy = net.createServer()
    await new Promise<void>(resolve => busy.listen(0, '127.0.0.1', () => resolve()))
    const taken = (busy.address() as AddressInfo).port
    const { host } = hostWith({ listen: (s, p) => new Promise((resolve, reject) => { s.once('error', reject); s.listen(p, '127.0.0.1', () => resolve()) }) })
    expect(await host.setEnabled(true, taken)).toMatchObject({ running: false, problem: `Port ${taken} is already in use on this PC. Choose another port.` })
    await new Promise<void>(resolve => busy.close(() => resolve()))
    const failing = hostWith({ listen: () => Promise.reject(new Error('no network')) })
    expect(await failing.host.setEnabled(true)).toMatchObject({ running: false, problem: 'Companions cannot be served: no network' })
    const unbuilt = hostWith({ staticDir: path.join(staticDir, 'missing') })
    expect(await unbuilt.host.setEnabled(true)).toMatchObject({ running: false, problem: 'The pages companions are served are not built. Build astrorepo (npm run build) and turn this on again.' })
  })

  it('[PI-017] Given the PC gains an address while serving, When a screen opens that address, Then it is answered without a restart', async () => {
    const { host, addresses, servers } = hostWith()
    await host.setEnabled(true)
    const served = (servers[0].address() as AddressInfo).port
    const get = (hostHeader: string) => new Promise<number>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: served, path: '/', headers: { Host: hostHeader } }, res => { res.resume(); resolve(res.statusCode ?? 0) })
      req.on('error', reject)
      req.end()
    })
    expect(await get('192.168.1.77')).toBe(403)
    addresses.push('192.168.1.77')
    expect(host.status().addresses).toContain('http://192.168.1.77:8090/')
    expect(await get('192.168.1.77')).toBe(200)
  })

  it('[PI-017] Given companion screens are turned on and straight off again, When both changes finish, Then nothing is left listening', async () => {
    const { host, settings, servers } = hostWith()
    const on = host.setEnabled(true)
    const off = host.setEnabled(false)
    await Promise.all([on, off])
    expect(host.status()).toMatchObject({ enabled: false, running: false })
    expect(settings.get('companion_enabled')).toBe('false')
    expect(servers.every(s => !s.listening)).toBe(true)
  })

  it('[PI-017] Given this PC, When its network is read, Then its host name, every address and only its outward IPv4 addresses for showing come back', () => {
    const view = osNetwork()
    expect(view.hostname).toBe(os.hostname())
    expect(view.addresses).toContain('127.0.0.1')
    expect(view.shown).not.toContain('127.0.0.1')
    expect(view.shown.every(a => /^\d+\.\d+\.\d+\.\d+$/.test(a))).toBe(true)
  })

  it('[PI-023] Given the companion channels on the desktop router, When Settings uses them, Then pairing, listing, choosing a screen and removing work and refusals come back as messages', async () => {
    const { companion } = companionWith(['482913'])
    const { host } = hostWith()
    const desk = new ChannelRouter()
    registerCompanionHandlers(desk, { host, companion: () => companion })
    expect(await desk.invoke('companion:status')).toMatchObject({ enabled: false, running: false })
    expect(await desk.invoke('companion:set-enabled', { enabled: true })).toMatchObject({ running: true })
    expect(await desk.invoke('companion:approve', { code: '000000' })).toEqual({ ok: false, error: 'No screen is showing that code. Check it, or have the screen show a new one.' })
    await companion.requestPairing('Pi')
    const approved = (await desk.invoke('companion:approve', { code: '482 913' })) as { ok: true; value: { id: string } }
    expect(approved).toMatchObject({ ok: true, value: { name: 'Pi', screen: 'follow' } })
    expect(await desk.invoke('companion:set-screen', { id: approved.value.id, screen: 'messier' })).toEqual({ ok: true, value: undefined })
    expect(await desk.invoke('companion:list')).toMatchObject([{ name: 'Pi', screen: 'messier' }])
    expect(await desk.invoke('companion:report-route', { route: '/jobs' })).toBeNull()
    expect(await desk.invoke('companion:remove', { id: approved.value.id })).toEqual({ ok: true, value: undefined })
    expect(await desk.invoke('companion:remove', { id: approved.value.id })).toEqual({ ok: false, error: 'That screen is no longer paired.' })
    await expect(desk.invoke('companion:set-screen', { id: 'x', screen: 'settings' })).rejects.toThrow()
  })
})
