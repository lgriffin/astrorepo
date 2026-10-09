import { describe, expect, it } from 'vitest'
import { DEFAULT_JOB_SETTINGS, scheduleJobs, type Job, type JobSettings, type MachineLoad } from '@astro/domain'
import { formatDuration, toJobsView, waitText, when } from '../../src/main/adapters/job-presenter'

const GB = 1024 ** 3
const local = (h: number, m = 0, day = 30) => new Date(2026, 8, day, h, m)

function job(id: string, over: Partial<Job> = {}): Job {
  return {
    id,
    kind: 'stack',
    targetId: 'm42',
    title: `Stack ${id}`,
    timing: 'window',
    state: 'queued',
    command: { program: 'C:/Program Files/Siril/bin/siril-cli.exe', args: ['-d', 'D:/work/m42', '-s', 'OSC.ssf'], cwd: 'D:/work/m42' },
    prepare: null,
    spaceDir: 'D:/work/m42',
    neededBytes: GB,
    queuedAt: local(12),
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    note: null,
    attempts: 0,
    progress: null,
    ...over
  }
}

function view(jobs: Job[], now: Date, settings: JobSettings = DEFAULT_JOB_SETTINGS, load: MachineLoad = { userIdleSeconds: 1200, cpuPercent: 4 }) {
  const schedule = scheduleJobs({ now, settings, jobs, history: [], load, freeBytes: Object.fromEntries(jobs.map(j => [j.id, 1000 * GB])) })
  return toJobsView({ jobs, schedule, settings, load }, now)
}

