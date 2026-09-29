import { describe, it, expect } from 'vitest'
import type { FrameCatalogue } from '@astro/application'
import type { TargetFrames } from '@astro/domain'

/**
 * Every FrameCatalogue adapter must pass this suite. `make` seeds the adapter
 * with the given targets however its technology needs to.
 */
export function frameCatalogueContract(
  adapterName: string,
  make: (seed: TargetFrames[]) => Promise<FrameCatalogue> | FrameCatalogue
): void {
  const m81: TargetFrames = {
    targetId: 'target-m81',
    targetName: 'M 81',
    subs: [
      { exposureSec: 10, capturedAt: new Date('2026-03-01T21:00:00Z') },
      { exposureSec: 10, capturedAt: new Date('2026-03-01T21:00:10Z') }
    ],
    stacks: [{ producedAt: new Date('2026-03-02T09:00:00Z') }]
  }

  describe(`FrameCatalogue contract: ${adapterName}`, () => {
    it('[NFR-006] Given a target with subs and a stack, When frames are listed, Then both come back with exposure and times intact', async () => {
      const catalogue = await make([m81])
      const [t] = await catalogue.listTargetFrames()
      expect(t.targetId).toBe('target-m81')
      expect(t.targetName).toBe('M 81')
      expect(t.subs.map(s => s.exposureSec)).toEqual([10, 10])
      expect(t.subs.map(s => s.capturedAt?.toISOString()).sort()).toEqual([
        '2026-03-01T21:00:00.000Z',
        '2026-03-01T21:00:10.000Z'
      ])
      expect(t.stacks.map(s => s.producedAt.toISOString())).toEqual(['2026-03-02T09:00:00.000Z'])
    })

    it('[NFR-006] Given a target with no frames, When frames are listed, Then it is left out', async () => {
      const empty: TargetFrames = { targetId: 'target-m1', targetName: 'M 1', subs: [], stacks: [] }
      const catalogue = await make([m81, empty])
      const ids = (await catalogue.listTargetFrames()).map(t => t.targetId)
      expect(ids).toEqual(['target-m81'])
    })
  })
}
