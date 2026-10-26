import { describe, expect, it } from 'vitest'
import {
  MAX_VARIANTS,
  experimentReportJson,
  experimentReportMarkdown,
  experimentReportName,
  experimentSpace,
  finalOutput,
  metricNotes,
  reproducibility,
  runnable,
  variantArgs,
  variantLabel,
  variantMetrics,
  variantOutputDir,
  variantProblems,
  variantState,
  type ExperimentReportInput,
  type ImageInspection,
  type ReportVariant,
  type VariantMetrics
} from '@astro/domain'

const GB = 1e9
const stats = (over: Partial<ImageInspection['channels'][number]> = {}): ImageInspection['channels'][number] => ({
  channel: 'L',
  histogram: { min: 0, max: 1, counts: [] },
  median: 0.1,
  noise: 0.01,
  saturatedShare: 0,
  blackShare: 0,
  ...over
})
const inspected = (channels: ImageInspection['channels'], fwhm: number | null = null): ImageInspection => ({
  width: 10,
  height: 10,
  kind: 'colour',
  channels,
  star: fwhm === null ? null : { x: 1, y: 1, fwhm, peak: 1, background: 0, profile: [] },
  sampled: 100
})

describe('variants', () => {
  it('[PE-004] Given too few, too many, unknown or identical variants, When checked, Then each problem is said in words', () => {
    expect(variantProblems([{ profile: 'galaxy', quality: 'normal' }, { profile: 'broadband', quality: 'normal' }])).toEqual([])
    expect(variantProblems([{ profile: 'galaxy', quality: 'normal' }])).toEqual(['An experiment compares at least 2 variants.'])
    const five = (['galaxy', 'nebula', 'cluster', 'stellar', 'broadband'] as const).map(profile => ({ profile, quality: 'normal' as const }))
    expect(variantProblems(five)).toEqual([`An experiment compares at most ${MAX_VARIANTS} variants.`])
    expect(
      variantProblems([
        { profile: 'galaxy', quality: 'normal' },
        { profile: 'spiral' as never, quality: 'normal' },
        { profile: 'galaxy', quality: 'extreme' as never },
        { profile: 'galaxy', quality: 'normal' }
      ])
    ).toEqual([
      'Variant B asks for a profile Siril_Scripts does not have.',
      'Variant C asks for a quality Siril_Scripts does not have.',
      'Variants A and D have the same settings, so they would make the same image.'
    ])
  })

  it('[PE-003] Given a variant, When it writes, Then its TARGET and folder are its own, beside the stack, with the target name kept safe', () => {
    expect(variantLabel('M 31', 3, 'B')).toBe('M31-exp3-B')
    expect(variantArgs(['D:/m31/result.fit', '--target=M31', '--profile=galaxy'], 'M31-exp3-B')).toEqual(['D:/m31/result.fit', '--target=M31-exp3-B', '--profile=galaxy'])
    expect(variantArgs(['D:/m31/result.fit', '--profile=galaxy'], 'X')).toEqual(['D:/m31/result.fit', '--target=X', '--profile=galaxy'])
    expect(variantOutputDir('D:\\m31\\result.fit', 'M31-exp3-B')).toBe('D:\\m31\\processed\\M31-exp3-B')
    expect(variantOutputDir('D:/', 'X')).toBe('D:/processed/X')
  })

  it('[PE-004] Given variants still to run, When the disk is judged, Then each keeps its files and the last also needs its busiest moment', () => {
    expect(experimentSpace({ peakBytes: 3 * GB, keptBytes: GB }, 3, 10 * GB)).toEqual({ neededBytes: 5 * GB, fits: true, headroomBytes: 5 * GB, shortBytes: null })
    expect(experimentSpace({ peakBytes: 3 * GB, keptBytes: GB }, 2, 3 * GB).fits).toBe(false)
    expect(experimentSpace({ peakBytes: 3 * GB, keptBytes: GB }, 0, 0).neededBytes).toBe(0)
  })

  it('[PE-003] Given runs, When their state is read, Then only a variant never run, failed, cancelled or with its job gone runs again', () => {
    expect(variantState(null, null)).toBe('not run')
    expect(variantState({ jobId: 'j' }, null)).toBe('job missing')
    expect(variantState({ jobId: 'j' }, { state: 'running' })).toBe('running')
    expect((['not run', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'job missing'] as const).filter(runnable)).toEqual(['not run', 'failed', 'cancelled', 'job missing'])
  })
})

