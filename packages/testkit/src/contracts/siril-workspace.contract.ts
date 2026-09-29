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
}

/** Every SirilWorkspace adapter must pass this suite. `setup` creates a source with these frames. */
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

    it('[ING-001] Given frames placed in the work area, When done, Then the source folder lists exactly what it did before', async () => {
      const f = await setup(['Light_001.fit', 'Dark_001.fit'])
      const before = await f.sourceListing()
      await f.workspace.prepareFolders(f.workDir)
      for (const frame of await f.workspace.listSourceFrames(f.sourceDir)) {
        await f.workspace.place({ from: frame.path, folder: 'lights', name: frame.name }, f.workDir)
      }
      expect(await f.sourceListing()).toEqual(before)
    })
  })
}
