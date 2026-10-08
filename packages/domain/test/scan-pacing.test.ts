import { describe, it, expect } from 'vitest'
import { GENTLE_SCAN, restAfter } from '@astro/domain'

describe('restAfter', () => {
  it('[NFR-013] Given less work than a slice, When asked, Then the scan carries on without resting', () => {
    expect(restAfter(10, { sliceMs: 25, dutyCycle: 0.4 })).toBe(0)
  })

  it('[NFR-013] Given a used-up slice, When asked, Then the rest keeps the work to its share of the time', () => {
    expect(restAfter(40, { sliceMs: 25, dutyCycle: 0.4 })).toBe(60)
    expect(restAfter(25, { sliceMs: 25, dutyCycle: 0.5 })).toBe(25)
  })

  it('[NFR-013] Given a duty cycle out of range, When asked, Then it is held between 1% and all of the time', () => {
    expect(restAfter(30, { sliceMs: 25, dutyCycle: 2 })).toBe(0)
    expect(restAfter(30, { sliceMs: 25, dutyCycle: 0 })).toBe(2970)
  })

  it('[NFR-013] Given the default pacing, When a scan works, Then it uses under half the time in short slices', () => {
    expect(GENTLE_SCAN.sliceMs).toBeLessThanOrEqual(50)
    expect(GENTLE_SCAN.dutyCycle).toBeLessThan(0.5)
  })
})