describe('outputs and figures', () => {
  it('[PE-005] Given what a run left, When the image to compare is picked, Then the final FITS, else the final PNG, else any FITS or PNG', () => {
    const f = (...names: string[]) => names.map(name => ({ name }))
    expect(finalOutput(f('M31_final.png', 'M31_final.fit', 'stretched.fit'))?.name).toBe('M31_final.fit')
    expect(finalOutput(f('M31_final.png', 'M31_final.tif', 'stretched.fit'))?.name).toBe('M31_final.png')
    expect(finalOutput(f('a.fits', 'b.fts', 'log.txt'))?.name).toBe('b.fts')
    expect(finalOutput(f('a.png', 'log.txt', 'c.tif'))?.name).toBe('a.png')
    expect(finalOutput(f('a.tif', 'final.jpg'))).toBeNull()
  })

  it('[PE-005] Given an image\'s channels, When measured, Then the figures are the middle median, the mean noise, the worst clipping and the star', () => {
    const m = variantMetrics(inspected([stats({ median: 0.3, noise: 0.03, saturatedShare: 0.01, blackShare: 0.002 }), stats({ median: 0.1, noise: 0.01, saturatedShare: 0.04 }), stats({ median: 0.2, noise: 0.02 })], 2.5))
    expect(m).toEqual({ median: 0.2, noise: expect.closeTo(0.02, 10), relativeNoise: expect.closeTo(0.1, 10), clippedHigh: 0.04, clippedLow: 0.002, fwhm: 2.5 })
    expect(variantMetrics(inspected([stats({ median: 0.1 }), stats({ median: 0.3 })])).median).toBe(0.1)
    expect(variantMetrics(inspected([stats({ median: 0, saturatedShare: null })]))).toMatchObject({ relativeNoise: null, clippedHigh: null, fwhm: null })
    expect(variantMetrics(inspected([]))).toEqual({ median: 0, noise: 0, relativeNoise: null, clippedHigh: null, clippedLow: 0, fwhm: null })
  })

  it('[PE-005] Given two or more measured variants, When their figures are set side by side, Then each figure names the lowest and none is called the winner', () => {
    const m = (over: Partial<VariantMetrics>): VariantMetrics => ({ median: 0.2, noise: 0.02, relativeNoise: 0.1, clippedHigh: 0, clippedLow: 0, fwhm: 3, ...over })
    expect(
      metricNotes([
        { letter: 'A', metrics: m({ relativeNoise: 0.05, clippedHigh: 0.02, fwhm: null }) },
        { letter: 'B', metrics: m({ relativeNoise: 0.08, clippedHigh: 0.01, clippedLow: 0.1 }) },
        { letter: 'C', metrics: m({ relativeNoise: 0.05, clippedHigh: null, fwhm: 2 }) }
      ])
    ).toEqual([
      'Least grainy background (noise over median): A and C.',
      'Fewest clipped highlights: B.',
      'Fewest crushed shadows: A and C.',
      'Tightest brightest star (FWHM): C.',
      'No one figure picks the best image: smoothing lowers noise and loses detail, and a strong stretch clips. Look at them.'
    ])
    expect(metricNotes([{ letter: 'A', metrics: m({}) }, { letter: 'B', metrics: m({}) }])).toEqual([
      'Least grainy background (noise over median): the same in every variant.',
      'Fewest clipped highlights: the same in every variant.',
      'Fewest crushed shadows: the same in every variant.',
      'Tightest brightest star (FWHM): the same in every variant.',
      'No one figure picks the best image: smoothing lowers noise and loses detail, and a strong stretch clips. Look at them.'
    ])
    expect(metricNotes([{ letter: 'A', metrics: m({}) }])).toEqual([])
  })
})

