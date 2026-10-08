import { describe, it, expect } from 'vitest'
import { ScanPacer, ScanCancelled } from '../../src/main/services/scan-pacer'

function fakeTime() {
  const t = { now: 0, slept: [] as number[] }
  return {
    t,
    now: () => t.now,
    sleep: async (ms: number) => { t.slept.push(ms); t.now += ms }
  }
}

describe('ScanPacer', () => {
  it('[NFR-013] Given work shorter than a slice, When it checks in, Then it does not rest', async () => {
    const { t, now, sleep } = fakeTime()
    const pacer = new ScanPacer(undefined, { sliceMs: 25, dutyCycle: 0.5 }, now, sleep)
    t.now = 10
    await pacer.checkpoint()
    expect(t.slept).toEqual([])
  })

  it('[NFR-013] Given a used-up slice, When it checks in, Then it rests and starts a new slice', async () => {
    const { t, now, sleep } = fakeTime()
    const pacer = new ScanPacer(undefined, { sliceMs: 25, dutyCycle: 0.5 }, now, sleep)
    t.now = 30
    await pacer.checkpoint()
    t.now += 10
    await pacer.checkpoint()
    expect(t.slept).toEqual([30])
  })

  it('[ING-014] Given a cancelled scan, When it checks in, Then it stops', async () => {
    const abort = new AbortController()
    const { now, sleep } = fakeTime()
    const pacer = new ScanPacer(abort.signal, { sliceMs: 25, dutyCycle: 0.5 }, now, sleep)
    await pacer.checkpoint()
    abort.abort()
    expect(pacer.cancelled).toBe(true)
    await expect(pacer.checkpoint()).rejects.toBeInstanceOf(ScanCancelled)
  })

  it('[ING-014] Given a scan cancelled while resting, When the rest ends, Then it stops', async () => {
    const abort = new AbortController()
    const { t, now } = fakeTime()
    const pacer = new ScanPacer(abort.signal, { sliceMs: 25, dutyCycle: 0.5 }, now, async ms => { t.now += ms; abort.abort() })
    t.now = 30
    await expect(pacer.checkpoint()).rejects.toBeInstanceOf(ScanCancelled)
  })

  it('[NFR-013] Given the real clock, When a slice is used up, Then other work runs before the scan carries on', async () => {
    const pacer = new ScanPacer(undefined, { sliceMs: 0, dutyCycle: 0.5 })
    let ran = false
    setTimeout(() => { ran = true }, 0)
    await pacer.checkpoint()
    expect(ran).toBe(true)
  })
})
