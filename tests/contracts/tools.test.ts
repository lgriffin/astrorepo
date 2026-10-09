import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { CATALOGUE_SAMPLES, FakeAppPathsRegistry, FakeToolHub, InMemoryStackCatalogue } from '@astro/testkit'
import { stackCatalogueContract, toolHubContract } from '@astro/testkit/contracts/tools.contract'
import { CATALOGUES, toolSpec, type ToolId } from '@astro/domain'
import { NodeToolHub, type NodeToolHubOptions } from '../../src/main/adapters/node-tool-hub'
import { SqliteStackCatalogue } from '../../src/main/adapters/sqlite-stack-catalogue'
import { seedFitsFile, seedFitsScan, seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

const win = (p: string) => path.win32.normalize(p)

/** A Windows hub over a pretend disk holding `files`, and folders with the names in `dirs`. */
function windowsHub(files: string[], settings: Record<string, string> = {}, PATH = '', dirs: Record<string, string[]> = {}, extra: Partial<NodeToolHubOptions> = {}) {
  const disk = new Set(files.map(f => win(f).toLowerCase()))
  const folders = new Map(Object.entries(dirs).map(([d, names]) => [win(d).toLowerCase().replace(/\\$/, ''), names]))
  return new NodeToolHub({
    platform: 'win32',
    env: { PATH },
    home: 'C:\\Users\\leigh',
    setting: key => settings[key] ?? null,
    exists: p => disk.has(win(p).toLowerCase()),
    listDir: d => folders.get(win(d).toLowerCase().replace(/\\$/, '')) ?? null,
    ...extra
  })
}

toolHubContract('fake', (installed, without = []) => {
  const hub = new FakeToolHub()
  const all = new FakeToolHub().installAll()
  for (const id of installed) hub.install(id, all.found.get(id) ?? toolSpec(id).standard.windows[0])
  for (const c of CATALOGUES) if (without.includes(c.tool)) hub.removeCatalogue(c.id)
  return hub
})
toolHubContract('Node', (installed, without = []) => {
  const files = installed.map(id => toolSpec(id).standard.windows[0])
  const dirs: Record<string, string[]> = {}
  for (const id of installed) {
    const dir = path.win32.dirname(win(toolSpec(id).standard.windows[0]))
    const names = CATALOGUES.filter(c => c.tool === id && !without.includes(id)).flatMap(c => CATALOGUE_SAMPLES[c.id])
    dirs[dir] = [path.win32.basename(toolSpec(id).standard.windows[0]), ...names]
  }
  return windowsHub(files, {}, '', dirs)
})

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
    const id = seedFitsFile(db, scan, { filePath: s.path, isStacked: true, ncombine: 20, targetId: seed.targetId })
    db.prepare('UPDATE fits_files SET naxis1 = ?, naxis2 = ?, file_modified_at = ? WHERE id = ?').run(s.width, s.height, s.modifiedAt, id)
  }
  return new SqliteStackCatalogue(db, () => true)
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
    const found = (await windowsHub([entry, entry.replace('.bat', '.sh')]).locate()).find(s => s.id === 'siril-scripts')
    expect(found).toMatchObject({ path: win(entry), source: 'standard' })
    for (const setting of ['D:\\Siril_Scripts', 'D:\\Siril_Scripts\\v2', 'D:\\Siril_Scripts\\v2\\postprocess.bat']) {
      const s = (await windowsHub(['D:\\Siril_Scripts\\v2\\postprocess.bat', 'D:\\Siril_Scripts\\v2\\postprocess.sh'], { tool_path_siril_scripts: setting }).locate()).find(x => x.id === 'siril-scripts')
      expect(s).toMatchObject({ path: win('D:\\Siril_Scripts\\v2\\postprocess.bat'), source: 'setting' })
    }
  })

  it('[HUB-001] Given a Siril_Scripts folder with postprocess.bat but no postprocess.sh, When tools are located, Then it is not taken, since the runner starts the .sh', async () => {
    const found = (await windowsHub(['C:\\Users\\leigh\\Siril_Scripts\\v2\\postprocess.bat']).locate()).find(s => s.id === 'siril-scripts')
    expect(found).toMatchObject({ path: null })
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
    expect(await hub.stockScript('OSC_Preprocessing.ssf')).toBeNull()
  })

  it('[HUB-005] Given Siril installed on Windows, When a stock script is asked for, Then it is found under share/siril/scripts or an older scripts folder', async () => {
    const siril = 'C:/Program Files/Siril/bin/siril-cli.exe'
    expect(await windowsHub([siril, 'C:/Program Files/Siril/share/siril/scripts/OSC_Preprocessing.ssf']).stockScript('OSC_Preprocessing.ssf')).toBe(
      win('C:/Program Files/Siril/share/siril/scripts/OSC_Preprocessing.ssf')
    )
    expect(await windowsHub([siril, 'C:/Program Files/Siril/scripts/Mono_Preprocessing.ssf']).stockScript('Mono_Preprocessing.ssf')).toBe(
      win('C:/Program Files/Siril/scripts/Mono_Preprocessing.ssf')
    )
    expect(await windowsHub([siril]).stockScript('OSC_Preprocessing.ssf')).toBeNull()
    expect(await windowsHub([]).stockScript('OSC_Preprocessing.ssf')).toBeNull()
  })

  it('[HUB-005] Given Siril from a Linux package, When a stock script is asked for, Then the system scripts folder is used', async () => {
    const hub = new NodeToolHub({
      platform: 'linux',
      env: { PATH: '/usr/bin' },
      home: '/home/leigh',
      setting: () => null,
      exists: p => ['/usr/bin/siril-cli', '/usr/share/siril/scripts/OSC_Preprocessing.ssf'].includes(p)
    })
    expect(await hub.stockScript('OSC_Preprocessing.ssf')).toBe('/usr/share/siril/scripts/OSC_Preprocessing.ssf')
  })
})

