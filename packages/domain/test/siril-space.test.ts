import { describe, it, expect } from 'vitest'
import {
  estimateSirilSpace,
  geometryFromFileSize,
  missingCalibration,
  recommendSirilScript,
  SIRIL_SCRIPTS,
  spaceVerdict,
  spaceState,
  stackRefusal,
  type FrameCounts
} from '@astro/domain'

const counts = (lights: number, darks = 0, flats = 0, biases = 0): FrameCounts => ({ lights, darks, flats, biases })
const megapixel = { width: 1000, height: 1000 }
const script = (id: string) => SIRIL_SCRIPTS.find(s => s.id === id) ?? SIRIL_SCRIPTS[0]

describe('Siril space estimate', () => {
  it('[RCP-002] Given 10 lights and 5 of each calibration frame at one megapixel, When OSC_Preprocessing is estimated, Then each stage adds up as in the space estimator', () => {
    const e = estimateSirilSpace('OSC_Preprocessing', counts(10, 5, 5, 5), megapixel)
    // Biases 10 MB + 4 MB, flats 10 + 20 + 4, darks 10 + 4, lights 20 + 120 + 120 + 12 + 12 (MB).
    expect(e.totalBytes).toBe(346_000_000)
    expect(e.stages.map(s => s.name)).toEqual([
      'Convert biases', 'Stack biases (master)', 'Convert flats', 'Calibrate flats', 'Stack flats (master)',
      'Convert darks', 'Stack darks (master)', 'Convert lights', 'Calibrate lights (debayer)', 'Register lights',
      'Stack result (32-bit RGB)', 'Save final'
    ])
    expect(e.stages.at(-1)?.cumulativeBytes).toBe(e.totalBytes)
    expect(e.stages.find(s => s.name === 'Register lights')).toMatchObject({ bytes: 120_000_000, files: 10 })
  })

  it('[RCP-002] Given the same frames, When every script is estimated, Then mono needs a third of colour for its lights and Ha+OIII extraction needs the most', () => {
    const c = counts(100, 20, 20, 20)
    const total = (id: Parameters<typeof estimateSirilSpace>[0]) => estimateSirilSpace(id, c, megapixel).totalBytes
    expect(total('OSC_Preprocessing_WithoutDBF')).toBe(100 * 2e6 + 2 * 100 * 12e6 + 12e6)
    expect(total('OSC_Preprocessing_WithoutFlat')).toBe(20 * 2e6 + 4e6 + total('OSC_Preprocessing_WithoutDBF'))
    expect(total('Mono_Preprocessing')).toBeLessThan(total('OSC_Preprocessing'))
    expect(total('OSC_Extract_HaOIII')).toBeGreaterThan(total('OSC_Extract_Ha'))
    expect(total('OSC_Preprocessing_BayerDrizzle')).toBeLessThan(total('OSC_Preprocessing'))
  })

  it('[RCP-004] Given a 16-bit frame of 50 MB with no indexed header, When its size is guessed, Then it is a square of two bytes a pixel', () => {
    expect(geometryFromFileSize(50_000_000)).toEqual({ width: 5000, height: 5000 })
    expect(geometryFromFileSize(0)).toEqual({ width: 1, height: 1 })
  })
})

describe('Siril script choice', () => {
  it('[RCP-001] Given colour frames with biases, flats and darks, When a script is picked, Then it is the full OSC script', () => {
    expect(recommendSirilScript(counts(50, 10, 10, 10), 'colour')).toEqual({ script: 'OSC_Preprocessing', reason: 'Colour frames with biases, flats and darks.' })
  })

  it('[RCP-001] Given colour frames with darks and flats but no biases, When a script is picked, Then darks only, saying the flats are left out', () => {
    const choice = recommendSirilScript(counts(50, 10, 10), 'colour')
    expect(choice.script).toBe('OSC_Preprocessing_WithoutFlat')
    expect(choice.reason).toBe("Colour frames with darks. Siril's scripts use flats only with all three sets, so they are left out.")
  })

  it('[RCP-001] Given Seestar lights alone, When a script is picked, Then lights only', () => {
    expect(recommendSirilScript(counts(300), 'colour')).toEqual({ script: 'OSC_Preprocessing_WithoutDBF', reason: 'Colour frames with no darks.' })
    expect(recommendSirilScript(counts(300, 0, 5, 5), 'colour').reason).toMatch(/biases and flats only with all three sets/)
  })

  it('[RCP-001] Given mono frames without flats, When a script is picked, Then none fits and the reason names what is missing', () => {
    expect(recommendSirilScript(counts(40, 10, 0, 10), 'mono')).toEqual({ script: null, reason: "Siril's mono script needs biases, flats and darks; there are no flats." })
    expect(recommendSirilScript(counts(40, 10, 10, 10), 'mono').script).toBe('Mono_Preprocessing')
  })

  it('[RCP-001] Given no lights, When a script is picked, Then none, because there is nothing to stack', () => {
    expect(recommendSirilScript(counts(0, 10, 10, 10), 'colour').script).toBeNull()
  })

  it('[RCP-005] Given a target with darks only, When the full OSC script is checked, Then biases and flats are missing', () => {
    expect(missingCalibration(script('OSC_Preprocessing'), counts(10, 5))).toEqual(['biases', 'flats'])
    expect(missingCalibration(script('OSC_Preprocessing_WithoutDBF'), counts(10))).toEqual([])
  })
})

