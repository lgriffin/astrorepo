import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { StackManifest } from '@astro/domain'
import { NodeRunArea, STEP_FOLDER } from '../../src/main/adapters/node-run-area'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})
const workDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-run-'))
  dirs.push(d)
  return d
}

describe('NodeRunArea', () => {
  it('[NFR-015] Given a step, When written, Then it lands in the work folder\'s own subfolder; a name with a path is refused', async () => {
    const work = workDir()
    const area = new NodeRunArea()
    const file = await area.writeStep(work, 'step-01.ssf', 'requires 1.2.0\n')
    expect(file).toBe(path.join(work, STEP_FOLDER, 'step-01.ssf'))
    expect(await area.readText(file)).toBe('requires 1.2.0\n')
    await expect(area.writeStep(work, '../escape.ssf', 'x')).rejects.toThrow(/not a plain file name/)
  })

  it('[PRV-002] [NFR-015] Given a partial result, When set aside, Then it moves to failed/<run>, and a file outside the work folder is left alone', async () => {
    const work = workDir()
    const outside = path.join(workDir(), 'result.fit')
    fs.writeFileSync(path.join(work, 'result_60s.fit'), 'partial')
    fs.writeFileSync(outside, 'not ours')
    const moved = await new NodeRunArea().setAside(work, 'job-1', [path.join(work, 'result_60s.fit'), outside])
    expect(moved).toEqual([path.join(work, 'failed', 'job-1', 'result_60s.fit')])
    expect(fs.existsSync(path.join(work, 'result_60s.fit'))).toBe(false)
    expect(fs.readFileSync(outside, 'utf8')).toBe('not ours')
  })

  it('[PRV-001] Given a published result, When its manifest is written, Then it sits beside the result as JSON and no temporary file is left', async () => {
    const work = workDir()
    const result = path.join(work, 'result_60s.fit')
    const manifest = { format: 'astrorepo-stack-manifest', version: 1 } as unknown as StackManifest
    const file = await new NodeRunArea().writeManifest(result, manifest)
    expect(file).toBe(`${result}.astrorepo.json`)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(manifest)
    expect(fs.readdirSync(work)).toEqual(['result_60s.fit.astrorepo.json'])
  })
})
