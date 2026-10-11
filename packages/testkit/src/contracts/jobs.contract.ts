import { describe, expect, it } from 'vitest'
import type { JobLogs, JobSettingsSource, JobStore, MachineMonitor } from '@astro/application'
import { DEFAULT_JOB_SETTINGS, type JobSettings, type MachineLoad, type NewJob } from '@astro/domain'

const newJob = (over: Partial<NewJob> = {}): NewJob => ({
  kind: 'stack',
  targetId: 'm42',
  title: 'Stack M 42 with OSC_Preprocessing',
  timing: 'window',
  command: { program: 'C:/Program Files/Siril/bin/siril-cli.exe', args: ['-d', 'D:/work/M 42', '-s', 'OSC_Preprocessing.ssf'], cwd: 'D:/work/M 42' },
  prepare: { sourceDir: 'D:/astro/M42', workDir: 'D:/work/M 42' },
  spaceDir: 'D:/work/M 42',
  neededBytes: 12_345_678_901,
  ...over
})

/** Every JobStore adapter must pass this suite. `make` returns an empty store. */
export function jobStoreContract(adapterName: string, make: () => JobStore): void {
  describe(`JobStore contract: ${adapterName}`, () => {
    it('[JOB-001] Given a confirmed job, When added, Then it comes back queued with its command, preparation and size intact', async () => {
      const store = make()
      const added = await store.add(newJob(), new Date('2026-09-30T20:00:00Z'))
      expect(added).toMatchObject({ ...newJob(), state: 'queued', attempts: 0, startedAt: null, finishedAt: null, exitCode: null, note: null })
      expect(added.queuedAt.toISOString()).toBe('2026-09-30T20:00:00.000Z')
      expect(await store.get(added.id)).toEqual(added)
      expect(await store.get('missing')).toBeNull()
    })

    it('[JOB-004] Given jobs queued at different times, When listed, Then the oldest comes first', async () => {
      const store = make()
      const later = await store.add(newJob({ title: 'later' }), new Date('2026-09-30T21:00:00Z'))
      const earlier = await store.add(newJob({ title: 'earlier', prepare: null, kind: 'post-process' }), new Date('2026-09-30T20:00:00Z'))
      expect((await store.list()).map(j => j.id)).toEqual([earlier.id, later.id])
      expect((await store.get(earlier.id))?.prepare).toBeNull()
    })

    it('[JOB-009] Given a job, When it runs and finishes, Then each change is kept and untouched fields stay', async () => {
      const store = make()
      const job = await store.add(newJob(), new Date('2026-09-30T20:00:00Z'))
      await store.update(job.id, { state: 'running', startedAt: new Date('2026-10-01T01:00:00Z'), attempts: 1 })
      const done = await store.update(job.id, { state: 'failed', finishedAt: new Date('2026-10-01T01:30:00Z'), exitCode: 2, note: 'Siril exited with code 2.', timing: 'now' })
      expect(done).toMatchObject({ state: 'failed', exitCode: 2, attempts: 1, note: 'Siril exited with code 2.', timing: 'now', title: job.title })
      expect(done.startedAt?.toISOString()).toBe('2026-10-01T01:00:00.000Z')
      expect(done.finishedAt?.toISOString()).toBe('2026-10-01T01:30:00.000Z')
      const cleared = await store.update(job.id, { finishedAt: null, exitCode: null, note: null })
      expect(cleared).toMatchObject({ finishedAt: null, exitCode: null, note: null })
      expect(await store.update(job.id, {})).toEqual(cleared)
      await expect(store.update('missing', { state: 'running' })).rejects.toThrow()
    })

    it('[JOB-010] Given a job cancelled while it was about to start, When the start is applied from queued, Then it does not apply', async () => {
      const store = make()
      const job = await store.add(newJob(), new Date('2026-09-30T20:00:00Z'))
      expect(await store.transition(job.id, 'queued', { state: 'cancelled', note: 'Cancelled before it started.' })).toMatchObject({ state: 'cancelled' })
      expect(await store.transition(job.id, 'queued', { state: 'running', attempts: 1 })).toBeNull()
      expect(await store.get(job.id)).toMatchObject({ state: 'cancelled', attempts: 0 })
      expect(await store.transition('missing', 'queued', { state: 'running' })).toBeNull()
    })

    it('[HUB-011] Given a SyQon step reporting its own progress, When the progress is saved, Then its kind and live progress come back', async () => {
      const store = make()
      const job = await store.add(newJob({ kind: 'syqon', prepare: null, command: { program: 'syqon-cli', args: ['--model', 'axiom-mini'], cwd: 'D:/s' } }), new Date('2026-09-30T20:00:00Z'))
      const progress = { step: 0, of: 1, key: 'live', label: 'Star separation', live: { percent: 42.5, line: 'Separating 42.5%' } }
      await store.update(job.id, { progress })
      expect(await store.get(job.id)).toMatchObject({ kind: 'syqon', progress })
    })

    it('[PRV-003] Given a stack run step by step, When its progress is saved and cleared, Then it comes back as saved', async () => {
      const store = make()
      const job = await store.add(newJob(), new Date('2026-09-30T20:00:00Z'))
      expect(job.progress).toBeNull()
      const progress = { step: 3, of: 9, key: 'abc-def-30', label: 'register pp_light', resumedFrom: 2, published: ['D:/work/M 42/result_3600s.fit'] }
      expect((await store.update(job.id, { progress })).progress).toEqual(progress)
      expect((await store.get(job.id))?.progress).toEqual(progress)
      expect((await store.update(job.id, { note: 'x' })).progress).toEqual(progress)
      expect((await store.update(job.id, { progress: null })).progress).toBeNull()
    })

    it('[SKY-003] Given a plate solve job, When added, Then its solver and files come back with it', async () => {
      const store = make()
      const solve = {
        solver: 'astap' as const,
        program: 'C:/Program Files/astap/astap_cli.exe',
        workDir: 'D:/work/solve/m31',
        files: [{ path: 'D:/astro/M31/L_0001.fit', widthPx: 1080, heightPx: 1920, hint: { raDeg: 10.68, decDeg: 41.27 }, optics: { focalMm: 250, pixelUm: 2.9 } }]
      }
      const job = await store.add(newJob({ kind: 'solve', prepare: null, solve }), new Date('2026-09-30T20:00:00Z'))
      expect((await store.get(job.id))?.solve).toEqual(solve)
      expect((await store.add(newJob(), new Date('2026-09-30T20:00:00Z'))).solve ?? null).toBeNull()
    })
  })
}

