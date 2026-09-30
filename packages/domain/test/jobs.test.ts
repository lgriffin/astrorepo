import { describe, expect, it } from 'vitest'
import {
  afterInterruption,
  DEFAULT_JOB_SETTINGS,
  estimateJobSeconds,
  formatClock,
  GUESS_SECONDS_PER_GB,
  JOB_SETTING_KEYS,
  parseClock,
  parseJobSettings,
  postProcessCommand,
  queueOrder,
  scheduleJobs,
  sirilStackCommand,
  windowState,
  type Job,
  type JobSettings,
  type ScheduleInput
} from '@astro/domain'

const GB = 1024 ** 3
/** Local time on 30 September 2026, so the tests hold in any time zone. */
const local = (h: number, m = 0, day = 30) => new Date(2026, 8, day, h, m)

let n = 0
function job(over: Partial<Job> = {}): Job {
  n++
  return {
    id: `j${n}`,
    kind: 'stack',
    targetId: 'm42',
    title: 'Stack M 42',
    timing: 'window',
    state: 'queued',
    command: { program: 'siril-cli', args: [], cwd: '/work' },
    prepare: null,
    spaceDir: '/work',
    neededBytes: 10 * GB,
    queuedAt: local(12, n),
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    note: null,
    attempts: 0,
    ...over
  }
}

/** Every job's disk has plenty of room unless the test says otherwise. */
const input = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  now: local(2, 5),
  settings: DEFAULT_JOB_SETTINGS,
  jobs: [],
  history: [],
  load: { userIdleSeconds: 3600, cpuPercent: 5 },
  ...over,
  freeBytes: over.freeBytes ?? Object.fromEntries((over.jobs ?? []).map(j => [j.id, 1000 * GB]))
})

describe('run window', () => {
  it('[JOB-002] Given the 02:00 to 03:00 window, When it is 02:30, Then the window is open and closes at 03:00', () => {
    const w = windowState(local(2, 30), DEFAULT_JOB_SETTINGS)
    expect(w).toMatchObject({ open: true, lengthSeconds: 3600 })
    expect(w.closesAt).toEqual(local(3))
  })

  it('[JOB-002] Given the 02:00 to 03:00 window, When it is 01:00 or 14:00, Then it opens at the next 02:00', () => {
    expect(windowState(local(1), DEFAULT_JOB_SETTINGS)).toMatchObject({ open: false, opensAt: local(2), closesAt: local(3) })
    expect(windowState(local(14), DEFAULT_JOB_SETTINGS)).toMatchObject({ open: false, opensAt: local(2, 0, 31), closesAt: local(3, 0, 31) })
    expect(windowState(local(3), DEFAULT_JOB_SETTINGS).open).toBe(false)
  })

  it('[JOB-002] Given a window that runs past midnight, When checked either side of midnight and in the day, Then it is open only between its times', () => {
    const late: JobSettings = { ...DEFAULT_JOB_SETTINGS, windowStart: 23 * 60, windowEnd: 60 }
    expect(windowState(local(23, 30), late)).toMatchObject({ open: true, closesAt: local(1, 0, 31), lengthSeconds: 7200 })
    expect(windowState(local(0, 30), late)).toMatchObject({ open: true, closesAt: local(1) })
    expect(windowState(local(12), late)).toMatchObject({ open: false, opensAt: local(23), closesAt: local(1, 0, 31) })
  })

  it('[JOB-002] Given a window whose start and end are the same, When checked, Then it is open all day with no close', () => {
    expect(windowState(local(12), { windowStart: 0, windowEnd: 0 })).toMatchObject({ open: true, closesAt: null, lengthSeconds: null })
  })
})

describe('settings', () => {
  it('[JOB-012] Given saved settings, When parsed, Then each is read, and a missing or out-of-range one falls back to its default', () => {
    const saved: Record<string, string> = {
      [JOB_SETTING_KEYS.windowStart]: '1:30',
      [JOB_SETTING_KEYS.windowEnd]: '04:15',
      [JOB_SETTING_KEYS.idleMinutes]: '0',
      [JOB_SETTING_KEYS.maxCpuPercent]: '250'
    }
    expect(parseJobSettings(k => saved[k] ?? null)).toEqual({ windowStart: 90, windowEnd: 255, idleMinutes: 0, maxCpuPercent: 30 })
    expect(parseJobSettings(() => null)).toEqual(DEFAULT_JOB_SETTINGS)
    expect(parseJobSettings(k => (k === JOB_SETTING_KEYS.idleMinutes ? ' ' : 'nonsense'))).toEqual(DEFAULT_JOB_SETTINGS)
  })

  it('[JOB-012] Given clock times, When parsed and formatted, Then 24-hour times round-trip and others are refused', () => {
    expect(parseClock('02:00')).toBe(120)
    expect(parseClock('24:00')).toBeNull()
    expect(parseClock('2:60')).toBeNull()
    expect(parseClock(undefined)).toBeNull()
    expect(formatClock(120)).toBe('02:00')
    expect(formatClock(-60)).toBe('23:00')
  })
})