describe('the report', () => {
  const variant = (over: Partial<ReportVariant> = {}): ReportVariant => ({
    letter: 'A',
    parameters: { profile: 'galaxy', quality: 'normal' },
    state: 'succeeded',
    preferred: true,
    run: { program: 'bash', args: ['postprocess.sh', 'D:/m31/result.fit', '--target=M31-exp1-A', '--no-bxt'], cwd: 'D:/m31', tools: [{ id: 'siril', version: '1.4.0' }], jobId: 'j1' },
    exitCode: 0,
    startedAt: new Date('2026-10-26T02:00:00Z'),
    finishedAt: new Date('2026-10-26T02:20:00Z'),
    outputDir: 'D:/m31/processed/M31-exp1-A',
    outputs: [{ path: 'D:/m31/processed/M31-exp1-A/final.fit', name: 'final.fit', sizeBytes: 12, sha256: 'sha256:f' }],
    ...over
  })
  const input = (over: Partial<ExperimentReportInput> = {}): ExperimentReportInput => ({
    name: 'Stretch test',
    objective: 'Galaxy or broadband?',
    target: 'M 31',
    input: { path: 'D:/m31/result.fit', sizeBytes: 1000, modifiedAt: null, sha256: 'sha256:abc' },
    inputUnchanged: true,
    variants: [variant(), variant({ letter: 'B', preferred: false, state: 'not run', run: null, exitCode: null, startedAt: null, finishedAt: null, outputs: null, outputDir: 'D:/m31/processed/M31-exp1-B' })],
    createdAt: new Date('2026-10-25T20:00:00Z'),
    at: new Date('2026-10-26T09:00:00Z'),
    ...over
  })

  it('[PE-007] Given an experiment, When reported as JSON, Then the input, each variant\'s settings, run, exit code and files, and what reproducing it takes are all there', () => {
    const json = JSON.parse(experimentReportJson(input()))
    expect(json).toMatchObject({ experiment: 'Stretch test', objective: 'Galaxy or broadband?', target: 'M 31', created: '2026-10-25T20:00:00.000Z', reported: '2026-10-26T09:00:00.000Z' })
    expect(json.input).toEqual({ path: 'D:/m31/result.fit', sizeBytes: 1000, modified: null, sha256: 'sha256:abc', unchanged: true })
    expect(json.variants[0]).toEqual({
      variant: 'A',
      profile: 'galaxy',
      quality: 'normal',
      state: 'succeeded',
      preferred: true,
      program: 'bash',
      args: ['postprocess.sh', 'D:/m31/result.fit', '--target=M31-exp1-A', '--no-bxt'],
      cwd: 'D:/m31',
      tools: [{ id: 'siril', version: '1.4.0' }],
      job: 'j1',
      exitCode: 0,
      started: '2026-10-26T02:00:00.000Z',
      finished: '2026-10-26T02:20:00.000Z',
      outputDir: 'D:/m31/processed/M31-exp1-A',
      outputs: [{ path: 'D:/m31/processed/M31-exp1-A/final.fit', name: 'final.fit', sizeBytes: 12, sha256: 'sha256:f' }]
    })
    expect(json.variants[1]).toMatchObject({ variant: 'B', state: 'not run', program: null, args: null, cwd: null, tools: null, job: null, outputs: null })
    expect(json.reproducibility).toEqual(['The same input (by SHA-256), the same arguments and the same tool versions are needed to make the same files again.'])
  })

  it('[PE-007] Given RC Astro in a run or a tool with no version, When reproducibility is said, Then each is named as a limit', () => {
    const rc = variant({ run: { ...(variant().run as NonNullable<ReportVariant['run']>), args: ['postprocess.sh'], tools: [{ id: 'rc-astro', version: null }] } })
    expect(reproducibility([rc])).toEqual([
      'The same input (by SHA-256), the same arguments and the same tool versions are needed to make the same files again.',
      'RC Astro’s BlurXTerminator, NoiseXTerminator and StarXTerminator are proprietary and their AI models change between versions, so a run with other versions will not match exactly.',
      'A tool did not report its version, so that part cannot be pinned.'
    ])
  })

  it('[PE-007] Given an experiment, When reported in Markdown, Then a person reads the input, whether it changed, each variant and how to reproduce it', () => {
    const md = experimentReportMarkdown(input())
    expect(md.split('\n')).toEqual([
      '# Stretch test',
      '',
      'Experiment on M 31, made 2026-10-25T20:00:00.000Z, reported 2026-10-26T09:00:00.000Z.',
      '',
      'Objective: Galaxy or broadband?',
      '',
      '## Input',
      '',
      '- D:/m31/result.fit',
      '- 1000 bytes, SHA-256 sha256:abc',
      '- unchanged since the experiment was made',
      '',
      '## Variant A (preferred)',
      '',
      '- Profile galaxy, quality normal',
      '- State: succeeded, exit code 0',
      '- Ran: `bash postprocess.sh D:/m31/result.fit --target=M31-exp1-A --no-bxt` in D:/m31',
      '- Tools: siril 1.4.0',
      '- Output folder: D:/m31/processed/M31-exp1-A',
      '  - final.fit: 12 bytes, SHA-256 sha256:f',
      '',
      '## Variant B',
      '',
      '- Profile galaxy, quality normal',
      '- State: not run',
      '- Output folder: D:/m31/processed/M31-exp1-B',
      '',
      '## Reproducing it',
      '',
      '- The same input (by SHA-256), the same arguments and the same tool versions are needed to make the same files again.',
      ''
    ])
    expect(experimentReportMarkdown(input({ inputUnchanged: false, objective: '' }))).toContain('- CHANGED since the experiment was made: these results no longer describe it')
    expect(experimentReportMarkdown(input({ inputUnchanged: null }))).toContain('- could not be read to check it is unchanged')
    expect(experimentReportMarkdown(input({ objective: '' }))).not.toContain('Objective')
    expect(experimentReportMarkdown(input({ variants: [variant({ run: { ...(variant().run as NonNullable<ReportVariant['run']>), tools: [{ id: 'siril', version: null }] } })] }))).toContain(
      '- Tools: siril (version unknown)'
    )
    expect(experimentReportMarkdown(input({ variants: [variant({ run: { ...(variant().run as NonNullable<ReportVariant['run']>), tools: [] } })] }))).toContain('- Tools: none recorded')
  })

  it('[PE-007] Given a name, When the report is named, Then it is safe as a file name', () => {
    expect(experimentReportName(' Stretch test: M31? ', 'md')).toBe('Stretch_test_M31-experiment.md')
    expect(experimentReportName('***', 'json')).toBe('experiment-experiment.json')
  })
})