export interface JobSettingsHarness {
  source: JobSettingsSource
  /** Saves these settings as the Settings page does, leaving the others as they were. */
  save(settings: Partial<JobSettings>): Promise<void>
}

/** Every JobSettingsSource adapter must pass this suite. `make` starts with nothing saved. */
export function jobSettingsSourceContract(adapterName: string, make: () => JobSettingsHarness): void {
  describe(`JobSettingsSource contract: ${adapterName}`, () => {
    it('[NFR-006] [JOB-012] Given nothing saved, When read, Then the defaults come back: 02:00 to 03:00, 10 minutes idle and 30% CPU', async () => {
      expect(await make().source.read()).toEqual(DEFAULT_JOB_SETTINGS)
    })

    it('[NFR-006] [JOB-012] Given a run window saved, When read, Then it is used, with defaults for the rest', async () => {
      const h = make()
      await h.save({ windowStart: 23 * 60 + 30, maxCpuPercent: 50 })
      expect(await h.source.read()).toEqual({ ...DEFAULT_JOB_SETTINGS, windowStart: 23 * 60 + 30, maxCpuPercent: 50 })
    })

    it('[NFR-006] [JOB-003] Given settings changed while the app runs, When read again, Then the next check uses the new ones', async () => {
      const h = make()
      expect((await h.source.read()).idleMinutes).toBe(DEFAULT_JOB_SETTINGS.idleMinutes)
      await h.save({ idleMinutes: 0, windowEnd: 6 * 60 })
      expect(await h.source.read()).toMatchObject({ idleMinutes: 0, windowEnd: 6 * 60 })
    })
  })
}

export interface MachineMonitorHarness {
  /** A monitor that sees the load given, until `set` changes it. */
  scripted(load: MachineLoad): { monitor: MachineMonitor; set(load: MachineLoad): void }
  /** A monitor of this PC as it is. */
  live(): MachineMonitor
}