describe('space verdict', () => {
  it('[RCP-003] Given a run bigger than the free space, When judged, Then it is short by the difference', () => {
    expect(spaceVerdict(100, 50)).toEqual({ neededBytes: 100, fits: false, headroomBytes: null, shortBytes: 50 })
    expect(spaceVerdict(100, 150)).toEqual({ neededBytes: 100, fits: true, headroomBytes: 50, shortBytes: null })
    expect(spaceVerdict(100, 100)).toEqual({ neededBytes: 100, fits: true, headroomBytes: 0, shortBytes: null })
  })

  it('[RCP-003] Given free space the system will not report, When judged, Then no verdict of short is made', () => {
    expect(spaceVerdict(100, null)).toEqual({ neededBytes: 100, fits: true, headroomBytes: null, shortBytes: null })
  })
})

describe('one rule for queueing a stack', () => {
  const fits = spaceVerdict(10, 100)
  const short = spaceVerdict(100, 10)
  const unknown = spaceVerdict(10, null)
  const facts = { lights: 40, missing: [] as string[], verdict: fits, mixesFilters: false }

  it('[HEX-012] [JOB-007] Given a known, fitting, short or unknown space, When summarised, Then it reads fits, short or unknown', () => {
    expect([fits, short, unknown].map(spaceState)).toEqual(['fits', 'short', 'unknown'])
  })

  it('[HEX-012] [JOB-001] Given lights, calibration and room on the disk, When asked, Then nothing stops the stack', () => {
    expect(stackRefusal(facts)).toBeNull()
  })

  it('[HEX-012] [RIG-018] [JOB-001] [JOB-007] Given each thing that stops a stack, When asked, Then the first one is the refusal', () => {
    expect(stackRefusal({ ...facts, mixesFilters: true, lights: 0 })).toBe('mixes-filters')
    expect(stackRefusal({ ...facts, lights: 0, missing: ['flats'] })).toBe('no-lights')
    expect(stackRefusal({ ...facts, missing: ['flats'], verdict: short })).toBe('missing-calibration')
    expect(stackRefusal({ ...facts, verdict: unknown })).toBe('space-unknown')
    expect(stackRefusal({ ...facts, verdict: short })).toBe('short-of-space')
  })
})

