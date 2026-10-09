import { describe, expect, it } from 'vitest'
import {
  afterInterruption,
  explainSirilFailure,
  KNOWN_SIRIL_FAILURES,
  newResults,
  progressText,
  resumeFrom,
  runKey,
  splitSirilScript,
  stackManifest,
  stepScript,
  stockScriptOf,
  type SirilPlacement
} from '@astro/domain'

/** Shaped like Siril 1.2's OSC_Preprocessing.ssf. */
const OSC = `############################################
# Script for Siril 1.2
############################################
requires 1.2.0

# Convert Bias Frames to .fit files
cd biases
convert bias -out=../process
cd ../process

# Stack Bias Frames to bias_stacked.fit
stack bias rej 3 3 -nonorm -out=../masters/bias_stacked
cd ..

cd flats
convert flat -out=../process
cd ../process
calibrate flat -bias=../masters/bias_stacked
stack pp_flat rej 3 3 -norm=mul -out=../masters/pp_flat_stacked
cd ..

cd lights
convert light -out=../process
cd ../process
calibrate light -flat=../masters/pp_flat_stacked -cfa -equalize_cfa -debayer
register pp_light
stack r_pp_light rej 3 3 -norm=addscale -output_norm -rgb_equal -32b -out=result
load result
mirrorx -bottomup
save ../result_$LIVETIME:%d$s
cd ..
close
`

describe('splitting a Siril script', () => {
  it('[PRV-003] Given a stock script, When split, Then each step ends on a command that saves its work, and load and save stay together', () => {
    const steps = splitSirilScript(OSC)
    expect(steps?.map(s => s.label)).toEqual([
      'convert bias', 'stack bias', 'convert flat', 'calibrate flat', 'stack pp_flat', 'convert light', 'calibrate light', 'register pp_light', 'stack r_pp_light', 'load result'
    ])
    expect(steps?.[1]).toMatchObject({ cwd: 'biases', session: ['requires 1.2.0'], commands: ['cd ../process', 'stack bias rej 3 3 -nonorm -out=../masters/bias_stacked'] })
    expect(steps?.[2].cwd).toBe('process')
    expect(steps?.[2].commands).toEqual(['cd ..', 'cd flats', 'convert flat -out=../process'])
    expect(steps?.[9].commands).toEqual(['load result', 'mirrorx -bottomup', 'save ../result_$LIVETIME:%d$s', 'cd ..'])
  })

  it('[PRV-003] Given a step, When written as a script, Then it sets the session up and moves to its folder first', () => {
    const steps = splitSirilScript(OSC) ?? []
    expect(stepScript(steps[0])).toBe('requires 1.2.0\ncd biases\nconvert bias -out=../process\n')
    expect(stepScript(steps[8])).toBe('requires 1.2.0\ncd "process"\nstack r_pp_light rej 3 3 -norm=addscale -output_norm -rgb_equal -32b -out=result\n')
  })

  it('[PRV-003] Given settings part way through, When split, Then later steps carry them and earlier ones do not', () => {
    const steps = splitSirilScript('requires 1.2.0\nconvert light\nsetcompress 1 -type=rice 16\nregister light\nstack r_light\n') ?? []
    expect(steps.map(s => s.session)).toEqual([['requires 1.2.0'], ['requires 1.2.0', 'setcompress 1 -type=rice 16'], ['requires 1.2.0', 'setcompress 1 -type=rice 16']])
  })

  it('[PRV-003] Given a script that leaves the work folder or names an absolute path, When split, Then it is not split, so it runs whole', () => {
    expect(splitSirilScript('cd ..\nconvert light')).toBeNull()
    expect(splitSirilScript('cd C:/astro\nconvert light')).toBeNull()
    expect(splitSirilScript('cd "/data"\nconvert light')).toBeNull()
    expect(splitSirilScript('# nothing\nclose\n')).toBeNull()
    expect(splitSirilScript('cd lights\ncd ..\n')).toBeNull()
  })
})

