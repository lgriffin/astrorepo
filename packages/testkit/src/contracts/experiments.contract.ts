import { describe, expect, it } from 'vitest'
import type { ExperimentStore, NewExperiment, OutputFolder } from '@astro/application'

const at = (iso: string) => new Date(iso)

const experiment = (over: Partial<NewExperiment> = {}): NewExperiment => ({
  targetId: 'm31',
  number: 1,
  name: 'Stretch test',
  objective: 'Galaxy or broadband?',
  input: { path: 'D:/m31/result.fit', sizeBytes: 1000, modifiedAt: at('2026-10-20T22:00:00Z'), sha256: 'sha256:abc' },
  variants: [
    { letter: 'A', parameters: { profile: 'galaxy', quality: 'normal' }, outputLabel: 'M31-exp1-A', outputDir: 'D:/m31/processed/M31-exp1-A' },
    { letter: 'B', parameters: { profile: 'broadband', quality: 'strong' }, outputLabel: 'M31-exp1-B', outputDir: 'D:/m31/processed/M31-exp1-B' }
  ],
  createdAt: at('2026-10-26T09:00:00Z'),
  ...over
})

/** Every ExperimentStore adapter must pass this suite. `make` returns an empty store in which the targets 'm31' and 'm42' exist. */
export function experimentStoreContract(adapterName: string, make: () => ExperimentStore): void {
  describe(`ExperimentStore contract: ${adapterName}`, () => {
    it('[PE-001] Given a new experiment, When read back, Then its input, settings and variants are as made, with nothing run or preferred', async () => {
      const store = make()
      const made = await store.create(experiment())
      expect(made).toMatchObject({ targetId: 'm31', number: 1, name: 'Stretch test', objective: 'Galaxy or broadband?', preferredVariantId: null, createdAt: at('2026-10-26T09:00:00Z') })
      expect(made.input).toEqual(experiment().input)
      expect(made.variants.map(v => [v.letter, v.parameters, v.outputLabel, v.outputDir, v.run, v.outputs, v.outputsRecordedAt])).toEqual([
        ['A', { profile: 'galaxy', quality: 'normal' }, 'M31-exp1-A', 'D:/m31/processed/M31-exp1-A', null, null, null],
        ['B', { profile: 'broadband', quality: 'strong' }, 'M31-exp1-B', 'D:/m31/processed/M31-exp1-B', null, null, null]
      ])
      expect(new Set(made.variants.map(v => v.id)).size).toBe(2)
      expect(await store.get(made.id)).toEqual(made)
      expect(await store.get('nope')).toBeNull()
    })

    it('[PE-002] Given a variant, When its run and outputs are recorded, Then they read back, and a second record of outputs leaves the first', async () => {
      const store = make()
      const made = await store.create(experiment())
      const [a, b] = made.variants
      const run = { jobId: 'j1', outputLabel: 'M31-exp1-A', outputDir: 'D:/m31/processed/M31-exp1-A', program: 'bash', args: ['postprocess.sh', 'D:/m31/result.fit', '--target=M31-exp1-A'], cwd: 'D:/m31', tools: [{ id: 'siril' as const, version: '1.4.0' }], queuedAt: at('2026-10-26T10:00:00Z') }
      await store.recordRun(a.id, run)
      const outputs = [{ path: 'D:/m31/processed/M31-exp1-A/final.fit', name: 'final.fit', sizeBytes: 12, sha256: 'sha256:f' }]
      await store.recordOutputs(a.id, outputs, at('2026-10-26T11:00:00Z'))
      await store.recordOutputs(a.id, [], at('2026-10-26T12:00:00Z'))
      const after = await store.get(made.id)
      expect(after?.variants[0]).toMatchObject({ run, outputs, outputsRecordedAt: at('2026-10-26T11:00:00Z') })
      expect(after?.variants[1]).toMatchObject({ id: b.id, run: null, outputs: null })
    })

    it('[PE-006] Given experiments on two targets, When listed and one variant preferred, Then each target lists its own newest first and the choice can be cleared', async () => {
      const store = make()
      const first = await store.create(experiment())
      const second = await store.create(experiment({ number: 2, name: 'Second', createdAt: at('2026-10-27T09:00:00Z') }))
      await store.create(experiment({ targetId: 'm42', name: 'Orion' }))
      expect((await store.list('m31')).map(e => [e.id, e.name])).toEqual([
        [second.id, 'Second'],
        [first.id, 'Stretch test']
      ])
      await store.prefer(first.id, first.variants[1].id)
      expect((await store.get(first.id))?.preferredVariantId).toBe(first.variants[1].id)
      await store.prefer(first.id, null)
      expect((await store.get(first.id))?.preferredVariantId).toBeNull()
    })
  })
}

/**
 * Every OutputFolder adapter must pass this suite. `make` returns the folder adapter and a way to
 * write a file (for setting up only), and the folder `root` that exists and is empty.
 */
export function outputFolderContract(adapterName: string, make: () => { folder: OutputFolder; write: (path: string, text: string) => void; root: string }): void {
  describe(`OutputFolder contract: ${adapterName}`, () => {
    it('[PE-002] Given a folder with files, When listed, Then each file comes by name with its size, and a missing folder or file is null', async () => {
      const { folder, write, root } = make()
      expect(await folder.list(root)).toEqual([])
      write(`${root}/b.png`, 'bb')
      write(`${root}/a.fit`, 'aaaa')
      const listed = await folder.list(root)
      expect(listed?.map(f => [f.name, f.sizeBytes])).toEqual([
        ['a.fit', 4],
        ['b.png', 2]
      ])
      expect(await folder.list(`${root}/nope`)).toBeNull()
      expect((await folder.stat(listed?.[0].path as string))?.sizeBytes).toBe(4)
      expect(await folder.stat(`${root}/nope.fit`)).toBeNull()
    })
  })
}
