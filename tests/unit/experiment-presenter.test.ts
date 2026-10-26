import { describe, expect, it } from 'vitest'
import type { ExperimentComparison, ExperimentDescription, ExperimentRecord } from '@astro/application'
import { figures, toComparisonView, toExperimentChange, toExperimentView, toRunView } from '../../src/main/adapters/experiment-presenter'

const record: ExperimentRecord = {
  id: 'e1',
  targetId: 'm31',
  number: 2,
  name: 'Stretch test',
  objective: 'Arms?',
  input: { path: 'D:\\m31\\result.fit', sizeBytes: 1024 * 1024 * 300, modifiedAt: null, sha256: 'sha256:0123456789abcdef' },
  variants: (['A', 'B', 'C'] as const).map(letter => ({
    id: `v${letter}`,
    letter,
    parameters: { profile: 'galaxy' as const, quality: 'normal' as const },
    outputLabel: `M31-exp2-${letter}`,
    outputDir: `D:/m31/processed/M31-exp2-${letter}`,
    run: null,
    outputs: letter === 'A' ? [{ path: 'D:/m31/processed/M31-exp2-A/final.fit', name: 'final.fit', sizeBytes: 2048, sha256: 'sha256:f' }] : null,
    outputsRecordedAt: null
  })),
  preferredVariantId: 'vA',
  createdAt: new Date(2026, 9, 26, 9)
}

describe('experiment presenter', () => {
  it('[PE-002, PE-006] Given an experiment, When shown, Then each variant has its settings, state in words, outputs and whether it can be preferred', () => {
    const d: ExperimentDescription = {
      experiment: record,
      variants: [
        { record: record.variants[0], state: 'succeeded', job: { exitCode: 0, startedAt: null, finishedAt: null, note: null }, outputBytes: 2048, outputsMissing: false, inputChanged: false },
        { record: record.variants[1], state: 'failed', job: { exitCode: 3, startedAt: null, finishedAt: null, note: null }, outputBytes: null, outputsMissing: false, inputChanged: false },
        { record: record.variants[2], state: 'succeeded', job: null, outputBytes: null, outputsMissing: true, inputChanged: false }
      ],
      at: new Date()
    }
    const v = toExperimentView(d)
    expect(v).toMatchObject({ id: 'e1', name: 'Stretch test', objective: 'Arms?', inputPath: 'D:\\m31\\result.fit', inputHash: '0123456789ab', canRun: true, canCompare: true })
    expect(v.summary).toBe('Experiment 2 on result.fit (300.0 MB), made 26 Oct 2026')
    expect(v.variants.map(x => [x.letter, x.settings, x.stateText, x.outputs, x.preferred, x.canPrefer, x.outputsMissing])).toEqual([
      ['A', 'Galaxy profile, normal quality', 'Finished', '1 file, 2.0 KB', true, true, false],
      ['B', 'Galaxy profile, normal quality', 'Failed (exit code 3)', null, false, false, false],
      ['C', 'Galaxy profile, normal quality', 'Finished', null, false, true, true]
    ])
    const states = (['not run', 'queued', 'running', 'cancelled', 'job missing'] as const).map(state => toExperimentView({ ...d, variants: [{ ...d.variants[1], state, job: null }] }).variants[0].stateText)
    expect(states).toEqual(['Not run', 'Queued', 'Running', 'Cancelled', 'Its job is no longer listed'])
    expect(toExperimentView({ ...d, variants: [{ ...d.variants[1], state: 'failed', job: null }] }).variants[0].stateText).toBe('Failed')
    expect(toExperimentView({ ...d, variants: [d.variants[0]] })).toMatchObject({ canRun: false, canCompare: false })
    const twice = [...(record.variants[0].outputs ?? []), ...(record.variants[0].outputs ?? [])]
    expect(toExperimentView({ ...d, variants: [{ ...d.variants[0], record: { ...record.variants[0], outputs: twice }, outputBytes: 4096 }] }).variants[0].outputs).toBe('2 files, 4.0 KB')
  })

  it('[PE-005] Given a comparison, When shown, Then each variant has its preview and figures, or why not, and the notes pass through', () => {
    const c: ExperimentComparison = {
      experimentId: 'e1',
      variants: [
        {
          letter: 'A',
          parameters: { profile: 'galaxy', quality: 'normal' },
          preferred: true,
          state: 'succeeded',
          image: { path: 'D:/x/final.fit', name: 'final.fit', preview: { width: 2, height: 1, channels: 1, data: new Uint8Array([1, 2]), scale: 1, sourceWidth: 20, sourceHeight: 10 }, metrics: { median: 0.1234, noise: 0.01, relativeNoise: 0.081, clippedHigh: 0.0012, clippedLow: 0.05, fwhm: 2.345 } }
        },
        { letter: 'B', parameters: { profile: 'minimal', quality: 'strong' }, preferred: false, state: 'succeeded', image: { path: 'D:/y/final.fit', error: 'Not a FITS file.' } },
        { letter: 'C', parameters: { profile: 'minimal', quality: 'light' }, preferred: false, state: 'running', image: null },
        { letter: 'D', parameters: { profile: 'nebula', quality: 'light' }, preferred: false, state: 'succeeded', image: { path: null, error: 'It left no FITS or PNG to compare.' } }
      ],
      notes: ['n']
    }
    const v = toComparisonView(c)
    expect(v.notes).toEqual(['n'])
    expect(v.variants[0]).toMatchObject({ letter: 'A', settings: 'Galaxy profile, normal quality', preferred: true, file: 'final.fit', error: null })
    expect(v.variants[0].preview).toMatchObject({ width: 2, height: 1, sourceSize: '20 × 10', overlay: null })
    expect(v.variants[0].figures).toEqual([
      { label: 'Background', value: '0.123' },
      { label: 'Noise', value: '0.0100' },
      { label: 'Noise over background', value: '0.0810' },
      { label: 'Clipped highlights', value: '0.12%' },
      { label: 'Crushed shadows', value: '5.0%' },
      { label: 'Brightest star FWHM', value: '2.35 px' }
    ])
    expect(v.variants.slice(1).map(x => [x.file, x.preview, x.error, x.figures])).toEqual([
      ['final.fit', null, 'Not a FITS file.', null],
      [null, null, 'Not finished: running.', null],
      [null, null, 'It left no FITS or PNG to compare.', null]
    ])
    expect(figures({ median: 0, noise: 0, relativeNoise: null, clippedHigh: null, clippedLow: 0, fwhm: null }).map(f => f.value)).toEqual(['0.00', '0.00', 'not known', 'not known', '0.00%', 'no star stood out'])
    expect(toComparisonView({ ...c, variants: [{ ...c.variants[2], state: 'succeeded' }] }).variants[0].error).toBeNull()
  })

  it('[PE-004] Given results, When shown, Then refusals keep their words and a run says what was queued', () => {
    expect(toExperimentChange({ ok: true, experiment: record })).toEqual({ ok: true, id: 'e1' })
    expect(toExperimentChange({ ok: false, problems: ['x'] })).toEqual({ ok: false, problems: ['x'] })
    expect(toRunView({ ok: true, queued: ['B'] })).toEqual({ ok: true, queued: 'Variant B is queued.' })
    expect(toRunView({ ok: true, queued: ['A', 'B'] })).toEqual({ ok: true, queued: 'Variants A, B are queued, one after another.' })
    expect(toRunView({ ok: false, problems: ['y'] })).toEqual({ ok: false, problems: ['y'] })
  })
})
