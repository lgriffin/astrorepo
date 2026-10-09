import { describe, expect, it } from 'vitest'
import type { MosaicStore, MosaicTarget, PlateSolver, SolveIO, SolveStore } from '@astro/application'
import type { JobCommand, SolveTaskFile } from '@astro/domain'

/** Where the contract's solver is told the image points, as ASTAP's .ini or Siril's log would say. */
export const CONTRACT_SOLUTION = { raDeg: 10.6847, decDeg: 41.2688 }

export interface SolverRig {
  solver: PlateSolver
  program: string
  file: SolveTaskFile
  workDir: string
  /** Runs a command as the scripted solver would: writing its result file, or printing its log. */
  io: SolveIO
  /** What the source folder holds, name and bytes, to prove it is untouched. */
  sourceState(): Promise<string[]>
  /** Files the solve left in the work folder. */
  leftovers(): Promise<string[]>
}

/**
 * Every PlateSolver adapter must pass this suite. `make` returns a rig whose program solves the
 * file to CONTRACT_SOLUTION, or fails, as asked.
 */
export function plateSolverContract(adapterName: string, make: (result: 'solved' | 'failed') => Promise<SolverRig>): void {
  describe(`PlateSolver contract: ${adapterName}`, () => {
    const solveWith = async (result: 'solved' | 'failed') => {
      const rig = await make(result)
      const before = await rig.sourceState()
      const commands: JobCommand[] = []
      const outcome = await rig.solver.solve(rig.program, rig.file, rig.workDir, { run: command => (commands.push(command), rig.io.run(command)) })
      return { rig, before, after: await rig.sourceState(), commands, outcome, leftovers: await rig.leftovers() }
    }

    it('[SKY-001, NFR-018] Given an image the solver places, When solved, Then the field comes back, the program ran with arguments, and nothing is left in the source or work folder', async () => {
      const { rig, before, after, commands, outcome, leftovers } = await solveWith('solved')
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      expect(outcome.field.raDeg).toBeCloseTo(CONTRACT_SOLUTION.raDeg, 2)
      expect(outcome.field.decDeg).toBeCloseTo(CONTRACT_SOLUTION.decDeg, 2)
      expect(outcome.field).toMatchObject({ widthPx: rig.file.widthPx, heightPx: rig.file.heightPx })
      expect(outcome.field.scaleArcsec).toBeGreaterThan(0)
      expect(commands.length).toBeGreaterThan(0)
      for (const c of commands) {
        expect(c.program).toBe(rig.program)
        expect(Array.isArray(c.args)).toBe(true)
        expect(c.args.join(' ')).not.toContain(rig.file.path)
      }
      expect(after).toEqual(before)
      expect(leftovers).toEqual([])
    })

    it('[SKY-001, NFR-018] Given an image the solver cannot place, When solved, Then a plain reason comes back and nothing is left behind', async () => {
      const { before, after, outcome, leftovers } = await solveWith('failed')
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.reason).toMatch(/\.$/)
      expect(after).toEqual(before)
      expect(leftovers).toEqual([])
    })
  })
}

export interface SkySeed {
  targetId: string
  files: { path: string; kind: 'light' | 'master'; dateObs: string | null; exposureSec: number | null; width: number; height: number; wcs?: Record<string, string> }[]
}

export const SKY_SEED: SkySeed = {
  targetId: 'm31',
  files: [
    { path: '/astro/M31/n1/L_001.fit', kind: 'light', dateObs: '2026-10-01T21:00:00', exposureSec: 10, width: 1080, height: 1920 },
    { path: '/astro/M31/n1/L_002.fit', kind: 'light', dateObs: '2026-10-01T21:00:10', exposureSec: 10, width: 1080, height: 1920, wcs: { CRVAL1: '10.68', CRVAL2: '41.27', CRPIX1: '540.5', CRPIX2: '960.5', CD1_1: '-0.000664', CD2_2: '0.000664' } },
    { path: '/astro/M31/stack.fit', kind: 'master', dateObs: null, exposureSec: 10, width: 1080, height: 1920 }
  ]
}