describe('NodeToolHub: SyQon CLI and ASTAP', () => {
  const syqonAt = (statuses: { id: string }[]) => statuses.find(s => s.id === 'syqon')

  it('[HUB-006] Given SyQon in every place, When located, Then your setting wins, then SYQON_CLI_PATH, then the install folder, then App Paths', async () => {
    const setting = 'D:\\Tools\\syqon-cli.exe'
    const env = 'E:\\SyQon\\syqon-cli.exe'
    const local = 'C:\\Users\\leigh\\AppData\\Local\\Programs\\SyQon Studio\\syqon-cli.exe'
    const reg = 'F:\\Apps\\syqon-cli.exe'
    const registry = new FakeAppPathsRegistry().register('syqon-cli.exe', reg)
    const hub = (files: string[], settings: Record<string, string> = {}, vars: Record<string, string> = {}) =>
      windowsHub(files, settings, '', {}, { env: { PATH: '', ...vars }, registry })
    const all = [setting, env, local, reg]
    expect(syqonAt(await hub(all, { tool_path_syqon: setting }, { SYQON_CLI_PATH: env }).locate())).toMatchObject({ path: win(setting), source: 'setting' })
    expect(syqonAt(await hub(all, {}, { SYQON_CLI_PATH: `"${env}"` }).locate())).toMatchObject({ path: win(env), source: 'env' })
    expect(syqonAt(await hub(all).locate())).toMatchObject({ path: win(local), source: 'standard' })
    expect(syqonAt(await hub([reg]).locate())).toMatchObject({ path: win(reg), source: 'registry' })
  })

  it('[HUB-006] Given %LOCALAPPDATA% and %ProgramFiles% set, When SyQon is looked for, Then the install folders use them; a stale SYQON_CLI_PATH is passed over', async () => {
    const programFiles = 'D:\\Programs\\SyQon Studio\\syqon-cli.exe'
    const hub = windowsHub([programFiles], {}, '', {}, { env: { PATH: '', LOCALAPPDATA: 'X:\\Local', ProgramFiles: 'D:\\Programs', SYQON_CLI_PATH: 'Q:\\gone.exe' } })
    expect(syqonAt(await hub.locate())).toMatchObject({ path: win(programFiles), source: 'standard' })
  })

  it('[HUB-006] Given SyQon nowhere, When located, Then every place is listed, the registry key last; PATH is not one of them', async () => {
    const hub = windowsHub([], { tool_path_syqon: 'D:\\Gone\\syqon-cli.exe' }, 'E:\\bin', {}, { env: { PATH: 'E:\\bin', SYQON_CLI_PATH: 'Q:\\syqon-cli.exe' }, registry: new FakeAppPathsRegistry() })
    const syqon = (await hub.locate()).find(s => s.id === 'syqon')
    expect(syqon).toMatchObject({ path: null, settingMissing: true })
    expect(syqon?.looked).toEqual([
      win('D:\\Gone\\syqon-cli.exe'),
      win('Q:\\syqon-cli.exe'),
      win('C:\\Users\\leigh\\AppData\\Local\\Programs\\SyQon Studio\\syqon-cli.exe'),
      win('C:\\Program Files\\SyQon Studio\\syqon-cli.exe'),
      'App Paths\\syqon-cli.exe in the registry'
    ])
  })

  it('[HUB-006] Given Linux, When SyQon is looked for, Then only your setting and SYQON_CLI_PATH are tried and the registry is never asked', async () => {
    let asked = false
    const hub = new NodeToolHub({
      platform: 'linux',
      env: { PATH: '/usr/bin', SYQON_CLI_PATH: '/opt/syqon/syqon-cli' },
      home: '/home/leigh',
      setting: () => null,
      exists: p => p === '/opt/syqon/syqon-cli',
      registry: { lookup: async () => ((asked = true), ['/x']) }
    })
    expect(syqonAt(await hub.locate())).toMatchObject({ path: '/opt/syqon/syqon-cli', source: 'env' })
    expect(asked).toBe(false)
  })

  it('[HUB-015] Given ASTAP on PATH, When located, Then it is found there and its star database is looked for beside it first', async () => {
    const hub = windowsHub(['E:\\astap\\astap.exe'], { catalogue_path_astap: 'G:\\stars' }, 'E:\\astap', { 'E:\\astap': ['astap.exe', 'd50_0101.1476'] })
    const astap = (await hub.locate()).find(s => s.id === 'astap')
    expect(astap).toMatchObject({ path: win('E:\\astap\\astap.exe'), source: 'path' })
    const folders = await hub.catalogueFolders('astap-stars', astap?.path ?? null)
    expect(folders.map(f => f.dir)).toEqual([win('G:\\stars'), win('E:\\astap'), win('C:/Program Files/astap')])
    expect(folders[1].names).toEqual(['astap.exe', 'd50_0101.1476'])
    expect(folders[0].names).toBeNull()
  })

  it("[HUB-009] Given Siril installed, When its Gaia catalogue folders are listed, Then Siril's own share folder comes before the user's AppData", async () => {
    const hub = windowsHub([], {}, '', {}, { env: { PATH: '', LOCALAPPDATA: 'C:\\Users\\leigh\\AppData\\Local' } })
    const folders = await hub.catalogueFolders('siril-spcc', 'C:\\Program Files\\Siril\\bin\\siril-cli.exe')
    expect(folders.map(f => f.dir)).toEqual([
      win('C:\\Program Files\\Siril\\share\\siril\\catalogue'),
      win('C:\\Users\\leigh\\AppData\\Local\\siril\\catalogue'),
      win('C:\\Users\\leigh\\AppData\\Local\\siril')
    ])
    expect(await hub.catalogueFolders('rc-astro-models', null)).toEqual([])
  })

  it('[HUB-009] Given Linux and no folders on disk, When catalogue folders are listed, Then home is expanded and the real file system answers', async () => {
    const hub = new NodeToolHub({ platform: 'linux', env: {}, home: '/home/leigh', setting: () => null })
    const folders = await hub.catalogueFolders('siril-spcc', '/usr/bin/siril-cli')
    expect(folders.map(f => f.dir)).toEqual(['/usr/share/siril/catalogue', '/home/leigh/.local/share/siril/catalogue', '/home/leigh/.local/share/siril'])
    expect(await hub.listFolder(path.join(__dirname, 'no-such-folder'))).toBeNull()
    expect(await hub.listFolder(__dirname)).toContain('tools.test.ts')
  })
})

