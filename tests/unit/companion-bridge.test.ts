import { describe, expect, it } from 'vitest'
import { COMPANION_KEY, companionBridge, installBridge, storedCompanionKey, type BridgeWindow } from '../../src/renderer/bridge'
import { askScreen, checkPairing, NotPairedError, shouldMove, startPairing, TOUCH_HOLD_MS } from '../../src/renderer/companion'

type Sent = { url: string; init: { method: string; headers: Record<string, string>; body: string } }

function fakeFetch(status: number, body: unknown) {
  const sent: Sent[] = []
  const fetchFn = async (url: string, init: Sent['init']) => {
    sent.push({ url, init })
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }
  return { fetchFn, sent }
}

const never = { ask: () => null, tell: () => undefined, open: () => undefined }

function storage(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial))
  return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v) }, removeItem: (k: string) => { kept.delete(k) }, kept }
}

describe('A companion screen in the browser (specs/035-pi-variant)', () => {
  it('[PI-020] Given a paired screen, When it calls a channel, Then the call carries its key instead of a token', async () => {
    const { fetchFn, sent } = fakeFetch(200, { value: 3 })
    await expect(companionBridge(fetchFn, 'key-1', never, () => undefined).invoke('jobs:list')).resolves.toBe(3)
    expect(sent[0].init.headers).toEqual({ 'Content-Type': 'application/json', 'X-Astrorepo-Device': 'key-1' })
  })

  it('[PI-020] Given the PC no longer knows the key, When a call is refused, Then the screen is sent back to pairing, and other refusals are not', async () => {
    let unpaired = 0
    const gone = fakeFetch(401, { error: 'This screen is not paired with the PC.', pair: true })
    await expect(companionBridge(gone.fetchFn, 'old', never, () => { unpaired++ }).invoke('jobs:list')).rejects.toThrow('This screen is not paired with the PC.')
    const refused = fakeFetch(403, { error: 'Companion screens cannot pair, remove or change companions. Do that on the PC.' })
    await expect(companionBridge(refused.fetchFn, 'k', never, () => { unpaired++ }).invoke('companion:list')).rejects.toThrow('Do that on the PC.')
    expect(unpaired).toBe(1)
  })

  it('[PI-020] Given the page the companion host served, When the bridge is installed, Then it uses the stored key, and forgets it and reloads when the PC refuses it', async () => {
    const kept = storage({ [COMPANION_KEY]: 'stored-key' })
    const sent: Sent[] = []
    let reloaded = 0
    const win = {
      fetch: async (url: string, init: Sent['init']) => { sent.push({ url, init }); return { ok: false, status: 401, json: async () => ({ error: 'not paired', pair: true }) } },
      localStorage: kept,
      location: { reload: () => { reloaded++ } },
      prompt: () => null,
      alert: () => undefined,
      open: () => null
    } as unknown as BridgeWindow
    const doc = { querySelector: (sel: string) => (sel === 'meta[name="astrorepo-companion"]' ? {} : null) } as unknown as Document
    installBridge(win, doc)
    expect(win.astrorepoMode).toBe('companion')
    await expect(win.api!.invoke('jobs:list')).rejects.toThrow('not paired')
    expect(sent[0].init.headers['X-Astrorepo-Device']).toBe('stored-key')
    expect(kept.kept.has(COMPANION_KEY)).toBe(false)
    expect(reloaded).toBe(1)
  })

  it('[PI-010] Given the desktop app or the headless server, When the bridge is installed, Then the page knows which it is in', () => {
    const desktop = { api: { invoke: async () => null } } as unknown as BridgeWindow
    installBridge(desktop, {} as Document)
    expect(desktop.astrorepoMode).toBe('desktop')
    const browser = { fetch: async () => ({}) } as unknown as BridgeWindow
    installBridge(browser, { querySelector: () => null } as unknown as Document)
    expect(browser.astrorepoMode).toBe('browser')
  })

  it('[PI-020] Given storage the browser blocks, When the key is read, Then the screen counts as not paired', () => {
    expect(storedCompanionKey({ localStorage: storage({ [COMPANION_KEY]: 'k' }) } as unknown as Window)).toBe('k')
    expect(storedCompanionKey({ localStorage: storage() } as unknown as Window)).toBe('')
    const blocked = { get localStorage(): Storage { throw new Error('blocked') } } as unknown as Window
    expect(storedCompanionKey(blocked)).toBe('')
  })

  it('[PI-018] Given the pairing page, When it asks for a code and then whether it was typed, Then it posts the name and the request id', async () => {
    const started = fakeFetch(200, { value: { requestId: 'r1', code: '482913', expiresAt: '2026-10-15T21:05:00.000Z' } })
    await expect(startPairing(started.fetchFn, 'Pi')).resolves.toMatchObject({ code: '482913' })
    expect(started.sent[0].url).toBe('/api/companion/pair')
    expect(JSON.parse(started.sent[0].init.body)).toEqual({ name: 'Pi' })
    const checked = fakeFetch(200, { value: { state: 'waiting', expiresAt: '2026-10-15T21:05:00.000Z' } })
    await expect(checkPairing(checked.fetchFn, 'r1')).resolves.toEqual({ state: 'waiting', expiresAt: '2026-10-15T21:05:00.000Z' })
    expect(JSON.parse(checked.sent[0].init.body)).toEqual({ requestId: 'r1' })
    const refused = fakeFetch(400, { error: 'Too many screens are waiting to pair.' })
    await expect(startPairing(refused.fetchFn, 'Pi')).rejects.toThrow('Too many screens are waiting to pair.')
    const silent = fakeFetch(502, null)
    await expect(startPairing(silent.fetchFn, 'Pi')).rejects.toThrow('The PC did not answer (HTTP 502).')
  })

  it('[PI-021] Given a paired screen, When it asks where to be, Then it sends its key, and a key the PC dropped says so', async () => {
    const asked = fakeFetch(200, { value: { screen: 'follow', route: '/jobs' } })
    await expect(askScreen(asked.fetchFn, 'k')).resolves.toEqual({ screen: 'follow', route: '/jobs' })
    expect(asked.sent[0].init.headers['X-Astrorepo-Device']).toBe('k')
    await expect(askScreen(fakeFetch(401, { error: 'gone', pair: true }).fetchFn, 'k')).rejects.toBeInstanceOf(NotPairedError)
    await expect(askScreen(fakeFetch(401, { error: 'gone' }).fetchFn, 'k')).rejects.not.toBeInstanceOf(NotPairedError)
  })

  it('[PI-021] Given where the screen is and where the PC wants it, When it decides, Then it moves only to another page and not within a minute of a touch', () => {
    const now = 1_000_000
    expect(shouldMove({ current: '/dashboard', wanted: '/jobs', lastTouchAt: null, now })).toBe(true)
    expect(shouldMove({ current: '/jobs', wanted: '/jobs', lastTouchAt: null, now })).toBe(false)
    expect(shouldMove({ current: '/jobs', wanted: null, lastTouchAt: null, now })).toBe(false)
    expect(shouldMove({ current: '/dashboard', wanted: '/jobs', lastTouchAt: now - TOUCH_HOLD_MS + 1, now })).toBe(false)
    expect(shouldMove({ current: '/dashboard', wanted: '/jobs', lastTouchAt: now - TOUCH_HOLD_MS, now })).toBe(true)
  })
})