/** Every SolveStore adapter must pass this suite. `make` returns a store holding SKY_SEED and another target's light. */
export function solveStoreContract(adapterName: string, make: () => SolveStore): void {
  describe(`SolveStore contract: ${adapterName}`, () => {
    it("[SKY-003, SKY-004] Given a target's lights and master, When read, Then each comes back with its kind, night time, folder, size and any WCS in its headers", async () => {
      const files = await make().files('m31')
      expect(files.map(f => [f.path, f.kind])).toEqual(SKY_SEED.files.map(f => [f.path, f.kind]))
      const [first, second, master] = files
      expect(first).toMatchObject({ targetId: 'm31', exposureSec: 10, widthPx: 1080, heightPx: 1920, wcs: null, folder: '/astro/M31/n1' })
      expect(first.capturedAt?.toISOString()).toBe('2026-10-01T21:00:00.000Z')
      expect(second.wcs).toMatchObject({ CRVAL1: '10.68', CRVAL2: '41.27', CRPIX1: '540.5', CRPIX2: '960.5' })
      expect(master.capturedAt).toBeNull()
      expect((await make().files()).length).toBe(SKY_SEED.files.length + 1)
    })

    it('[SKY-001] Given a field and a failure, When saved and read, Then both come back by path, and a later save replaces the first', async () => {
      const store = make()
      const field = { raDeg: 10.68, decDeg: 41.27, rotationDeg: -12.5, scaleArcsec: 2.39, widthPx: 1080, heightPx: 1920 }
      await store.save({ path: '/a.fit', field, source: 'astap', solvedAt: new Date('2026-10-09T01:00:00Z'), error: null })
      await store.save({ path: '/b.fit', field: null, source: 'siril', solvedAt: new Date('2026-10-09T01:01:00Z'), error: 'Siril finished without printing a solution.' })
      expect(await store.solves(['/b.fit', '/missing.fit'])).toEqual([
        { path: '/b.fit', field: null, source: 'siril', solvedAt: new Date('2026-10-09T01:01:00Z'), error: 'Siril finished without printing a solution.' }
      ])
      await store.save({ path: '/b.fit', field, source: 'header', solvedAt: new Date('2026-10-09T02:00:00Z'), error: null })
      const all = await store.solves()
      expect(all.map(s => [s.path, s.source])).toEqual([
        ['/a.fit', 'astap'],
        ['/b.fit', 'header']
      ])
      expect(all[0].field).toEqual(field)
    })
  })
}

export const MOSAIC_TARGET: MosaicTarget = { id: 'm31', name: 'M 31', raHours: 0.7123, decDeg: 41.2688, sizeArcmin: 178, goalSec: 21600 }

/** Every MosaicStore adapter must pass this suite. `make` returns a store holding MOSAIC_TARGET and targets m31-p2 and m31-p3. */
export function mosaicStoreContract(adapterName: string, make: () => MosaicStore): void {
  describe(`MosaicStore contract: ${adapterName}`, () => {
    it('[SKY-007] Given a target, When read, Then its position, catalogue size and goal come back', async () => {
      expect(await make().target('m31')).toEqual(MOSAIC_TARGET)
      expect(await make().target('nope')).toBeNull()
    })

    it('[SKY-012] Given a saved plan, When read and saved again, Then the latest comes back and plans are listed', async () => {
      const store = make()
      expect(await store.plan('m31')).toBeNull()
      await store.savePlan({ targetId: 'm31', field: { widthDeg: 0.72, heightDeg: 1.28 }, rotationDeg: 0, overlap: 0.2, savedAt: new Date('2026-10-09T10:00:00Z') })
      await store.savePlan({ targetId: 'm31', field: { widthDeg: 0.72, heightDeg: 1.28 }, rotationDeg: 30, overlap: 0.25, savedAt: new Date('2026-10-09T11:00:00Z') })
      expect(await store.plan('m31')).toEqual({ targetId: 'm31', field: { widthDeg: 0.72, heightDeg: 1.28 }, rotationDeg: 30, overlap: 0.25, savedAt: new Date('2026-10-09T11:00:00Z') })
      expect((await store.plans()).map(p => p.targetId)).toEqual(['m31'])
    })

    it('[SKY-011] Given panels under other targets, When linked twice, Then each is linked once as part of the mosaic, read from either side', async () => {
      const store = make()
      await store.linkPanels('m31', ['m31-p2', 'm31', 'm31-p3'])
      await store.linkPanels('m31', ['m31-p2'])
      expect(await store.linked('m31')).toEqual(['m31-p2', 'm31-p3'])
      expect(await store.linked('m31-p2')).toEqual(['m31'])
    })

    it('[SKY-011] Given a link asked for from one side and then the other, When read, Then there is one link either way round', async () => {
      const store = make()
      await store.linkPanels('m31-p2', ['m31-p3'])
      await store.linkPanels('m31-p3', ['m31-p2'])
      await Promise.all([store.linkPanels('m31', ['m31-p3']), store.linkPanels('m31-p3', ['m31'])])
      expect(await store.linked('m31-p3')).toEqual(['m31', 'm31-p2'])
      expect(await store.linked('m31-p2')).toEqual(['m31-p3'])
      expect(await store.linked('m31')).toEqual(['m31-p3'])
    })
  })
}
