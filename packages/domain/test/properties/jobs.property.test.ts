import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  MAX_JOB_ATTEMPTS,
  afterInterruption,
  estimateJobSeconds,
  formatClock,
  parseClock,
  queueOrder,
  restAfter,
  scheduleJobs,
  windowState,
  type Job,
  type JobKind,
  type JobRun
} from '@astro/domain'
import { propertyParams } from './arbitraries'

const minute = fc.integer({ min: 0, max: 1439 })
const kind = fc.constantFrom('stack', 'post-process', 'syqon', 'solve') as fc.Arbitrary<JobKind>
/** A local time on some day, to the minute, as the scheduler sees the clock. */
const localNow = fc.tuple(fc.integer({ min: 0, max: 3000 }), minute, fc.integer({ min: 0, max: 59 })).map(([day, m, s]) => new Date(2026, 0, 1 + day, Math.floor(m / 60), m % 60, s))
const minuteOf = (d: Date) => d.getHours() * 60 + d.getMinutes()
const inWindow = (m: number, start: number, end: number) => (start === end ? true : start < end ? m >= start && m < end : m >= start || m < end)

describe('clock times', () => {
  it('[JOB-012, FUZ-006] Given any minute of the day, When it is written and read back, Then it is the same minute; and any whole number of days later writes the same', () => {
    fc.assert(
      fc.property(minute, fc.integer({ min: -5, max: 5 }), (m, days) => {
        expect(parseClock(formatClock(m))).toBe(m)
        expect(formatClock(m + days * 1440)).toBe(formatClock(m))
        expect(formatClock(m)).toMatch(/^\d{2}:\d{2}$/)
      }),
      propertyParams()
    )
  })

  it('[JOB-012, FUZ-006] Given hours and minutes written with or without a leading zero and spaces around, When read, Then they are that many minutes after midnight, and out-of-range ones are not a time', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }), fc.boolean(), fc.constantFrom('', ' ', '\t'), (h, m, pad, space) => {
        const text = `${space}${pad ? String(h).padStart(2, '0') : h}:${String(m).padStart(2, '0')}${space}`
        expect(parseClock(text)).toBe(h < 24 && m < 60 ? h * 60 + m : null)
      }),
      propertyParams()
    )
  })
})

describe('the run window', () => {
  it('[JOB-002, FUZ-006] Given any window and moment, When the window is checked, Then it is open exactly when the minute falls inside it, and a closed window opens later and closes after it opens', () => {
    fc.assert(
      fc.property(localNow, minute, minute, (now, start, end) => {
        const w = windowState(now, { windowStart: start, windowEnd: end })
        expect(w.open).toBe(inWindow(minuteOf(now), start, end))
        if (start === end) {
          expect(w).toMatchObject({ closesAt: null, lengthSeconds: null })
          return
        }
        expect(w.lengthSeconds).toBe((((end - start) % 1440) + 1440) % 1440 * 60)
        expect(w.closesAt!.getTime()).toBeGreaterThan(now.getTime() - 60_000)
        if (w.open) expect(w.opensAt).toBe(now)
        else {
          expect(w.opensAt.getTime()).toBeGreaterThan(now.getTime())
          expect(minuteOf(w.opensAt)).toBe(start)
          expect(w.closesAt!.getTime()).toBeGreaterThan(w.opensAt.getTime())
        }
      }),
      propertyParams()
    )
  })
})