describe('estimates', () => {
  it('[JOB-006] Given no history, When a job is estimated, Then the first-run guess per GB is used, never below a minute', () => {
    expect(estimateJobSeconds('stack', 10 * GB, [])).toEqual({ seconds: 10 * GUESS_SECONDS_PER_GB.stack, basis: 'guess' })
    expect(estimateJobSeconds('post-process', 1024, [])).toEqual({ seconds: 60, basis: 'guess' })
  })

  it('[JOB-006] Given earlier runs, When a job is estimated, Then the rate of the last five runs of the same kind is used', () => {
    const history = [
      { kind: 'stack' as const, neededBytes: 10 * GB, seconds: 99_999 },
      ...Array.from({ length: 5 }, () => ({ kind: 'stack' as const, neededBytes: 10 * GB, seconds: 600 })),
      { kind: 'post-process' as const, neededBytes: GB, seconds: 5000 },
      { kind: 'stack' as const, neededBytes: 0, seconds: 10 }
    ]
    expect(estimateJobSeconds('stack', 20 * GB, history)).toEqual({ seconds: 1200, basis: 'history' })
  })
})

describe('scheduling', () => {
  it('[JOB-004] Given queued jobs, When ordered, Then Run now jobs lead and the rest keep the order they were queued', () => {
    const a = job({ queuedAt: local(10) })
    const b = job({ queuedAt: local(9) })
    const c = job({ queuedAt: local(11), timing: 'now' })
    const done = job({ state: 'succeeded' })
    expect(queueOrder([a, b, c, done]).map(j => j.id)).toEqual([c.id, b.id, a.id])
  })

  it('[JOB-002] Given a window job, When it is outside the window, Then nothing starts and it waits for the window', () => {
    const j = job()
    const s = scheduleJobs(input({ now: local(14), jobs: [j] }))
    expect(s.start).toBeNull()
    expect(s.queue[0].wait).toEqual({ code: 'window', opensAt: local(2, 0, 31) })
  })

  it('[JOB-003] Given the window is open, When the PC was used recently or the CPU is busy, Then the job waits and says which', () => {
    const j = job()
    expect(scheduleJobs(input({ jobs: [j], load: { userIdleSeconds: 120, cpuPercent: 5 } })).queue[0].wait).toEqual({ code: 'idle', idleMinutes: 10, idleSeconds: 120 })
    expect(scheduleJobs(input({ jobs: [j], load: { userIdleSeconds: 3600, cpuPercent: 80 } })).queue[0].wait).toEqual({ code: 'cpu', maxCpuPercent: 30, cpuPercent: 80 })
  })

  it('[JOB-003] Given the machine will not report its load, When the window is open, Then the job starts', () => {
    const j = job()
    expect(scheduleJobs(input({ jobs: [j], load: { userIdleSeconds: null, cpuPercent: null } })).start).toBe(j.id)
  })

  it('[JOB-004] Given two window jobs and an idle PC in the window, When scheduled, Then only the oldest starts and the other waits behind it', () => {
    const first = job({ neededBytes: GB })
    const second = job({ neededBytes: GB })
    const s = scheduleJobs(input({ jobs: [second, first] }))
    expect(s.start).toBe(first.id)
    expect(s.queue.map(q => q.wait?.code ?? null)).toEqual([null, 'behind'])
  })

  it('[JOB-004] Given a job is running, When scheduled, Then nothing else starts, whatever its timing', () => {
    const s = scheduleJobs(input({ jobs: [job({ state: 'running' }), job({ timing: 'now' })] }))
    expect(s.start).toBeNull()
    expect(s.queue[0].wait).toEqual({ code: 'running' })
  })

  it('[JOB-011] Given a Run now job, When it is outside the window and the PC is busy, Then it starts anyway', () => {
    const j = job({ timing: 'now' })
    expect(scheduleJobs(input({ now: local(14), jobs: [j], load: { userIdleSeconds: 0, cpuPercent: 99 } })).start).toBe(j.id)
  })

  it('[JOB-007] Given a job whose disk is short, When scheduled, Then it waits with the shortfall and the next job may start', () => {
    const big = job({ neededBytes: 10 * GB })
    const small = job({ neededBytes: GB })
    const s = scheduleJobs(input({ jobs: [big, small], freeBytes: { [big.id]: 4 * GB, [small.id]: 4 * GB } }))
    expect(s.queue[0].wait).toEqual({ code: 'space', shortBytes: 6 * GB })
    expect(s.start).toBe(small.id)
  })

  it('[JOB-007] Given a disk that will not report its free space, When scheduled, Then the job waits rather than risk running out, even for Run now', () => {
    const unknown = job({ timing: 'now' })
    const known = job()
    const s = scheduleJobs(input({ jobs: [unknown, known], freeBytes: { [unknown.id]: null, [known.id]: 100 * GB } }))
    expect(s.queue[0].wait).toEqual({ code: 'space-unknown' })
    expect(s.start).toBe(known.id)
    expect(scheduleJobs(input({ jobs: [unknown], freeBytes: {} })).queue[0].wait).toEqual({ code: 'space-unknown' })
  })

  it('[JOB-005] Given a job predicted to run past the close, When a shorter one is queued behind it, Then the shorter one starts and the longer carries to the next window', () => {
    const long = job({ neededBytes: 30 * GB }) // 45 minutes at the first-run guess
    const short = job({ neededBytes: 5 * GB }) // 7.5 minutes
    const s = scheduleJobs(input({ now: local(2, 30), jobs: [long, short] }))
    expect(s.queue[0].wait).toEqual({ code: 'overrun', closesAt: local(3), leftSeconds: 1800, opensAt: local(2, 0, 31) })
    expect(s.start).toBe(short.id)
  })

  it('[JOB-005] Given a job longer than the whole window, When the window is open, Then it starts, since it would never fit', () => {
    const huge = job({ neededBytes: 100 * GB }) // 2.5 hours against a one-hour window
    expect(scheduleJobs(input({ now: local(2, 50), jobs: [huge] })).start).toBe(huge.id)
  })

  it('[JOB-005] Given an all-day window, When a long job is queued, Then it starts without an overrun check', () => {
    const j = job({ neededBytes: 100 * GB })
    expect(scheduleJobs(input({ now: local(14), jobs: [j], settings: { ...DEFAULT_JOB_SETTINGS, windowStart: 0, windowEnd: 0 } })).start).toBe(j.id)
  })

  it('[JOB-006] Given history, When scheduled, Then each queued job carries its estimate', () => {
    const j = job({ neededBytes: 2 * GB })
    const s = scheduleJobs(input({ now: local(14), jobs: [j], history: [{ kind: 'stack', neededBytes: GB, seconds: 300 }] }))
    expect(s.queue[0].estimate).toEqual({ seconds: 600, basis: 'history' })
  })
})

