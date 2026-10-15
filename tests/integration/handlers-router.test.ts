import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { ZodError } from 'zod'
import { seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'
import type { Desktop, FileKind } from '../../src/main/transport/desktop'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  resetDatabase: () => ({ cleared: true })
}))

const { ChannelRouter } = await import('../../src/main/transport/router')
const { registerHandlers } = await import('../../src/main/ipc/handlers')
const { schemas } = await import('../../src/main/ipc/schemas')
const { registerCompanionHandlers } = await import('../../src/main/ipc/companion-handlers')
const { makeCompanion } = await import('@astro/application')
const { FakeCompanionSecrets, FixedClock, InMemoryCompanionStore } = await import('@astro/testkit')

/** A Desktop that records what was asked of it and answers as told. */
function fakeDesktop(answers: { folder?: string | null; file?: string | null; saved?: boolean; openError?: string } = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  const desktop: Desktop = {
    pickFolder: async (title: string) => { calls.push({ method: 'pickFolder', args: [title] }); return answers.folder ?? null },
    pickFile: async (title: string, kinds: FileKind[]) => { calls.push({ method: 'pickFile', args: [title, kinds] }); return answers.file ?? null },
    saveText: async (name: string, text: string, kinds: FileKind[]) => {
      calls.push({ method: 'saveText', args: [name, text, kinds] })
      return answers.saved ? { saved: true, path: `/exports/${name}` } : { saved: false }
    },
    openFolder: async (folder: string) => { calls.push({ method: 'openFolder', args: [folder] }); return answers.openError ?? '' },
    openExternal: async (url: string) => { calls.push({ method: 'openExternal', args: [url] }) }
  }
  return { desktop, calls }
}

function routerWith(desktop: Desktop) {
  const router = new ChannelRouter()
  registerHandlers(router, desktop)
  return router
}

describe('The handlers on the channel router (specs/035-pi-variant)', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  it('[PI-001] Given the handlers and the companion handlers, When they are put on a router, Then every channel with a schema is on it, with no Electron loaded', () => {
    const router = routerWith(fakeDesktop().desktop)
    expect(router.channels().filter(c => c.startsWith('companion:'))).toEqual([])
    const companion = makeCompanion({ devices: new InMemoryCompanionStore(), secrets: new FakeCompanionSecrets(), clock: new FixedClock(), places: { home: '/dashboard', sky: '/sky-planner', jobs: '/jobs', images: '/images', messier: '/messier' } })
    const host = { status: () => ({ enabled: false, running: false, port: 8090, addresses: [], problem: null }), setEnabled: async () => host.status(), resume: async () => host.status(), stop: async () => undefined }
    registerCompanionHandlers(router, { host, companion: () => companion })
    const missing = Object.keys(schemas).filter(channel => !router.has(channel))
    expect(missing).toEqual([])
    expect(router.channels().length).toBeGreaterThan(100)
  })

  it('[PI-001] Given a seeded target, When targets:search is invoked through the router, Then the target comes back', async () => {
    seedTarget(sqlite, { canonicalName: 'Andromeda Galaxy' })
    const router = routerWith(fakeDesktop().desktop)
    const found = await router.invoke('targets:search', { query: 'Andromeda' }) as { targets: { canonicalName: string }[] }
    expect(found.targets.map(t => t.canonicalName)).toContain('Andromeda Galaxy')
  })

  it('[PI-006] Given arguments its schema refuses, When a channel is invoked, Then it is rejected with a validation error before the handler runs', async () => {
    const { desktop, calls } = fakeDesktop()
    const router = routerWith(desktop)
    await expect(router.invoke('targets:search', {})).rejects.toBeInstanceOf(ZodError)
    await expect(router.invoke('home:open-folder', { folder_path: '' })).rejects.toBeInstanceOf(ZodError)
    expect(calls).toEqual([])
  })

  it('[PI-004] Given the folder pickers, When the user picks or cancels, Then the answer comes from the Desktop port', async () => {
    const picked = fakeDesktop({ folder: '/data/fits' })
    const router = routerWith(picked.desktop)
    await expect(router.invoke('fits:pick-folder')).resolves.toEqual({ path: '/data/fits' })
    await expect(router.invoke('settings:pick-folder')).resolves.toEqual({ path: '/data/fits' })
    expect(picked.calls.map(c => c.args[0])).toEqual(['Select FITS Folder', 'Select Folder'])
    await expect(routerWith(fakeDesktop().desktop).invoke('fits:pick-folder')).resolves.toEqual({ path: null })
  })

  it('[PI-004] Given the NINA import, When a file is picked, Then the Desktop port offers NINA sequences and all files', async () => {
    const { desktop, calls } = fakeDesktop({ file: '/seq/m31.json' })
    await expect(routerWith(desktop).invoke('import:pick-file')).resolves.toEqual({ path: '/seq/m31.json' })
    expect(calls[0].args).toEqual(['Select NINA Sequence File', [{ name: 'NINA Sequence', extensions: ['xml', 'json'] }, { name: 'All Files', extensions: ['*'] }]])
  })

  it('[PI-004] Given a CSV export, When the user saves it, Then the Desktop port gets the file name, the CSV text and the CSV kind', async () => {
    seedTarget(sqlite, { canonicalName: 'Orion Nebula' })
    const { desktop, calls } = fakeDesktop({ saved: true })
    await expect(routerWith(desktop).invoke('export:targets-csv')).resolves.toEqual({ saved: true, path: '/exports/targets.csv' })
    const [name, text, kinds] = calls[0].args as [string, string, FileKind[]]
    expect(name).toBe('targets.csv')
    expect(text).toContain('Orion Nebula')
    expect(kinds).toEqual([{ name: 'CSV', extensions: ['csv'] }])
  })

  it('[PI-004] Given a CSV export, When the user cancels the save, Then nothing is saved', async () => {
    const { desktop } = fakeDesktop({ saved: false })
    await expect(routerWith(desktop).invoke('export:sessions-csv')).resolves.toEqual({ saved: false })
  })

  it('[PI-004] Given a folder to open, When it opens or fails, Then the Desktop port opens it and an error comes back as the reason', async () => {
    const ok = fakeDesktop()
    await expect(routerWith(ok.desktop).invoke('home:open-folder', { folder_path: '/data/M31' })).resolves.toEqual({ success: true, error: undefined })
    expect(ok.calls).toEqual([{ method: 'openFolder', args: ['/data/M31'] }])
    const failed = fakeDesktop({ openError: 'Folder not found' })
    await expect(routerWith(failed.desktop).invoke('home:open-folder', { folder_path: '/gone' })).resolves.toEqual({ success: false, error: 'Folder not found' })
  })
})