describe('Siril space estimate, stage by stage', () => {
  // 100 pixels: 200 bytes a 16-bit frame, 400 a 32-bit mono frame, 1200 a 32-bit RGB frame.
  const tiny = { width: 10, height: 10 }
  const all = counts(7, 5, 3, 2)
  const masters: [string, number, number][] = [
    ['Convert biases', 400, 2], ['Stack biases (master)', 400, 1],
    ['Convert flats', 600, 3], ['Calibrate flats', 1200, 3], ['Stack flats (master)', 400, 1],
    ['Convert darks', 1000, 5], ['Stack darks (master)', 400, 1]
  ]
  const stages = (id: Parameters<typeof estimateSirilSpace>[0], c = all) => {
    const e = estimateSirilSpace(id, c, tiny)
    let sum = 0
    for (const s of e.stages) {
      sum += s.bytes
      expect(s.cumulativeBytes).toBe(sum)
    }
    expect(e.totalBytes).toBe(sum)
    expect(e.script).toBe(id)
    return e.stages.map(s => [s.name, s.bytes, s.files])
  }

  it('[RCP-002] Given 7 lights, 5 darks, 3 flats and 2 biases of 100 pixels, When each colour script is estimated, Then every stage has its own name, bytes and file count', () => {
    expect(stages('OSC_Preprocessing')).toEqual([
      ...masters, ['Convert lights', 1400, 7], ['Calibrate lights (debayer)', 8400, 7], ['Register lights', 8400, 7],
      ['Stack result (32-bit RGB)', 1200, 1], ['Save final', 1200, 1]
    ])
    expect(stages('OSC_Preprocessing_WithoutFlat')).toEqual([
      ['Convert darks', 1000, 5], ['Stack darks', 400, 1], ['Convert lights', 1400, 7], ['Calibrate lights (debayer)', 8400, 7],
      ['Register lights', 8400, 7], ['Stack result', 1200, 1]
    ])
    expect(stages('OSC_Preprocessing_WithoutDBF')).toEqual([
      ['Convert lights', 1400, 7], ['Calibrate lights (debayer)', 8400, 7], ['Register lights', 8400, 7], ['Stack result', 1200, 1]
    ])
    expect(stages('OSC_Preprocessing_BayerDrizzle')).toEqual([
      ...masters, ['Convert lights', 1400, 7], ['Calibrate lights (CFA)', 2800, 7], ['Register (Bayer drizzle)', 8400, 7],
      ['Stack result (32-bit RGB)', 1200, 1], ['Save final', 1200, 1]
    ])
  })

  it('[RCP-002] Given the same frames, When the extraction and mono scripts are estimated, Then every stage has its own name, bytes and file count', () => {
    expect(stages('OSC_Extract_Ha')).toEqual([
      ...masters, ['Convert lights', 1400, 7], ['Calibrate lights (CFA)', 2800, 7], ['Extract Ha (upscale)', 2800, 7],
      ['Register Ha', 2800, 7], ['Stack Ha (32-bit)', 400, 1], ['Save final', 400, 1]
    ])
    expect(stages('OSC_Extract_HaOIII')).toEqual([
      ...masters, ['Convert lights', 1400, 7], ['Calibrate lights (CFA)', 2800, 7], ['Extract Ha + OIII', 5600, 7],
      ['Register Ha', 2800, 7], ['Stack Ha (32-bit)', 400, 1], ['Register OIII', 2800, 7], ['Stack OIII (32-bit)', 400, 1],
      ['Align + normalize results', 1600, 1]
    ])
    expect(stages('Mono_Preprocessing')).toEqual([
      ...masters, ['Convert lights', 1400, 7], ['Calibrate lights', 2800, 7], ['Register lights', 2800, 7],
      ['Stack result (32-bit)', 400, 1], ['Save final', 400, 1]
    ])
  })

  it('[RCP-002] Given one calibration set at a time, When a script with masters is estimated, Then only that set gets convert and stack stages', () => {
    expect(stages('Mono_Preprocessing', counts(1, 0, 0, 1)).slice(0, 3)).toEqual([['Convert biases', 200, 1], ['Stack biases (master)', 400, 1], ['Convert lights', 200, 1]])
    expect(stages('OSC_Extract_Ha', counts(1, 0, 1, 0)).slice(0, 4)).toEqual([['Convert flats', 200, 1], ['Calibrate flats', 400, 1], ['Stack flats (master)', 400, 1], ['Convert lights', 200, 1]])
    expect(stages('OSC_Preprocessing_BayerDrizzle', counts(1, 1, 0, 0)).slice(0, 3)).toEqual([['Convert darks', 200, 1], ['Stack darks (master)', 400, 1], ['Convert lights', 200, 1]])
    expect(stages('OSC_Extract_HaOIII', counts(1)).slice(0, 1)).toEqual([['Convert lights', 200, 1]])
    expect(stages('OSC_Preprocessing', counts(1)).slice(0, 1)).toEqual([['Convert lights', 200, 1]])
    expect(stages('OSC_Preprocessing_WithoutFlat', counts(1)).slice(0, 1)).toEqual([['Convert lights', 200, 1]])
    expect(stages('OSC_Preprocessing_WithoutFlat', counts(1, 1)).slice(0, 2)).toEqual([['Convert darks', 200, 1], ['Stack darks', 400, 1]])
  })

  it('[RCP-004] Given a missing header and a file size that is not a whole square, When the size is guessed, Then the side is rounded to the nearest pixel', () => {
    expect(geometryFromFileSize(2 * 99.4 * 99.4)).toEqual({ width: 99, height: 99 })
    expect(geometryFromFileSize(2 * 99.6 * 99.6)).toEqual({ width: 100, height: 100 })
    expect(geometryFromFileSize(0.5)).toEqual({ width: 1, height: 1 })
  })
})