describe('SqliteStackCatalogue', () => {
  it("[PPR-001] Given stacks and lights with FOCALLEN and pixel size, When read, Then the stack's optics and colour come from its headers and the lights give the target's usual optics", async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 'm31', canonicalName: 'M 31' })
    const scan = seedFitsScan(db)
    const header = db.prepare('INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES (?, ?, ?, ?, NULL, ?)')
    const stack = seedFitsFile(db, scan, { filePath: '/s/mono.fit', isStacked: true, ncombine: 40, targetId: 'm31' })
    header.run('h1', stack, 'NAXIS3', '1', 1)
    header.run('h2', stack, 'FOCALLEN', "'250.0'", 2)
    db.prepare('UPDATE fits_files SET xpixsz = 2.9 WHERE id = ?').run(stack)
    // Three darks at another setup outnumber the lights, but only lights count.
    for (const [i, focal, px, type] of [[1, 250, 2.9, 'Light Frame'], [2, 250, 2.9, 'Light Frame'], [3, 400, 3.76, 'Dark Frame'], [4, 400, 3.76, 'Dark Frame'], [5, 400, 3.76, 'Dark Frame']] as const) {
      const file = seedFitsFile(db, scan, { filePath: `/l/${i}.fit`, targetId: 'm31', imageType: type })
      header.run(`l${i}`, file, 'FOCALLEN', String(focal), 1)
      db.prepare('UPDATE fits_files SET xpixsz = ? WHERE id = ?').run(px, file)
    }
    const catalogue = new SqliteStackCatalogue(db, () => true)
    expect((await catalogue.listStacks('m31'))[0]).toMatchObject({ colour: false, focalMm: 250, pixelUm: 2.9 })
    expect(await catalogue.targetOptics('m31')).toEqual({ focalMm: 250, pixelUm: 2.9 })
  })

  it('[PPR-001] Given a calibrated sub flagged only by CALSTAT, a master dark and a stack whose file is gone, When stacks are listed, Then only the real stack on disk comes back', async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 'm31', canonicalName: 'M 31' })
    const scan = seedFitsScan(db)
    seedFitsFile(db, scan, { filePath: '/s/calibrated_sub.fit', isStacked: true, targetId: 'm31' })
    seedFitsFile(db, scan, { filePath: '/s/master_dark.fit', isStacked: true, ncombine: 30, imageType: 'Master Dark', targetId: 'm31' })
    seedFitsFile(db, scan, { filePath: '/s/gone.fit', isStacked: true, ncombine: 30, targetId: 'm31' })
    seedFitsFile(db, scan, { filePath: '/s/seestar.fit', isStacked: true, totalExposure: 3600, exposureSec: 10, targetId: 'm31' })
    seedFitsFile(db, scan, { filePath: '/s/siril.fit', isStacked: true, imageType: 'Stacked Light', targetId: 'm31' })
    const stacks = await new SqliteStackCatalogue(db, p => p !== '/s/gone.fit').listStacks('m31')
    expect(stacks.map(s => s.path).sort()).toEqual(['/s/seestar.fit', '/s/siril.fit'])
  })
})
