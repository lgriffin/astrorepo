import { describe, it, expect } from 'vitest'
import type { SirilWorkspace } from '@astro/application'

export interface SirilWorkspaceFixture {
  workspace: SirilWorkspace
  /** A source folder holding the named frames. */
  sourceDir: string
  workDir: string
  /** Names of the files now in the source folder, sorted. */
  sourceListing: () => Promise<string[]>
  /** Whether the work area holds this relative path. */
  workHas: (relative: string) => Promise<boolean>
  /** Rewrites a source frame (relative to sourceDir) with new content, as a capture tool would. */
  rewriteSource: (relative: string) => Promise<void>
  /** Joins a relative path onto a directory the way the adapter spells paths. */
  join: (dir: string, relative: string) => string
}

/**
 * Every SirilWorkspace adapter must pass this suite. `setup` creates a source with these frames;
 * a name may include subfolders ("night1/Light_001.fit").
 */
export function sirilWorkspaceContract(adapterName: string, setup: (frames: string[]) => Promise<SirilWorkspaceFixture>): void {
  describe(`SirilWorkspace contract: ${adapterName}`, () => {
    it('[NFR-006] Given a source folder, When frames are listed, Then only FITS files come back, sorted by name', async () => {
      const f = await setup(['Light_002.fit', 'Light_001.fits', 'notes.txt'])
      expect((await f.workspace.listSourceFrames(f.sourceDir)).map(x => x.name)).toEqual(['Light_001.fits', 'Light_002.fit'])
    })

    it('[NFR-006] Given prepared folders, When a frame is placed twice, Then it lands once and the second time reports existing', async () => {
      const f = await setup(['Light_001.fit'])
      await f.workspace.prepareFolders(f.workDir)
      const [frame] = await f.workspace.listSourceFrames(f.sourceDir)
      const placement = { from: frame.path, folder: 'lights' as const, name: frame.name }
      expect(['linked', 'copied']).toContain(await f.workspace.place(placement, f.workDir))
      expect(await f.workspace.place(placement, f.workDir)).toBe('existing')
      expect(await f.workHas('lights/Light_001.fit')).toBe(true)
    })

    it('[GRD-007] Given frames placed by an earlier run, When rejected ones are removed, Then only those go and the source keeps every frame', async () => {
      const f = await setup(['Light_001.fit', 'Light_002.fit', 'Light_003.fit'])
      await f.workspace.prepareFolders(f.workDir)
      for (const frame of await f.workspace.listSourceFrames(f.sourceDir)) {
        await f.workspace.place({ from: frame.path, folder: 'lights', name: frame.name }, f.workDir)
      }
      expect(await f.workspace.remove(f.workDir, 'lights', ['Light_002.fit', 'Light_009.fit'])).toEqual(['Light_002.fit'])
      expect(await f.workHas('lights/Light_002.fit')).toBe(false)
      expect(await f.workHas('lights/Light_001.fit')).toBe(true)
      expect(await f.workHas('lights/Light_003.fit')).toBe(true)
      expect(await f.sourceListing()).toEqual(['Light_001.fit', 'Light_002.fit', 'Light_003.fit'])
    })

    it('[GRD-007] Given a work folder not made yet, When removing from it, Then nothing is removed and nothing is created', async () => {
      const f = await setup(['Light_001.fit'])
      expect(await f.workspace.remove(f.join(f.workDir, 'never'), 'lights', ['Light_001.fit'])).toEqual([])
      expect(await f.workHas('never')).toBe(false)
    })

    it('[ING-013] Given frames in session subfolders, When listed, Then they are found, and a darks folder marks its frames as darks', async () => {
      const f = await setup(['night1/Light_001.fit', 'night2/Light_001.fit', 'night2/darks/d1.fit'])
      const frames = await f.workspace.listSourceFrames(f.sourceDir)
      expect(frames.map(x => x.name).sort()).toEqual(['Light_001.fit', 'Light_001.fit', 'd1.fit'])
      expect(frames.find(x => x.name === 'd1.fit')?.imageType).toMatch(/dark/i)
    })

    it('[ING-013] Given a frame placed earlier, When its source is rewritten and it is placed again, Then the stale copy is replaced', async () => {
      const f = await setup(['Light_001.fit'])
      await f.workspace.prepareFolders(f.workDir)
      const [frame] = await f.workspace.listSourceFrames(f.sourceDir)
      const placement = { from: frame.path, folder: 'lights' as const, name: frame.name }
      await f.workspace.place(placement, f.workDir)
      await f.rewriteSource('Light_001.fit')
      expect(['linked', 'copied']).toContain(await f.workspace.place(placement, f.workDir))
      expect(await f.workspace.place(placement, f.workDir)).toBe('existing')
    })

    it('[PRV-005] Given frames placed, When the input folders are read, Then each frame comes back once, and a rewritten source reads differently once placed again', async () => {
      const f = await setup(['Light_001.fit', 'Light_002.fit'])
      await f.workspace.prepareFolders(f.workDir)
      const frames = await f.workspace.listSourceFrames(f.sourceDir)
      const placements = frames.map(x => ({ from: x.path, folder: 'lights' as const, name: x.name }))
      for (const p of placements) await f.workspace.place(p, f.workDir)
      const first = await f.workspace.inputFrames(f.workDir)
      expect(first.map(x => `${x.folder}/${x.name}`)).toEqual(['lights/Light_001.fit', 'lights/Light_002.fit'])
      await f.rewriteSource('Light_001.fit')
      await f.workspace.place(placements.find(p => p.name === 'Light_001.fit') as (typeof placements)[number], f.workDir)
      const second = await f.workspace.inputFrames(f.workDir)
      const sig = (xs: typeof first) => xs.map(x => `${x.name}:${x.sizeBytes}:${x.modifiedAt?.getTime()}`)
      expect(sig(second)[0]).not.toBe(sig(first)[0])
      expect(sig(second)[1]).toBe(sig(first)[1])
    })

    it('[PRV-005] Given a work folder not made yet, When its input folders are read, Then there are none and nothing is created', async () => {
      const f = await setup([])
      expect(await f.workspace.inputFrames(f.workDir)).toEqual([])
      expect(await f.workHas('')).toBe(false)
    })

    it('[ING-001] Given folders, When containment is checked, Then a folder contains itself and its subfolders but not its siblings', async () => {
      const f = await setup(['Light_001.fit'])
      expect(await f.workspace.contains(f.sourceDir, f.sourceDir)).toBe(true)
      expect(await f.workspace.contains(f.sourceDir, f.join(f.sourceDir, 'work/siril'))).toBe(true)
      expect(await f.workspace.contains(f.sourceDir, f.workDir)).toBe(false)
      expect(await f.workspace.contains(f.join(f.sourceDir, 'night1'), f.sourceDir)).toBe(false)
    })

    it('[ING-001] Given frames placed in the work area, When done, Then the source folder lists exactly what it did before', async () => {
      const f = await setup(['Light_001.fit', 'Dark_001.fit'])
      const before = await f.sourceListing()
      await f.workspace.prepareFolders(f.workDir)
      for (const frame of await f.workspace.listSourceFrames(f.sourceDir)) {
        await f.workspace.place({ from: frame.path, folder: 'lights', name: frame.name }, f.workDir)
      }
      expect(await f.sourceListing()).toEqual(before)
    })

    it('[RCP-002] Given source frames, When their details are read, Then one comes back per path, in order, with a size', async () => {
      const f = await setup(['Light_002.fit', 'Light_001.fit'])
      const frames = await f.workspace.listSourceFrames(f.sourceDir)
      const details = await f.workspace.frameDetails(frames.map(x => x.path).reverse())
      expect(details.map(d => d.path)).toEqual(frames.map(x => x.path).reverse())
      expect(details.every(d => d.sizeBytes >= 0)).toBe(true)
    })

    it('[NFR-010] Given a work folder not made yet, When its space is read, Then nothing is used there and nothing is created', async () => {
      const f = await setup(['Light_001.fit'])
      const before = await f.sourceListing()
      const space = await f.workspace.workAreaSpace(f.workDir)
      expect(space.usedBytes).toBe(0)
      expect(space.freeBytes === null || space.freeBytes > 0).toBe(true)
      expect(await f.workHas('lights')).toBe(false)
      expect(await f.sourceListing()).toEqual(before)
    })

    it('[PPR-001] Given a work folder not made yet, When stack results are read, Then there are none and nothing is created', async () => {
      const f = await setup(['Light_001.fit'])
      expect(await f.workspace.stackResults(f.workDir)).toEqual([])
      expect(await f.workHas('lights')).toBe(false)
    })

    it('[RCP-002] Given frames already placed, When the copy is estimated, Then they cost nothing and nothing is written', async () => {
      const f = await setup(['Light_001.fit'])
      const [frame] = await f.workspace.listSourceFrames(f.sourceDir)
      const placement = { from: frame.path, folder: 'lights' as const, name: frame.name }
      expect(await f.workspace.copyBytes([placement], f.workDir)).toBeGreaterThanOrEqual(0)
      expect(await f.workHas('lights')).toBe(false)
      await f.workspace.prepareFolders(f.workDir)
      await f.workspace.place(placement, f.workDir)
      expect(await f.workspace.copyBytes([placement], f.workDir)).toBe(0)
    })
  })
}