describe('carrying on', () => {
  const frames: SirilPlacement[] = [
    { from: '/a/L1.fit', folder: 'lights', name: 'L1.fit' },
    { from: '/a/D1.fit', folder: 'darks', name: 'D1.fit' }
  ]

  it('[PRV-004] [PRV-005] Given the same script and frames in any order, When keyed, Then the key matches; a frame or script changed, Then it does not', () => {
    const key = runKey(OSC, frames)
    expect(runKey(OSC, [...frames].reverse())).toBe(key)
    expect(runKey(OSC, frames.slice(0, 1))).not.toBe(key)
    expect(runKey(`${OSC}\n# edited`, frames)).not.toBe(key)
  })

  it('[PRV-005] Given a frame rewritten in place or one left in a folder by hand, When keyed with the input folders, Then the key changes', () => {
    const at = new Date('2026-01-10T22:00:00Z')
    const inputs = [{ folder: 'lights' as const, name: 'L1.fit', sizeBytes: 100, modifiedAt: at }, { folder: 'darks' as const, name: 'D1.fit', sizeBytes: 50, modifiedAt: at }]
    const key = runKey(OSC, frames, inputs)
    expect(runKey(OSC, frames, [...inputs].reverse())).toBe(key)
    expect(runKey(OSC, frames, [{ ...inputs[0], modifiedAt: new Date('2026-01-11T22:00:00Z') }, inputs[1]])).not.toBe(key)
    expect(runKey(OSC, frames, [...inputs, { folder: 'darks', name: 'by-hand.fit', sizeBytes: 50, modifiedAt: at }])).not.toBe(key)
  })

  it('[PRV-004] [PRV-005] Given saved progress, When the step to start from is asked, Then it carries on only for the same key and step count', () => {
    const progress = { step: 3, of: 10, key: 'k', label: 'calibrate flat' }
    expect(resumeFrom(progress, 'k', 10)).toBe(3)
    expect(resumeFrom(progress, 'other', 10)).toBe(0)
    expect(resumeFrom(progress, 'k', 9)).toBe(0)
    expect(resumeFrom(null, 'k', 10)).toBe(0)
    expect(resumeFrom({ ...progress, step: 12 }, 'k', 10)).toBe(10)
  })

  it('[PRV-004] Given a job stopped part way through its steps, When the app starts again, Then it says it carries on from the next step', () => {
    expect(afterInterruption({ attempts: 1, progress: { step: 4, of: 10, key: 'k', label: 'x' } }).note).toBe(
      'The app closed while it ran, so it carries on from step 5 of 10 if the frames have not changed.'
    )
    expect(afterInterruption({ attempts: 1, progress: { step: 0, of: 10, key: 'k', label: 'x' } }).note).toMatch(/from the beginning/)
    expect(afterInterruption({ attempts: 2, progress: { step: 4, of: 10, key: 'k', label: 'x' } }).state).toBe('failed')
  })

  it('[PRV-003] Given progress, When shown, Then it names the step running or how many are done', () => {
    expect(progressText({ step: 3, of: 10, key: 'k', label: 'register pp_light' })).toBe('Step 4 of 10: register pp_light')
    expect(progressText({ step: 10, of: 10, key: 'k', label: null })).toBe('10 of 10 steps done')
  })

  it('[PRV-003] Given a Siril stack command, When its stock script is asked, Then it is found; other commands have none', () => {
    expect(stockScriptOf({ program: 'siril-cli', args: ['-d', '/w', '-s', '/s/OSC.ssf'], cwd: '/w' })).toEqual({ program: 'siril-cli', workDir: '/w', script: '/s/OSC.ssf' })
    expect(stockScriptOf({ program: 'bash', args: ['postprocess.sh', '-p', 'galaxy'], cwd: '/w' })).toBeNull()
  })
})

