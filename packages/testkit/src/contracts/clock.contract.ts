import { describe, expect, it } from 'vitest'
import type { Clock } from '@astro/application'

export interface ClockHarness {
  clock: Clock
  /** Lets this many milliseconds go by. */
  pass(ms: number): Promise<void>
}

/**
 * Every Clock adapter must pass this suite. Use cases keep the Date they are given (a job's start
 * and finish, a dismissal, a measurement) and subtract readings for how long a step took.
 */
export function clockContract(adapterName: string, make: () => ClockHarness): void {
  describe(`Clock contract: ${adapterName}`, () => {
    it('[NFR-006] [JOB-009] Given a reading kept by a use case, When it is changed, Then the clock is not', async () => {
      const { clock } = make()
      const first = clock.now()
      expect(Number.isNaN(first.getTime())).toBe(false)
      const kept = first.getTime()
      first.setFullYear(1990)
      expect(clock.now().getTime()).toBeGreaterThanOrEqual(kept)
    })

    it('[NFR-006] [JOB-009] Given time passing, When read again, Then the clock has moved on by about that much and never goes back', async () => {
      const h = make()
      const start = h.clock.now().getTime()
      await h.pass(20)
      const later = h.clock.now().getTime()
      // Timers may fire a little early.
      expect(later - start).toBeGreaterThanOrEqual(15)
      expect(later - start).toBeLessThan(5000)
      let last = later
      for (let i = 0; i < 100; i++) {
        const now = h.clock.now().getTime()
        expect(now).toBeGreaterThanOrEqual(last)
        last = now
      }
    })
  })
}
