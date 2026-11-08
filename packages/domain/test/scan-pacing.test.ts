import { describe, it, expect } from 'vitest'
import { GENTLE_SCAN, TIME_LEFT_AFTER, readingSecondsLeft, restAfter } from '@astro/domain'

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

describe('readingSecondsLeft', () => {
  it('[ING-016] Given a steady pace, When asked part way, Then the time left is the rest of the files at that pace', () => {
    // 1,000 of 20,000 read in 50 s: 19,000 more at 20 a second.
    expect(readingSecondsLeft(1000, 20000, 50_000)).toBe(950)
    expect(readingSecondsLeft(100, 101, 10_000)).toBe(1)
  })

  it('[ING-016] Given too little read to tell, When asked, Then it does not guess', () => {
    expect(readingSecondsLeft(TIME_LEFT_AFTER.files - 1, 1000, 60_000)).toBeNull()
    expect(readingSecondsLeft(500, 1000, TIME_LEFT_AFTER.seconds * 1000 - 1)).toBeNull()
    expect(readingSecondsLeft(TIME_LEFT_AFTER.files, 1000, TIME_LEFT_AFTER.seconds * 1000)).not.toBeNull()
  })

  it('[ING-016] Given everything read, When asked, Then there is no time left to show', () => {
    expect(readingSecondsLeft(1000, 1000, 60_000)).toBeNull()
    expect(readingSecondsLeft(1200, 1000, 60_000)).toBeNull()
  })
})