describe('Siril script choice, every reason', () => {
  it('[RCP-001] Given mono frames with no calibration at all, When a script is picked, Then none fits and the reason lists all three sets', () => {
    expect(recommendSirilScript(counts(40), 'mono')).toEqual({ script: null, reason: "Siril's mono script needs biases, flats and darks; there are no biases, flats and darks." })
    expect(recommendSirilScript(counts(40, 0, 3), 'mono').reason).toBe("Siril's mono script needs biases, flats and darks; there are no biases and darks.")
    expect(recommendSirilScript(counts(40, 1, 1, 1), 'mono')).toEqual({ script: 'Mono_Preprocessing', reason: 'Mono frames with biases, flats and darks.' })
  })

  it('[RCP-001] Given no lights, When a script is picked, Then the reason says there is nothing to stack', () => {
    expect(recommendSirilScript(counts(0, 10, 10, 10), 'mono')).toEqual({ script: null, reason: 'There are no light frames to stack.' })
    expect(recommendSirilScript(counts(0), 'colour')).toEqual({ script: null, reason: 'There are no light frames to stack.' })
  })

  it('[RCP-001] Given colour lights with darks alone, or with biases but no darks, When a script is picked, Then the reason says exactly what is used and left out', () => {
    expect(recommendSirilScript(counts(10, 1), 'colour')).toEqual({ script: 'OSC_Preprocessing_WithoutFlat', reason: 'Colour frames with darks.' })
    expect(recommendSirilScript(counts(10, 1, 0, 1), 'colour')).toEqual({
      script: 'OSC_Preprocessing_WithoutFlat',
      reason: "Colour frames with darks. Siril's scripts use biases only with all three sets, so they are left out."
    })
    expect(recommendSirilScript(counts(10, 0, 0, 1), 'colour')).toEqual({
      script: 'OSC_Preprocessing_WithoutDBF',
      reason: "Colour frames with no darks. Siril's scripts use biases only with all three sets, so they are left out."
    })
    expect(recommendSirilScript(counts(10, 0, 1, 1), 'colour').reason).toBe("Colour frames with no darks. Siril's scripts use biases and flats only with all three sets, so they are left out.")
    expect(recommendSirilScript(counts(1, 1, 1, 1), 'colour').script).toBe('OSC_Preprocessing')
  })

  it('[RCP-005] Given one frame of a calibration set, When a script is checked, Then that set is not missing', () => {
    expect(missingCalibration(script('Mono_Preprocessing'), counts(1, 1, 0, 1))).toEqual(['flats'])
    expect(missingCalibration(script('OSC_Preprocessing_WithoutFlat'), counts(1, 0, 1, 1))).toEqual(['darks'])
  })

  it('[RCP-001] Given the stock scripts, When listed, Then each says its sensor and the calibration it reads', () => {
    expect(SIRIL_SCRIPTS.map(s => [s.id, s.sensor, s.needs.join('+')])).toEqual([
      ['OSC_Preprocessing', 'colour', 'biases+flats+darks'],
      ['OSC_Preprocessing_WithoutFlat', 'colour', 'darks'],
      ['OSC_Preprocessing_WithoutDBF', 'colour', ''],
      ['OSC_Preprocessing_BayerDrizzle', 'colour', 'biases+flats+darks'],
      ['OSC_Extract_Ha', 'colour', 'biases+flats+darks'],
      ['OSC_Extract_HaOIII', 'colour', 'biases+flats+darks'],
      ['Mono_Preprocessing', 'mono', 'biases+flats+darks']
    ])
  })
})

describe('one rule for queueing a stack, at its edges', () => {
  it('[HEX-012] [JOB-007] Given a run that only just fits, When summarised, Then it is not short', () => {
    expect(spaceState(spaceVerdict(100, 100))).toBe('fits')
    expect(spaceState({ neededBytes: 1, fits: true, headroomBytes: 0, shortBytes: null })).toBe('fits')
    expect(spaceState({ neededBytes: 1, fits: false, headroomBytes: null, shortBytes: 0 })).toBe('short')
  })

  it('[HEX-012] [JOB-001] Given one light and one missing set, When asked, Then the stack is refused for missing calibration', () => {
    const fits = spaceVerdict(10, 100)
    expect(stackRefusal({ lights: 1, missing: [], verdict: fits, mixesFilters: false })).toBeNull()
    expect(stackRefusal({ lights: 1, missing: ['darks'], verdict: fits, mixesFilters: false })).toBe('missing-calibration')
    expect(stackRefusal({ lights: 1, missing: [], verdict: spaceVerdict(10, null), mixesFilters: false })).toBe('space-unknown')
  })
})
