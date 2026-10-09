import { describe, expect, it } from 'vitest'
import type { JobStore } from '@astro/application'
import type { NewJob } from '@astro/domain'

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
