import { describe, expect, it } from 'vitest'
import type { MemoryProbe } from '@astro/application'

export interface MemoryProbeHarness {
  /** A probe of a PC that says how much memory it has. */
  live(): MemoryProbe
  /** A probe of a system that will not say. */
  silent(): MemoryProbe
}

/**
 * Every MemoryProbe adapter must pass this suite. The stack estimate compares what Siril needs with
 * the free memory and the total, and says the fit is unknown when the probe gives null rather
 * than a guess.
 */
export function memoryProbeContract(adapterName: string, harness: MemoryProbeHarness): void {
  describe(`MemoryProbe contract: ${adapterName}`, () => {
    it('[NFR-006] [ADV-002] Given a PC, When its memory is read, Then the total is positive and no more is free than exists', async () => {
      const m = await harness.live().read()
      expect(m).not.toBeNull()
      expect(m?.totalBytes).toBeGreaterThan(0)
      expect(m?.availableBytes).toBeGreaterThanOrEqual(0)
      expect(m?.availableBytes).toBeLessThanOrEqual(m?.totalBytes ?? 0)
    })

    it('[NFR-006] [ADV-001] Given a system that will not say, When its memory is read, Then it is null rather than zero', async () => {
      expect(await harness.silent().read()).toBeNull()
    })
  })
}