describe('interruptions and commands', () => {
  it('[JOB-008] Given a job the app stopped by closing, When recovered, Then it queues again once and fails after the second time', () => {
    expect(afterInterruption({ attempts: 1 }).state).toBe('queued')
    expect(afterInterruption({ attempts: 2 })).toMatchObject({ state: 'failed' })
  })

  it('[NFR-012] Given a stack job, When its command is built, Then Siril runs the stock script in the work folder with no shell', () => {
    expect(sirilStackCommand('C:/Siril/bin/siril-cli.exe', 'C:/Siril/share/siril/scripts/OSC_Preprocessing.ssf', 'D:/work/m42')).toEqual({
      program: 'C:/Siril/bin/siril-cli.exe',
      args: ['-d', 'D:/work/m42', '-s', 'C:/Siril/share/siril/scripts/OSC_Preprocessing.ssf'],
      cwd: 'D:/work/m42'
    })
  })

  it('[NFR-012] Given Siril_Scripts v2, When its command is built, Then bash runs postprocess.sh beside the .bat, or the script runs directly without bash', () => {
    expect(postProcessCommand('C:/S/v2/postprocess.bat', ['D:/m42/result.fit', '--profile=nebula'], 'C:/Git/bin/bash.exe', 'D:/m42')).toEqual({
      program: 'C:/Git/bin/bash.exe',
      args: ['C:/S/v2/postprocess.sh', 'D:/m42/result.fit', '--profile=nebula'],
      cwd: 'D:/m42'
    })
    expect(postProcessCommand('/home/l/S/v2/postprocess.sh', ['x.fit'], null, '/data')).toEqual({ program: '/home/l/S/v2/postprocess.sh', args: ['x.fit'], cwd: '/data' })
  })
})