describe('publishing', () => {
  it('[PRV-002] Given results before and after a run, When compared, Then new and rewritten files are the run\'s, untouched ones are not', () => {
    const old = { path: '/w/result_60s.fit', sizeBytes: 10, modifiedAt: new Date(1000) }
    const rewritten = { path: '/w/result_120s.fit', sizeBytes: 10, modifiedAt: new Date(1000) }
    const after = [old, { ...rewritten, modifiedAt: new Date(2000) }, { path: '/w/result_180s.fit', sizeBytes: 5, modifiedAt: null }]
    expect(newResults([old, rewritten], after).map(r => r.path)).toEqual(['/w/result_120s.fit', '/w/result_180s.fit'])
  })

  it('[PRV-001] Given a published result, When its manifest is made, Then it names the result, the script, each step and every frame by folder', () => {
    const m = stackManifest({
      result: { path: 'D:\\work\\result_120s.fit', sizeBytes: 99, modifiedAt: null },
      target: { id: 'm42', name: 'M 42' },
      job: { id: 'j1', title: 'Stack M 42', startedAt: new Date('2026-09-30T01:00:00Z') },
      finishedAt: new Date('2026-09-30T02:00:00Z'),
      program: 'siril-cli',
      script: 'C:\\Siril\\scripts\\OSC_Preprocessing.ssf',
      steps: [{ label: 'convert light', seconds: 30, resumed: false }],
      placements: [
        { from: '/a/L2.fit', folder: 'lights', name: 'L2.fit' },
        { from: '/a/L1.fit', folder: 'lights', name: 'L1.fit' },
        { from: '/a/F1.fit', folder: 'flats', name: 'F1.fit' }
      ],
      rejected: ['/a/L9.fit', '/a/L3.fit']
    })
    expect(m).toEqual({
      format: 'astrorepo-stack-manifest',
      version: 1,
      result: { file: 'result_120s.fit', sizeBytes: 99 },
      target: { id: 'm42', name: 'M 42' },
      job: { id: 'j1', title: 'Stack M 42', startedAt: '2026-09-30T01:00:00.000Z', finishedAt: '2026-09-30T02:00:00.000Z' },
      siril: { program: 'siril-cli', script: 'OSC_Preprocessing.ssf' },
      steps: [{ label: 'convert light', seconds: 30, resumed: false }],
      frames: { lights: [{ name: 'L1.fit', source: '/a/L1.fit' }, { name: 'L2.fit', source: '/a/L2.fit' }], darks: [], flats: [{ name: 'F1.fit', source: '/a/F1.fit' }], biases: [] },
      rejected: ['/a/L3.fit', '/a/L9.fit']
    })
  })

  it('[PRV-001] Given a frame in the input folders the app did not place, When the manifest is made, Then it is listed with no source', () => {
    const m = stackManifest({
      result: { path: '/w/result_60s.fit', sizeBytes: 1, modifiedAt: null },
      target: { id: 'm42', name: null },
      job: { id: 'j1', title: 'Stack', startedAt: null },
      finishedAt: new Date('2026-09-30T02:00:00Z'),
      program: 'siril-cli',
      script: 'x.ssf',
      steps: [],
      placements: [{ from: '/a/L1.fit', folder: 'lights', name: 'L1.fit' }],
      inputs: [
        { folder: 'lights', name: 'L1.fit', sizeBytes: 1, modifiedAt: null },
        { folder: 'darks', name: 'master_dark.fit', sizeBytes: 1, modifiedAt: null }
      ],
      rejected: []
    })
    expect(m.frames).toEqual({ lights: [{ name: 'L1.fit', source: '/a/L1.fit' }], darks: [{ name: 'master_dark.fit', source: null }], flats: [], biases: [] })
  })
})

describe('known Siril failures', () => {
  it.each([
    ['Error: No space left on device', /disk filled up/],
    ['Not enough memory to do this operation', /ran out of memory/],
    ['This script needs a more recent version of Siril', /older than the script needs/],
    ['Unknown command: seqextract_Green', /did not know a command/],
    ['Registration aborted: not enough stars', /enough stars/],
    ['Images do not have the same size', /not all the same size/],
    ['Image is not a CFA image', /colour \(Bayer\)/],
    ['No files to convert in this folder', /folder the script reads was empty/],
    ['Cannot open file process/pp_light_00001.fit: Permission denied', /could not open or write/]
  ])('[PRV-006] Given a log ending "%s", When explained, Then the reason and fix are named', (line, reason) => {
    const known = explainSirilFailure(`log: Siril 1.2.6\nreading\n${line}\nexiting`)
    expect(known?.reason).toMatch(reason)
    expect(known?.fix.length).toBeGreaterThan(10)
  })

  it('[PRV-006] Given a log with no known message, When explained, Then nothing is claimed; with two, Then the last wins', () => {
    expect(explainSirilFailure('all fine\nexit 1')).toBeNull()
    expect(explainSirilFailure('Not enough memory\nlater: No space left on device')?.reason).toMatch(/disk/)
    expect(KNOWN_SIRIL_FAILURES.length).toBeGreaterThanOrEqual(9)
  })
})
