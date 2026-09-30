import { describe, it, expect } from 'vitest'
import {
  estimateSirilSpace,
  geometryFromFileSize,
  missingCalibration,
  recommendSirilScript,
  SIRIL_SCRIPTS,
  spaceVerdict,
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
  it('[RCP-003] Given a run bigger than the free space, When judged, Then it is short by the difference, crediting what an earlier run left', () => {
    expect(spaceVerdict(100, 30, 50)).toEqual({ netBytes: 70, fits: false, headroomBytes: null, shortBytes: 20 })
    expect(spaceVerdict(100, 0, 150)).toEqual({ netBytes: 100, fits: true, headroomBytes: 50, shortBytes: null })
    expect(spaceVerdict(100, 200, 0)).toEqual({ netBytes: 0, fits: true, headroomBytes: 0, shortBytes: null })
  })

  it('[RCP-003] Given free space the system will not report, When judged, Then no verdict of short is made', () => {
    expect(spaceVerdict(100, 0, null)).toEqual({ netBytes: 100, fits: true, headroomBytes: null, shortBytes: null })
  })
})
