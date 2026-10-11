import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryRunArea } from '@astro/testkit'
import { runAreaContract } from '@astro/testkit/contracts/run-area.contract'
import { NodeRunArea, STEP_FOLDER } from '../../src/main/adapters/node-run-area'

runAreaContract('in-memory', async () => {
  const area = new InMemoryRunArea()
  return { area, workDir: '/work/M 42', elsewhere: '/elsewhere', join: (...parts) => parts.join('/'), write: async (p, text) => void area.texts.set(p, text) }
})

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})
const tempDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-run-'))
  dirs.push(d)
  return d
}

runAreaContract('Node', async () => ({
  area: new NodeRunArea(),
  workDir: tempDir(),
  elsewhere: tempDir(),
  join: (...parts) => path.join(...parts),
  write: async (p, text) => {
    await fs.promises.mkdir(path.dirname(p), { recursive: true })
    await fs.promises.writeFile(p, text)
  }
}))

describe('NodeRunArea', () => {
  it('[PRV-001] Given a manifest written, When done, Then no temporary file is left beside it', async () => {
    const work = tempDir()
    await new NodeRunArea().writeManifest(path.join(work, 'result_60s.fit'), { format: 'astrorepo-stack-manifest' } as never)
    expect(fs.readdirSync(work)).toEqual(['result_60s.fit.astrorepo.json'])
  })

  it('[NFR-015] Given the step or failed folder links outside the work folder, When written to, Then it is refused and nothing lands outside', async () => {
    const work = tempDir()
    const elsewhere = tempDir()
    fs.symlinkSync(elsewhere, path.join(work, STEP_FOLDER), 'dir')
    await expect(new NodeRunArea().writeStep(work, 'step-01.ssf', 'x')).rejects.toThrow(/links to a folder outside the work area/)
    const other = tempDir()
    fs.symlinkSync(elsewhere, path.join(other, 'failed'), 'dir')
    fs.writeFileSync(path.join(other, 'result_60s.fit'), 'partial')
    await expect(new NodeRunArea().setAside(other, 'job-3', [path.join(other, 'result_60s.fit')])).rejects.toThrow(/links to a folder outside the work area/)
    expect(fs.readdirSync(elsewhere)).toEqual([])
    expect(fs.existsSync(path.join(other, 'result_60s.fit'))).toBe(true)
  })
})
