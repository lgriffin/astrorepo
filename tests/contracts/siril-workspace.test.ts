import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, it, expect } from 'vitest'
import { InMemorySirilWorkspace } from '@astro/testkit'
import { frameFileKind } from '@astro/domain'
import { sirilWorkspaceContract } from '@astro/testkit/contracts/siril-workspace.contract'
import { NodeSirilWorkspace } from '../../src/main/adapters/node-siril-workspace'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile } from '../helpers/setup'

sirilWorkspaceContract('in-memory', async frames => {
  const fits = frames.filter(n => frameFileKind(n) !== null).sort()
  // The fake has no folders of its own; a frame type folder in the name stands for IMAGETYP.
  const typed = fits.map(name => ({ name, imageType: /\/(darks?|flats?|bias(es)?)\//i.exec(name)?.[1] ?? null }))
  const workspace = new InMemorySirilWorkspace().addSource('/src', ...typed)
  return {
    workspace,
    sourceDir: '/src',
    workDir: '/work',
    sourceListing: async () => (workspace.source.get('/src') ?? []).map(f => f.name).sort(),
    workHas: async rel => workspace.placed.has(`/work/${rel}`),
    rewriteSource: async rel => void workspace.rewrite(`/src/${rel}`),
    join: (dir, rel) => `${dir}/${rel}`,
    workText: async rel => workspace.written.get(`/work/${rel}`) ?? null
  }
})

const tempDirs: string[] = []
afterEach(() => {
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

sirilWorkspaceContract('Node', async frames => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
  tempDirs.push(root)
  const sourceDir = path.join(root, 'source')
  fs.mkdirSync(sourceDir)
  for (const name of frames) {
    fs.mkdirSync(path.dirname(path.join(sourceDir, name)), { recursive: true })
    fs.writeFileSync(path.join(sourceDir, name), `content of ${name}`)
  }
  const workDir = path.join(root, 'work')
  return {
    workspace: new NodeSirilWorkspace(),
    sourceDir,
    workDir,
    sourceListing: async () => fs.readdirSync(sourceDir, { recursive: true }).map(String).sort(),
    workHas: async rel => fs.existsSync(path.join(workDir, rel)),
    // Capture tools write a new file and move it over the old one, so it gets a new inode.
    rewriteSource: async rel => {
      const target = path.join(sourceDir, rel)
      fs.writeFileSync(`${target}.tmp`, `new content of ${rel}, longer than before`)
      fs.renameSync(`${target}.tmp`, target)
    },
    join: (dir, rel) => path.join(dir, rel),
    workText: async rel => (fs.existsSync(path.join(workDir, rel)) ? fs.readFileSync(path.join(workDir, rel), 'utf-8') : null)
  }
})

describe('NodeSirilWorkspace on disk', () => {
  it('[GRD-007] Given a lights folder that links to the source, When folders are prepared or a frame removed, Then it is refused and the source keeps every frame', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    const source = path.join(root, 'source')
    const work = path.join(root, 'work')
    fs.mkdirSync(source)
    fs.mkdirSync(work)
    fs.writeFileSync(path.join(source, 'Light_001.fit'), 'pixels')
    fs.symlinkSync(source, path.join(work, 'lights'), process.platform === 'win32' ? 'junction' : 'dir')
    const ws = new NodeSirilWorkspace()
    await expect(ws.prepareFolders(work)).rejects.toThrow(/links to a folder outside the work area/)
    await expect(ws.remove(work, 'lights', ['Light_001.fit'])).rejects.toThrow(/links to a folder outside the work area/)
    expect(fs.readdirSync(source)).toEqual(['Light_001.fit'])
  })

  it('[GRD-007] Given a frame the user put in the work area by hand, When rejected lights are removed, Then it stays, and names that are not plain FITS files are ignored', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    const work = path.join(root, 'work')
    const ws = new NodeSirilWorkspace()
    await ws.prepareFolders(work)
    fs.writeFileSync(path.join(work, 'lights', 'mine.fit'), 'kept')
    fs.writeFileSync(path.join(work, 'lights', 'Light_002.fit'), 'rejected')
    fs.writeFileSync(path.join(work, 'notes.fit'), 'outside')
    expect(await ws.remove(work, 'lights', ['Light_002.fit', '../notes.fit', 'Light_002.txt'])).toEqual(['Light_002.fit'])
    expect(fs.readdirSync(path.join(work, 'lights'))).toEqual(['mine.fit'])
    expect(fs.existsSync(path.join(work, 'notes.fit'))).toBe(true)
    expect(await ws.remove(work, 'lights', [])).toEqual([])
  })

  it('[ING-013] Given a stale frame in the work area, When placed again, Then the work area gets the new bytes and the source is untouched', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    const source = path.join(root, 'src', 'Light_001.fit')
    fs.mkdirSync(path.dirname(source))
    fs.writeFileSync(source, 'old')
    const ws = new NodeSirilWorkspace()
    const work = path.join(root, 'work')
    await ws.prepareFolders(work)
    const placement = { from: source, folder: 'lights' as const, name: 'Light_001.fit' }
    await ws.place(placement, work)
    fs.writeFileSync(`${source}.tmp`, 'new bytes')
    fs.renameSync(`${source}.tmp`, source)
    await ws.place(placement, work)
    expect(fs.readFileSync(path.join(work, 'lights', 'Light_001.fit'), 'utf8')).toBe('new bytes')
    expect(fs.readFileSync(source, 'utf8')).toBe('new bytes')
  })

  it('[ING-001] Given a link to the source folder, When containment is checked through it, Then the link is followed', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    const data = path.join(root, 'data')
    fs.mkdirSync(data)
    const link = path.join(root, 'alias')
    try {
      fs.symlinkSync(data, link, 'junction')
    } catch {
      return // Creating links needs rights some Windows runners lack; the plain-path cases are covered above.
    }
    expect(await new NodeSirilWorkspace().contains(data, path.join(link, 'work'))).toBe(true)
  })
})