describe('the scheduler', () => {
  const job = (i: number, over: Partial<Job>): Job => ({
    id: `j${i}`,
    kind: 'stack',
    targetId: 't',
    title: `Job ${i}`,
    timing: 'window',
    state: 'queued',
    command: { program: 'siril-cli', args: [], cwd: '/w' },
    prepare: null,
    spaceDir: '/w',
    neededBytes: 0,
    queuedAt: new Date(2026, 0, 1, 0, i),
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    note: null,
    attempts: 0,
    progress: null,
    ...over
  })
  const jobs = fc.array(
    fc.record({
      kind,
      timing: fc.constantFrom('window', 'now') as fc.Arbitrary<'window' | 'now'>,
      state: fc.constantFrom('queued', 'queued', 'queued', 'running', 'succeeded', 'failed') as fc.Arbitrary<Job['state']>,
      neededBytes: fc.nat({ max: 2 ** 36 }),
      queuedMinute: fc.nat({ max: 10_000 }),
      free: fc.option(fc.nat({ max: 2 ** 36 }), { nil: null })
    }),
    { maxLength: 12 }
  )
  const input = fc.record({
    now: localNow,
    windowStart: minute,
    windowEnd: minute,
    idleMinutes: fc.integer({ min: 0, max: 60 }),
    maxCpuPercent: fc.integer({ min: 1, max: 100 }),
    userIdleSeconds: fc.option(fc.nat({ max: 7200 }), { nil: null }),
    cpuPercent: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    list: jobs
  })

  it('[JOB-004, JOB-002, JOB-007, JOB-011, FUZ-006] Given any queue and machine, When the scheduler runs, Then at most one queued job starts, none while another runs, never short of space, and a window job only inside the window', () => {
    fc.assert(
      fc.property(input, i => {
        const list = i.list.map((j, n) => job(n, { kind: j.kind, timing: j.timing, state: j.state, neededBytes: j.neededBytes, queuedAt: new Date(2026, 0, 1, 0, j.queuedMinute) }))
        const freeBytes = Object.fromEntries(i.list.map((j, n) => [`j${n}`, j.free]))
        const settings = { windowStart: i.windowStart, windowEnd: i.windowEnd, idleMinutes: i.idleMinutes, maxCpuPercent: i.maxCpuPercent }
        const s = scheduleJobs({ now: i.now, settings, jobs: list, history: [], load: { userIdleSeconds: i.userIdleSeconds, cpuPercent: i.cpuPercent }, freeBytes })
        expect(s.queue.map(q => q.jobId)).toEqual(queueOrder(list).map(j => j.id))
        expect(s.queue.filter(q => q.wait === null).map(q => q.jobId)).toEqual(s.start === null ? [] : [s.start])
        if (list.some(j => j.state === 'running')) expect(s.start).toBeNull()
        if (s.start === null) return
        const started = list.find(j => j.id === s.start)!
        expect(started.state).toBe('queued')
        expect(freeBytes[started.id]).not.toBeNull()
        expect(started.neededBytes).toBeLessThanOrEqual(freeBytes[started.id] as number)
        if (started.timing === 'window') expect(inWindow(minuteOf(i.now), i.windowStart, i.windowEnd)).toBe(true)
      }),
      propertyParams()
    )
  })

  it('[JOB-004, FUZ-006] Given any jobs, When put in queue order, Then only queued jobs are listed, Run now first, each group in the order queued', () => {
    fc.assert(
      fc.property(jobs, raw => {
        const list = raw.map((j, n) => job(n, { timing: j.timing, state: j.state, queuedAt: new Date(2026, 0, 1, 0, j.queuedMinute) }))
        const order = queueOrder(list)
        expect(order.length).toBe(list.filter(j => j.state === 'queued').length)
        const firstWindow = order.findIndex(j => j.timing === 'window')
        if (firstWindow >= 0) expect(order.slice(firstWindow).every(j => j.timing === 'window')).toBe(true)
        for (let k = 1; k < order.length; k++) {
          if (order[k].timing === order[k - 1].timing) expect(order[k].queuedAt.getTime()).toBeGreaterThanOrEqual(order[k - 1].queuedAt.getTime())
        }
      }),
      propertyParams()
    )
  })
})

describe('job estimates and restarts', () => {
  const history: fc.Arbitrary<JobRun[]> = fc.array(fc.record({ kind, neededBytes: fc.nat({ max: 2 ** 36 }), seconds: fc.nat({ max: 100_000 }) }), { maxLength: 10 })

  it('[JOB-006, FUZ-006] Given any history, When a job is estimated, Then it takes at least a minute and a bigger job never takes less', () => {
    fc.assert(
      fc.property(kind, fc.nat({ max: 2 ** 36 }), fc.nat({ max: 2 ** 36 }), history, (k, bytes, more, runs) => {
        const small = estimateJobSeconds(k, bytes, runs)
        expect(small.seconds).toBeGreaterThanOrEqual(60)
        expect(Number.isInteger(small.seconds)).toBe(true)
        expect(estimateJobSeconds(k, bytes + more, runs).seconds).toBeGreaterThanOrEqual(small.seconds)
      }),
      propertyParams()
    )
  })

  it('[JOB-008, FUZ-006] Given a job interrupted any number of times, When the app starts again, Then it is queued again until it has started the most times allowed, and failed after', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10 }), attempts => {
        expect(afterInterruption({ attempts }).state).toBe(attempts >= MAX_JOB_ATTEMPTS ? 'failed' : 'queued')
      }),
      propertyParams()
    )
  })

  it('[NFR-013, FUZ-006] Given any slice of work, When the scan rests after it, Then a slice under the limit needs no rest and a longer one rests so the work is no more than the duty cycle', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100_000 }), fc.integer({ min: 1, max: 1000 }), fc.double({ min: 0.01, max: 1, noNaN: true }), (busy, slice, duty) => {
        const rest = restAfter(busy, { sliceMs: slice, dutyCycle: duty })
        if (busy < slice) expect(rest).toBe(0)
        else expect(busy / (busy + rest)).toBeLessThanOrEqual(duty + 1e-9)
      }),
      propertyParams()
    )
  })
})
