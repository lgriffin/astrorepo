import { describe, expect, it } from 'vitest'
import type { RunArea } from '@astro/application'
import { FAILED_FOLDER, MANIFEST_SUFFIX, STEP_FOLDER, type StackManifest } from '@astro/domain'

export interface RunAreaHarness {
  area: RunArea
  /** An empty work folder. */
  workDir: string
  /** A folder outside the work folder. */
  elsewhere: string
  /** Joins path parts as the adapter's paths are joined. */
  join(...parts: string[]): string
  /** Writes a file as Siril or the user would, outside the port. */
  write(path: string, text: string): Promise<void>
}

const manifest = (result: string): StackManifest => ({ format: 'astrorepo-stack-manifest', version: 1, result: { path: result } }) as unknown as StackManifest

/**
 * Every RunArea adapter must pass this suite. The job scheduler relies on: a script that cannot be
 * read rejecting (the stack then runs whole), a step written again replacing the last one (a
 * resumed run), set-aside results no longer being where they were, and nothing landing outside
 * the work folder.
 */
export function runAreaContract(adapterName: string, setup: () => Promise<RunAreaHarness>): void {
  describe(`RunArea contract: ${adapterName}`, () => {
    it('[NFR-006] [PRV-003] Given a stock script, When read, Then its text comes back, and a script that is not there is refused rather than read as empty', async () => {
      const h = await setup()
      const script = h.join(h.elsewhere, 'OSC_Preprocessing.ssf')
      await h.write(script, 'requires 1.2.0\nconvert light\n')
      expect(await h.area.readText(script)).toBe('requires 1.2.0\nconvert light\n')
      await expect(h.area.readText(h.join(h.elsewhere, 'gone.ssf'))).rejects.toThrow()
    })

    it("[NFR-006] [NFR-015] Given a step, When written, Then it lands in the work folder's own subfolder and reads back, and writing it again replaces it", async () => {
      const h = await setup()
      const file = await h.area.writeStep(h.workDir, 'step-01.ssf', 'requires 1.2.0\n')
      expect(file).toBe(h.join(h.workDir, STEP_FOLDER, 'step-01.ssf'))
      expect(await h.area.readText(file)).toBe('requires 1.2.0\n')
      expect(await h.area.writeStep(h.workDir, 'step-01.ssf', 'requires 1.3.0\n')).toBe(file)
      expect(await h.area.readText(file)).toBe('requires 1.3.0\n')
    })

    it('[NFR-006] [NFR-015] Given a step name holding a path, When written, Then it is refused', async () => {
      const h = await setup()
      await expect(h.area.writeStep(h.workDir, '../escape.ssf', 'x')).rejects.toThrow(/not a plain file name/)
      await expect(h.area.writeStep(h.workDir, 'sub/step.ssf', 'x')).rejects.toThrow(/not a plain file name/)
      await expect(h.area.readText(h.join(h.workDir, 'escape.ssf'))).rejects.toThrow()
    })

    it(`[NFR-006] [PRV-002] [NFR-015] Given a partial result, When set aside, Then it moves to ${FAILED_FOLDER}/<run>, and a file outside the work folder is left alone`, async () => {
      const h = await setup()
      const partial = h.join(h.workDir, 'result_60s.fit')
      const outside = h.join(h.elsewhere, 'result.fit')
      await h.write(partial, 'partial')
      await h.write(outside, 'not ours')
      const moved = await h.area.setAside(h.workDir, 'job-1', [partial, outside])
      expect(moved).toEqual([h.join(h.workDir, FAILED_FOLDER, 'job-1', 'result_60s.fit')])
      expect(await h.area.readText(moved[0])).toBe('partial')
      await expect(h.area.readText(partial)).rejects.toThrow()
      expect(await h.area.readText(outside)).toBe('not ours')
      expect(await h.area.setAside(h.workDir, 'job-1', [])).toEqual([])
    })

    it('[NFR-006] [PRV-001] Given a published result, When its manifest is written, Then it sits beside the result as JSON, and writing it again replaces it', async () => {
      const h = await setup()
      const result = h.join(h.workDir, 'result_60s.fit')
      await h.write(result, 'stack')
      const file = await h.area.writeManifest(result, manifest(result))
      expect(file).toBe(`${result}${MANIFEST_SUFFIX}`)
      expect(JSON.parse(await h.area.readText(file))).toEqual(manifest(result))
      const again = { ...manifest(result), version: 2 } as unknown as StackManifest
      expect(await h.area.writeManifest(result, again)).toBe(file)
      expect(JSON.parse(await h.area.readText(file))).toEqual(again)
    })

    it('[NFR-006] [PRV-002] Given a result that had a manifest from an earlier run, When set aside, Then its manifest goes with it', async () => {
      const h = await setup()
      const result = h.join(h.workDir, 'result_60s.fit')
      await h.write(result, 'partial')
      await h.area.writeManifest(result, manifest(result))
      await h.area.setAside(h.workDir, 'job-2', [result])
      await expect(h.area.readText(`${result}${MANIFEST_SUFFIX}`)).rejects.toThrow()
      expect(JSON.parse(await h.area.readText(h.join(h.workDir, FAILED_FOLDER, 'job-2', `result_60s.fit${MANIFEST_SUFFIX}`)))).toEqual(manifest(result))
    })
  })
}
