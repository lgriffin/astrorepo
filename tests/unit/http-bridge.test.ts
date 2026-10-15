import { describe, expect, it } from 'vitest'
import { httpBridge, installBridge, type Bridge } from '../../src/renderer/bridge'

type Sent = { url: string; init: { method: string; headers: Record<string, string>; body: string } }

function fakeFetch(status: number, body: unknown | Error) {
  const sent: Sent[] = []
  const fetchFn = async (url: string, init: Sent['init']) => {
    sent.push({ url, init })
    return { ok: status >= 200 && status < 300, status, json: async () => { if (body instanceof Error) throw body; return body } }
  }
  return { fetchFn, sent }
}

const never = () => { throw new Error('asked') }

describe('The browser bridge (specs/035-pi-variant)', () => {
  it('[PI-010] Given a call, When it is made, Then it posts the arguments with the token and resolves with the value', async () => {
    const { fetchFn, sent } = fakeFetch(200, { value: { total: 1 } })
    await expect(httpBridge(fetchFn, 'tok', never).invoke('targets:search', { query: 'M31' })).resolves.toEqual({ total: 1 })
    expect(sent[0].url).toBe('/api/invoke/targets%3Asearch')
    expect(sent[0].init.method).toBe('POST')
    expect(sent[0].init.headers).toEqual({ 'Content-Type': 'application/json', 'X-Astrorepo-Token': 'tok' })
    expect(JSON.parse(sent[0].init.body)).toEqual({ args: [{ query: 'M31' }] })
  })

  it('[PI-010] Given trailing undefined arguments, When the call is made, Then they are left off rather than sent as null', async () => {
    const { fetchFn, sent } = fakeFetch(200, { value: 0 })
    await expect(httpBridge(fetchFn, 'tok', never).invoke('jobs:list', 'a', undefined, undefined)).resolves.toBe(0)
    expect(JSON.parse(sent[0].init.body)).toEqual({ args: ['a'] })
  })

  it('[PI-010] Given an error answer, When the call is made, Then it rejects with the server\'s message', async () => {
    const { fetchFn } = fakeFetch(500, { error: 'The disk is full.' })
    await expect(httpBridge(fetchFn, 'tok', never).invoke('x')).rejects.toThrow('The disk is full.')
  })

  it('[PI-010] Given an error answer that is not JSON, When the call is made, Then it rejects with the HTTP status', async () => {
    const { fetchFn } = fakeFetch(502, new Error('bad json'))
    await expect(httpBridge(fetchFn, 'tok', never).invoke('x')).rejects.toThrow('astrorepo did not answer (HTTP 502).')
  })

  it('[PI-012] Given a folder or file picker, When it is called, Then the browser asks for a typed path and nothing is posted', async () => {
    const { fetchFn, sent } = fakeFetch(200, {})
    const questions: string[] = []
    const answers = ['  /mnt/nas/astro  ', '', null]
    const bridge = httpBridge(fetchFn, 'tok', q => { questions.push(q); return answers.shift() ?? null })
    await expect(bridge.invoke('settings:pick-folder')).resolves.toEqual({ path: '/mnt/nas/astro' })
    await expect(bridge.invoke('import:pick-file')).resolves.toEqual({ path: null })
    await expect(bridge.invoke('fits:pick-folder')).resolves.toEqual({ path: null })
    expect(questions[0]).toBe('Type the full path of the folder on the computer astrorepo runs on.')
    expect(questions[1]).toContain('the file')
    expect(sent).toEqual([])
  })

  it('[PI-010] Given Electron\'s bridge, When the bridge is installed, Then it is kept; without it, the page token is used', async () => {
    const electron: Bridge = { invoke: async () => 'electron' }
    const desktopWin = { api: electron } as unknown as Window & { api?: Bridge }
    installBridge(desktopWin, {} as Document)
    expect(desktopWin.api).toBe(electron)

    const sent: Sent[] = []
    const browserWin = {
      fetch: async (url: string, init: Sent['init']) => { sent.push({ url, init }); return { ok: true, status: 200, json: async () => ({ value: 'served' }) } },
      prompt: () => null
    } as unknown as Window & { api?: Bridge }
    const doc = { querySelector: (sel: string) => (sel === 'meta[name="astrorepo-token"]' ? { getAttribute: () => 'page-token' } : null) } as unknown as Document
    installBridge(browserWin, doc)
    await expect(browserWin.api!.invoke('dashboard:stats')).resolves.toBe('served')
    expect(sent[0].init.headers['X-Astrorepo-Token']).toBe('page-token')
  })
})