describe('job presenter', () => {
  it("[UX-011] Given 25 newer finished jobs for other targets, When one target's runs are asked for, Then its own finished jobs still come back", () => {
    const done = (id: string, targetId: string, hour: number) =>
      job(id, { targetId, state: 'succeeded', startedAt: local(hour), finishedAt: local(hour, 30), exitCode: 0 })
    const jobs = [done('mine', 'm31', 1), ...Array.from({ length: 25 }, (_, i) => done(`other-${i}`, 'm42', 2 + (i % 20)))]
    const schedule = scheduleJobs({ now: local(23), settings: DEFAULT_JOB_SETTINGS, jobs, history: [], load: { userIdleSeconds: 1200, cpuPercent: 4 }, freeBytes: {} })
    const snap = { jobs, schedule, settings: DEFAULT_JOB_SETTINGS, load: { userIdleSeconds: 1200, cpuPercent: 4 } }
    expect(toJobsView(snap, local(23)).history.map(j => j.id)).not.toContain('mine')
    expect(toJobsView(snap, local(23), 'm31').history.map(j => j.id)).toEqual(['mine'])
  })

  it('[JOB-002] Given the window closed, When shown, Then the rules, the next opening and why each job waits read as sentences', () => {
    const v = view([job('a'), job('b', { timing: 'now', queuedAt: local(13) })], local(14))
    expect(v.rules).toBe(
      'Jobs start between 02:00 and 03:00 once the PC has been idle for 10 minutes and CPU use is below 30%. One runs at a time, at low priority, and a job running at the close is left to finish.'
    )
    expect(v.windowStatus).toBe('The next run window opens at 02:00 tomorrow.')
    expect(v.load).toBe('The PC was last used 20 min ago, with CPU at 4%.')
    expect(v.queue.map(q => [q.id, q.waiting])).toEqual([
      ['b', 'Starting now.'],
      ['a', 'Waits for the job ahead of it.']
    ])
    expect(v.queue[1]).toMatchObject({ stateLabel: 'Queued', canCancel: true, canRunNow: true, needed: '1.0 GB', estimate: 'About 2 min (a first-run guess until this PC has run one)' })
    expect(v.queue[0].canRunNow).toBe(false)
    expect(v.queue[1].command).toBe('"C:/Program Files/Siril/bin/siril-cli.exe" -d D:/work/m42 -s OSC.ssf')
    expect(v.queue.map(q => q.filter)).toEqual([null, null])
    const ha = view([job('ha', { prepare: { sourceDir: 'D:/data/m42', workDir: 'D:/work/m42/filters/Ha', filter: 'Ha' } })], local(14))
    expect(ha.queue[0].filter).toBe('Ha')
    expect(v.settings).toEqual({ windowStart: '02:00', windowEnd: '03:00', idleMinutes: 10, maxCpuPercent: 30 })
  })

  it('[JOB-009] Given a running job and finished ones, When shown, Then the running one has its time so far and history is newest first', () => {
    const done = job('done', { state: 'succeeded', startedAt: local(2), finishedAt: local(2, 30), exitCode: 0 })
    const failed = job('failed', { state: 'failed', startedAt: local(2, 31), finishedAt: local(2, 32), exitCode: 1, note: 'siril-cli exited with code 1.' })
    const running = job('run', { state: 'running', startedAt: local(2, 35) })
    const v = view([done, failed, running], local(2, 50), DEFAULT_JOB_SETTINGS, { userIdleSeconds: null, cpuPercent: null })
    expect(v.windowStatus).toBe('The run window is open until 03:00.')
    expect(v.load).toBeNull()
    expect(v.running).toMatchObject({ id: 'run', stateLabel: 'Running', duration: '15 min', canCancel: true, canRunNow: false })
    expect(v.running?.estimate).toBe('About 30 min, from earlier runs')
    expect(v.history.map(h => [h.id, h.stateLabel, h.duration])).toEqual([
      ['failed', 'Failed', '1 min'],
      ['done', 'Done', '30 min']
    ])
    expect(v.history[0]).toMatchObject({ canCancel: false, estimate: null, note: 'siril-cli exited with code 1.' })
  })

  it('[JOB-005] Given an all-day window, When shown, Then the rules and status say so', () => {
    const v = view([], local(14), { ...DEFAULT_JOB_SETTINGS, windowStart: 0, windowEnd: 0 })
    expect(v.rules).toMatch(/^Jobs start at any time/)
    expect(v.windowStatus).toBe('The run window is open all day.')
  })

  it('[JOB-003] Given each reason a job waits, When shown, Then it reads as a sentence', () => {
    const now = local(2, 30)
    const est = { seconds: 45 * 60, basis: 'guess' as const }
    expect(waitText({ code: 'running' }, est, now)).toBe('Waits for the running job to finish.')
    expect(waitText({ code: 'space', shortBytes: 2 * GB }, est, now)).toBe('Waits for disk space: 2.0 GB short where it writes.')
    expect(waitText({ code: 'space-unknown' }, est, now)).toBe('Waits until the disk it writes to reports its free space.')
    expect(waitText({ code: 'window', opensAt: local(2, 0, 31) }, est, now)).toBe('Waits for the run window at 02:00 tomorrow.')
    expect(waitText({ code: 'idle', idleMinutes: 10, idleSeconds: 120 }, est, now)).toBe('Waits until the PC has been idle for 10 minutes (last used 2 min ago).')
    expect(waitText({ code: 'cpu', maxCpuPercent: 30, cpuPercent: 64 }, est, now)).toBe('Waits for CPU use to drop below 30% (now 64%).')
    expect(waitText({ code: 'overrun', closesAt: local(3), leftSeconds: 1800, opensAt: local(2, 0, 31) }, est, now)).toBe(
      'Would run past 03:00 (about 45 min, with 30 min left), so it waits for the window at 02:00 tomorrow.'
    )
  })

  it('[JOB-006] Given durations and dates, When formatted, Then they read naturally', () => {
    expect(formatDuration(20)).toBe('under a minute')
    expect(formatDuration(3600)).toBe('1 h')
    expect(formatDuration(7800)).toBe('2 h 10 min')
    expect(when(local(23), local(14))).toBe('23:00 today')
    expect(when(local(2, 0, 3), local(14))).toBe('02:00 on 2026-09-03')
  })

  it('[PRV-007] Given stacks run step by step, When shown, Then a running one says its step, a stopped one how far it got, and a finished one what it published', () => {
    const key = 'k'
    const running = job('run', { state: 'running', startedAt: local(2), progress: { step: 3, of: 9, key, label: 'register pp_light', resumedFrom: 2 } })
    const failed = job('bad', { state: 'failed', startedAt: local(1), finishedAt: local(1, 30), progress: { step: 4, of: 9, key, label: 'stack r_pp_light' } })
    const done = job('ok', { state: 'succeeded', startedAt: local(0), finishedAt: local(1), progress: { step: 9, of: 9, key, label: null, published: ['D:\\work\\m42\\result_3600s.fit'] } })
    const whole = job('whole', { state: 'succeeded', startedAt: local(0), finishedAt: local(0, 10) })
    const v = view([running, failed, done, whole], local(2, 10))
    expect(v.running?.progress).toBe('Step 4 of 9: register pp_light, carried on from step 3.')
    const byId = Object.fromEntries(v.history.map(j => [j.id, j]))
    expect(byId.bad.progress).toBe('Stopped after 4 of 9 steps.')
    expect(byId.ok.progress).toBeNull()
    expect(byId.ok.outputs).toEqual([{ path: 'D:\\work\\m42\\result_3600s.fit', name: 'result_3600s.fit', manifest: 'D:\\work\\m42\\result_3600s.fit.astrorepo.json' }])
    expect(byId.whole).toMatchObject({ progress: null, outputs: [] })
    const resumedDone = view([job('r', { state: 'succeeded', startedAt: local(0), finishedAt: local(1), progress: { step: 9, of: 9, key, label: null, resumedFrom: 5 } })], local(2)).history[0]
    expect(resumedDone.progress).toBe('All 9 steps done, carried on from step 6.')
    const queued = view([job('q', { progress: { step: 2, of: 9, key, label: 'convert light' } })], local(12)).queue[0]
    expect(queued.progress).toBe('Step 3 of 9: convert light.')
  })

  it('[HUB-011] Given a SyQon step reporting its own progress, When shown, Then a running one gives its percentage or last line, a finished one nothing', () => {
    const live = (percent: number | null, line: string) => ({ step: 0, of: 1, key: 'live', label: 'Denoise', live: { percent, line } })
    const pct = job('p', { kind: 'syqon', state: 'running', startedAt: local(2), progress: live(57.4, 'Denoising 57.4%') })
    expect(view([pct], local(2, 5)).running).toMatchObject({ kind: 'syqon', progress: '57% done.' })
    const raw = job('r', { kind: 'syqon', state: 'running', startedAt: local(2), progress: live(null, 'tile 3 of 9') })
    expect(view([raw], local(2, 5)).running?.progress).toBe('Last message: tile 3 of 9')
    const done = job('d', { kind: 'syqon', state: 'succeeded', startedAt: local(1), finishedAt: local(1, 10), exitCode: 0, progress: live(100, '100%') })
    expect(view([done], local(2)).history[0]).toMatchObject({ progress: null, outputs: [] })
  })
})