/** Every MachineMonitor adapter must pass this suite. */
export function machineMonitorContract(adapterName: string, harness: MachineMonitorHarness): void {
  describe(`MachineMonitor contract: ${adapterName}`, () => {
    it('[NFR-006] [JOB-003] Given a busy PC whose user is away, When sampled, Then its CPU use and idle time come back', async () => {
      const { monitor } = harness.scripted({ userIdleSeconds: 700, cpuPercent: 75 })
      expect(await monitor.sample()).toEqual({ userIdleSeconds: 700, cpuPercent: 75 })
    })

    it('[NFR-006] [JOB-003] Given the load changes between checks, When sampled again, Then each sample says how the PC is now', async () => {
      const m = harness.scripted({ userIdleSeconds: 30, cpuPercent: 80 })
      expect(await m.monitor.sample()).toEqual({ userIdleSeconds: 30, cpuPercent: 80 })
      m.set({ userIdleSeconds: 1200, cpuPercent: 10 })
      expect(await m.monitor.sample()).toEqual({ userIdleSeconds: 1200, cpuPercent: 10 })
    })

    it('[NFR-006] [JOB-003] Given a PC that will not say, When sampled, Then idle time and CPU use are unknown rather than guessed', async () => {
      const { monitor } = harness.scripted({ userIdleSeconds: null, cpuPercent: null })
      expect(await monitor.sample()).toEqual({ userIdleSeconds: null, cpuPercent: null })
    })

    it('[NFR-006] [JOB-003] Given this PC, When sampled twice, Then CPU use is unknown or a whole percentage from 0 to 100, and idle time is unknown or not negative', async () => {
      const monitor = harness.live()
      for (const load of [await monitor.sample(), await monitor.sample()]) {
        if (load.cpuPercent !== null) {
          expect(Number.isInteger(load.cpuPercent)).toBe(true)
          expect(load.cpuPercent).toBeGreaterThanOrEqual(0)
          expect(load.cpuPercent).toBeLessThanOrEqual(100)
        }
        if (load.userIdleSeconds !== null) expect(load.userIdleSeconds).toBeGreaterThanOrEqual(0)
      }
    })
  })
}

const utf8 = new TextEncoder()

/** Every JobLogs adapter must pass this suite. `make` returns logs with nothing in them. */
export function jobLogsContract(adapterName: string, make: () => JobLogs): void {
  describe(`JobLogs contract: ${adapterName}`, () => {
    it('[NFR-006] [JOB-009] Given output appended to a job log, When read, Then it comes back at once and in order, and a job with no log reads empty', async () => {
      const logs = make()
      expect(await logs.read('01J0000000', 100)).toBe('')
      logs.append('01J0000000', 'first line\n')
      logs.append('01J0000000', 'second line\n')
      expect(await logs.read('01J0000000', 1000)).toBe('first line\nsecond line\n')
    })

    it('[NFR-006] [JOB-009] Given a long log, When its end is asked for, Then at most that many bytes come back from the end, and none for zero', async () => {
      const logs = make()
      logs.append('01J0000001', 'first line\nsecond line\n')
      expect(await logs.read('01J0000001', 12)).toBe('second line\n')
      expect(await logs.read('01J0000001', 0)).toBe('')
    })

    it('[NFR-006] [JOB-009] Given output with characters wider than a byte, When the end is read, Then it is whole characters within the byte limit', async () => {
      const logs = make()
      const text = 'Scale 1.2″/px — 50% ±0.3°\n'
      logs.append('01J0000002', text)
      for (const max of [1, 4, 5, 6, 9, 12, 20]) {
        const end = await logs.read('01J0000002', max)
        expect(text.endsWith(end)).toBe(true)
        expect(end).not.toContain('\uFFFD')
        expect(utf8.encode(end).length).toBeLessThanOrEqual(max)
        // As much as fits: a character cut in two is the most that is left off.
        expect(max - utf8.encode(end).length).toBeLessThan(4)
      }
    })

    it('[NFR-006] [JOB-009] Given two jobs, When each logs, Then each log holds only its own output', async () => {
      const logs = make()
      logs.append('01JA', 'a\n')
      logs.append('01JB', 'b\n')
      logs.append('01JA', 'aa\n')
      expect([await logs.read('01JA', 100), await logs.read('01JB', 100)]).toEqual(['a\naa\n', 'b\n'])
    })

    it('[NFR-006] [JOB-009] Given a job id that is a path, When used, Then it is refused and nothing is touched', async () => {
      const logs = make()
      expect(() => logs.append('../escape', 'x')).toThrow('Not a job id')
      await expect(logs.read('..\\escape', 10)).rejects.toThrow('Not a job id')
      await expect(logs.read('a/b', 10)).rejects.toThrow('Not a job id')
    })
  })
}
