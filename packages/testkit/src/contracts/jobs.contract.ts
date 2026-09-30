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
  })
}
