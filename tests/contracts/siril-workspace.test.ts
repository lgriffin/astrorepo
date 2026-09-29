import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, it, expect } from 'vitest'
import { InMemorySirilWorkspace } from '@astro/testkit'
import { sirilWorkspaceContract } from '@astro/testkit/contracts/siril-workspace.contract'
import { NodeSirilWorkspace } from '../../src/main/adapters/node-siril-workspace'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile } from '../helpers/setup'

sirilWorkspaceContract('in-memory', async frames => {
  const fits = frames.filter(n => /\.(fit|fits|fts)$/i.test(n)).sort()
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
    join: (dir, rel) => `${dir}/${rel}`
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
    join: (dir, rel) => path.join(dir, rel)
  }
})

describe('NodeSirilWorkspace on disk', () => {
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
