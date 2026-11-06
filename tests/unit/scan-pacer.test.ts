import { describe, it, expect } from 'vitest'
import { ScanPacer, ScanCancelled, inFlight, mainProcessBusyMs, FILES_IN_FLIGHT } from '../../src/main/services/scan-pacer'

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

  it('[NFR-022] Given a long wait on the disk with the main process idle, When the scan checks in, Then it does not rest', async () => {
    // The busy clock stands still while the disk is waited on, however long the wall clock runs.
    const { t, now, sleep } = fakeTime()
    const pacer = new ScanPacer(undefined, { sliceMs: 25, dutyCycle: 0.4 }, now, sleep)
    await new Promise(resolve => setTimeout(resolve, 60))
    t.now = 5
    await pacer.checkpoint()
    expect(t.slept).toEqual([])
  })

  it('[NFR-022] Given the main process idle while a wait runs, When its busy time is measured, Then the wait is not counted', async () => {
    const before = mainProcessBusyMs()
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(mainProcessBusyMs() - before).toBeLessThan(50)
  })

  it('[NFR-022] Given work that waits, When run in flight, Then at most four pieces run at once and they overlap', async () => {
    let running = 0
    let most = 0
    const done: number[] = []
    await inFlight(20, FILES_IN_FLIGHT, async k => {
      running++
      most = Math.max(most, running)
      await new Promise(resolve => setTimeout(resolve, 2))
      running--
      done.push(k)
    }, new ScanPacer())
    expect(FILES_IN_FLIGHT).toBe(4)
    expect(most).toBe(4)
    expect(done.sort((a, b) => a - b)).toEqual([...Array(20).keys()])
  })

  it('[ING-014] Given a cancel while pieces are in flight, When they settle, Then the pieces under way finish, no new one starts and the cancel is thrown', async () => {
    const abort = new AbortController()
    const finished: number[] = []
    const run = inFlight(20, 4, async k => {
      if (k === 5) abort.abort()
      await new Promise(resolve => setTimeout(resolve, 2))
      finished.push(k)
    }, new ScanPacer(abort.signal))
    await expect(run).rejects.toBeInstanceOf(ScanCancelled)
    expect(finished).toContain(5)
    expect(finished.length).toBeLessThan(10)
    const settled = finished.length
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(finished.length).toBe(settled)
  })

  it('[NFR-022] Given nothing to do, When run in flight, Then it settles at once', async () => {
    await expect(inFlight(0, 4, async () => { throw new Error('never') }, new ScanPacer())).resolves.toBeUndefined()
  })
})
