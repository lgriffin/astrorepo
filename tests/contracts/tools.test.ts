import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeToolHub, InMemoryStackCatalogue } from '@astro/testkit'
import { stackCatalogueContract, toolHubContract } from '@astro/testkit/contracts/tools.contract'
import { toolSpec, type ToolId } from '@astro/domain'
import { NodeToolHub } from '../../src/main/adapters/node-tool-hub'
import { SqliteStackCatalogue } from '../../src/main/adapters/sqlite-stack-catalogue'
import { seedFitsFile, seedFitsScan, seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

const win = (p: string) => path.win32.normalize(p)

/** A Windows hub over a pretend disk holding `files`. */
function windowsHub(files: string[], settings: Record<string, string> = {}, PATH = '') {
  const disk = new Set(files.map(f => win(f).toLowerCase()))
  return new NodeToolHub({
    platform: 'win32',
    env: { PATH },
    home: 'C:\\Users\\leigh',
    setting: key => settings[key] ?? null,
    exists: p => disk.has(win(p).toLowerCase())
  })
}

toolHubContract('fake', installed => {
  const hub = new FakeToolHub()
  const all = new FakeToolHub().installAll()
  for (const id of installed) hub.install(id, all.found.get(id) ?? '')
  return hub
})
toolHubContract('Node', installed => windowsHub(installed.map(id => toolSpec(id).standard.windows[0])))

stackCatalogueContract('in-memory', seed => {
  const c = new InMemoryStackCatalogue().addTarget(seed.targetId, seed.target)
  for (const s of seed.stacks) c.addStack(seed.targetId, { path: s.path, width: s.width, height: s.height, modifiedAt: new Date(s.modifiedAt) })
  return c
})

afterEach(() => teardownTestDb())

stackCatalogueContract('SQLite', seed => {
  const db = setupTestDb()
  seedTarget(db, { id: seed.targetId, canonicalName: seed.target.name, objectType: seed.target.objectType ?? 'unknown', raHours: seed.target.raHours, decDegrees: seed.target.decDeg })
  const scan = seedFitsScan(db)
  for (const s of seed.stacks) {
    const id = seedFitsFile(db, scan, { filePath: s.path, isStacked: true, targetId: seed.targetId })
    db.prepare('UPDATE fits_files SET naxis1 = ?, naxis2 = ?, file_modified_at = ? WHERE id = ?').run(s.width, s.height, s.modifiedAt, id)
  }
  return new SqliteStackCatalogue(db)
})

describe('NodeToolHub', () => {
  const standard = (id: ToolId) => toolSpec(id).standard.windows[0]

  it('[HUB-002] Given a path in Settings, When tools are located, Then it wins over PATH and the standard folder', async () => {
    const hub = windowsHub([standard('siril'), 'D:\\Siril\\siril-cli.exe', 'E:\\bin\\siril-cli.exe'], { tool_path_siril: 'D:\\Siril\\siril-cli.exe' }, 'E:\\bin')
    const [siril] = await hub.locate()
    expect(siril).toMatchObject({ path: win('D:\\Siril\\siril-cli.exe'), source: 'setting', settingMissing: false })
  })

  it('[HUB-002] Given a saved path that no longer exists, When tools are located, Then PATH is used and the stale setting is flagged', async () => {
    const hub = windowsHub(['E:\\bin\\siril-cli.exe'], { tool_path_siril: 'D:\\Gone\\siril-cli.exe' }, 'C:\\Windows;E:\\bin')
    const [siril] = await hub.locate()
    expect(siril).toMatchObject({ path: win('E:\\bin\\siril-cli.exe'), source: 'path', settingMissing: true })
  })

  it('[HUB-001] Given Siril_Scripts cloned in Documents, When tools are located, Then its v2 entry script is found; a setting may name the repo, v2 or the script', async () => {
    const entry = 'C:\\Users\\leigh\\Documents\\Siril_Scripts\\v2\\postprocess.bat'
    const found = (await windowsHub([entry]).locate()).find(s => s.id === 'siril-scripts')
    expect(found).toMatchObject({ path: win(entry), source: 'standard' })
    for (const setting of ['D:\\Siril_Scripts', 'D:\\Siril_Scripts\\v2', 'D:\\Siril_Scripts\\v2\\postprocess.bat']) {
      const s = (await windowsHub(['D:\\Siril_Scripts\\v2\\postprocess.bat'], { tool_path_siril_scripts: setting }).locate()).find(x => x.id === 'siril-scripts')
      expect(s).toMatchObject({ path: win('D:\\Siril_Scripts\\v2\\postprocess.bat'), source: 'setting' })
    }
  })

  it('[HUB-004] Given nothing installed, When tools are located, Then each lists every place it looked, in order', async () => {
    const statuses = await windowsHub([], {}, 'E:\\bin').locate()
    const rc = statuses.find(s => s.id === 'rc-astro')
    expect(rc?.looked).toEqual([win('E:\\bin\\rc-astro.exe'), win('C:/Program Files/RC-Astro/CLI/rc-astro.exe')])
  })

  it('[HUB-001] Given Linux, When tools are located, Then PATH is split on colons and the shell script is the entry', async () => {
    const hub = new NodeToolHub({
      platform: 'linux',
      env: { PATH: '/opt/bin:/usr/bin' },
      home: '/home/leigh',
      setting: () => null,
      exists: p => ['/usr/bin/siril-cli', '/home/leigh/Siril_Scripts/v2/postprocess.sh'].includes(p)
    })
    const statuses = await hub.locate()
    expect(hub.windows).toBe(false)
    expect(statuses.find(s => s.id === 'siril')).toMatchObject({ path: '/usr/bin/siril-cli', source: 'path' })
    expect(statuses.find(s => s.id === 'siril-scripts')?.path).toBe('/home/leigh/Siril_Scripts/v2/postprocess.sh')
  })
})

describe('SqliteStackCatalogue', () => {
  it("[PPR-001] Given stacks and lights with FOCALLEN and pixel size, When read, Then the stack's optics and colour come from its headers and the lights give the target's usual optics", async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 'm31', canonicalName: 'M 31' })
    const scan = seedFitsScan(db)
    const header = db.prepare('INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES (?, ?, ?, ?, NULL, ?)')
    const stack = seedFitsFile(db, scan, { filePath: '/s/mono.fit', isStacked: true, targetId: 'm31' })
    header.run('h1', stack, 'NAXIS3', '1', 1)
    header.run('h2', stack, 'FOCALLEN', "'250.0'", 2)
    db.prepare('UPDATE fits_files SET xpixsz = 2.9 WHERE id = ?').run(stack)
    for (const [i, focal, px] of [[1, 250, 2.9], [2, 250, 2.9], [3, 400, 3.76]] as const) {
      const light = seedFitsFile(db, scan, { filePath: `/l/${i}.fit`, targetId: 'm31' })
      header.run(`l${i}`, light, 'FOCALLEN', String(focal), 1)
      db.prepare('UPDATE fits_files SET xpixsz = ? WHERE id = ?').run(px, light)
    }
    const catalogue = new SqliteStackCatalogue(db)
    expect((await catalogue.listStacks('m31'))[0]).toMatchObject({ colour: false, focalMm: 250, pixelUm: 2.9 })
    expect(await catalogue.targetOptics('m31')).toEqual({ focalMm: 250, pixelUm: 2.9 })
  })
})
