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
  const workspace = new InMemorySirilWorkspace().addSource('/src', ...fits.map(name => ({ name })))
  return {
    workspace,
    sourceDir: '/src',
    workDir: '/work',
    sourceListing: async () => (workspace.source.get('/src') ?? []).map(f => f.name).sort(),
    workHas: async rel => workspace.placed.has(`/work/${rel}`)
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
  for (const name of frames) fs.writeFileSync(path.join(sourceDir, name), `content of ${name}`)
  const workDir = path.join(root, 'work')
  return {
    workspace: new NodeSirilWorkspace(),
    sourceDir,
    workDir,
    sourceListing: async () => fs.readdirSync(sourceDir).sort(),
    workHas: async rel => fs.existsSync(path.join(workDir, rel))
  }
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