describe('NodeSirilWorkspace with the catalogue', () => {
  afterEach(() => teardownTestDb())

  it('[ING-013] Given a frame whose IMAGETYP the catalogue knows, When listed, Then the type comes with it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    const file = path.join(root, 'frame_001.fit')
    fs.writeFileSync(file, 'x')
    const db = setupTestDb()
    seedFitsFile(db, seedFitsScan(db), { filePath: file, imageType: 'Dark Frame' })
    const [frame] = await new NodeSirilWorkspace(db).listSourceFrames(root)
    expect(frame.imageType).toBe('Dark Frame')
  })
})

describe('NodeSirilWorkspace space', () => {
  afterEach(() => teardownTestDb())

  it('[RCP-004] Given lights indexed with and without a Bayer pattern and one never indexed, When details are read, Then dimensions and sensor come from the index', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    const [colour, mono, unknown] = ['colour.fit', 'mono.fit', 'new.fit'].map(n => path.join(root, n))
    for (const p of [colour, mono, unknown]) fs.writeFileSync(p, 'x'.repeat(100))
    const db = setupTestDb()
    const scan = seedFitsScan(db)
    const header = db.prepare('INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES (?, ?, ?, ?, NULL, ?)')
    const colourId = seedFitsFile(db, scan, { filePath: colour })
    const monoId = seedFitsFile(db, scan, { filePath: mono })
    db.prepare('UPDATE fits_files SET naxis1 = 3840, naxis2 = 2160 WHERE id = ?').run(colourId)
    header.run('h1', colourId, 'BAYERPAT', "'GRBG'", 1)
    header.run('h2', monoId, 'NAXIS', '2', 1)

    const details = await new NodeSirilWorkspace(db).frameDetails([colour, mono, unknown])
    expect(details).toMatchObject([
      { path: colour, sizeBytes: 100, width: 3840, height: 2160, colour: true },
      { path: mono, sizeBytes: 100, width: null, height: null, colour: false },
      { path: unknown, sizeBytes: 100, width: null, height: null, colour: null, settings: null }
    ])
  })

  it('[ADV-003] [ADV-005] Given an indexed light with capture settings and FOCALLEN, When details are read, Then the settings and optics come with it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    const file = path.join(root, 'Light_001.fit')
    fs.writeFileSync(file, 'x')
    const db = setupTestDb()
    const id = seedFitsFile(db, seedFitsScan(db), { filePath: file, exposureSec: 10, gain: 80, ccdTemp: -2.5, filter: ' L ', dateObs: '2026-01-10T21:00:00', telescope: 'Seestar S50' })
    db.prepare('UPDATE fits_files SET xpixsz = 2.9 WHERE id = ?').run(id)
    db.prepare("INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES ('h', ?, 'FOCALLEN', '250', NULL, 1)").run(id)
    const [detail] = await new NodeSirilWorkspace(db).frameDetails([file])
    expect(detail.settings).toEqual({
      exposureSec: 10, gain: 80, sensorTempC: -2.5, filter: 'L', capturedAt: new Date('2026-01-10T21:00:00Z'), focalMm: 250, pixelUm: 2.9, scope: 'Seestar S50'
    })
  })

  it('[RCP-003] Given an earlier run left files in process and masters, When the space is read, Then they count as used and the disk reports free space', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    const source = path.join(root, 'source')
    const work = path.join(root, 'work')
    for (const d of [source, path.join(work, 'process'), path.join(work, 'masters')]) fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(work, 'process', 'pp_light_00001.fit'), 'x'.repeat(300))
    fs.writeFileSync(path.join(work, 'masters', 'master_dark.fit'), 'x'.repeat(200))
    const space = await new NodeSirilWorkspace().workAreaSpace(work)
    expect(space.usedBytes).toBe(500)
    expect(space.freeBytes).toBeGreaterThan(0)
  })

  it('[RCP-002] Given a work folder not made yet on the same disk as the frames, When the copy is estimated, Then the frames will be hard-linked and cost nothing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    const frame = path.join(root, 'source', 'Light_001.fit')
    fs.mkdirSync(path.dirname(frame), { recursive: true })
    fs.writeFileSync(frame, 'x'.repeat(100))
    const work = path.join(root, 'work', 'M 31')
    expect(await new NodeSirilWorkspace().copyBytes([{ from: frame, folder: 'lights', name: 'Light_001.fit' }], work)).toBe(0)
    expect(fs.existsSync(work)).toBe(false)
  })
})

describe('NodeSirilWorkspace stack results', () => {
  it('[PPR-001] Given a Siril run left result files, When they are read, Then only result*.fit come back, newest first', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-siril-'))
    tempDirs.push(root)
    fs.writeFileSync(path.join(root, 'result_3600s.fit'), 'x'.repeat(10))
    fs.writeFileSync(path.join(root, 'result_7200s.fit'), 'x'.repeat(20))
    fs.writeFileSync(path.join(root, 'notes.txt'), 'x')
    fs.utimesSync(path.join(root, 'result_3600s.fit'), new Date('2026-01-01'), new Date('2026-01-01'))
    const results = await new NodeSirilWorkspace().stackResults(root)
    expect(results.map(r => [path.basename(r.path), r.sizeBytes])).toEqual([['result_7200s.fit', 20], ['result_3600s.fit', 10]])
  })
})
