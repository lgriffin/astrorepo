import { describe, expect, it } from 'vitest'
import {
  calibratesOnBoard,
  channelGap,
  checkCalibration,
  commonImageScale,
  DEFAULT_GRADE_LIMITS,
  drizzleAdvice,
  estimateStackMemory,
  gradeFrames,
  imageScaleArcsec,
  memoryFit,
  planNights,
  rejectionAdvice,
  stackChannels,
  type CalibrationFrame,
  type FrameIndexSettings,
  type GradableLight
} from '@astro/domain'
import { subs, target } from '@astro/testkit'

const GB = 1024 ** 3

const light = (over: Partial<FrameIndexSettings> = {}): FrameIndexSettings => ({
  exposureSec: 300, gain: 100, sensorTempC: -10, filter: null, capturedAt: null, focalMm: 250, pixelUm: 2.9, scope: 'Vaonis Vespera Pro', ...over
})
const frame = (kind: CalibrationFrame['kind'], over: Partial<CalibrationFrame> = {}): CalibrationFrame => ({
  kind, exposureSec: 300, gain: 100, sensorTempC: -10, filter: null, ...over
})

describe('image scale', () => {
  it('[ADV-003] Given focal length and pixel size, When the scale is worked out, Then it is 206.265 × pixel ÷ focal', () => {
    expect(imageScaleArcsec(250, 2.9)).toBeCloseTo(2.393, 3)
    expect(imageScaleArcsec(null, 2.9)).toBeNull()
    expect(imageScaleArcsec(250, 0)).toBeNull()
  })

  it('[ADV-003] Given lights from two set-ups, When the common scale is asked, Then the one most lights share wins, and none says when no light knows', () => {
    const lights = [light(), light(), light({ focalMm: 500 })]
    expect(commonImageScale(lights)).toBe(2.39)
    expect(commonImageScale([light({ focalMm: null })])).toBeNull()
  })
})

describe('memory', () => {
  it('[ADV-001] Given a colour stack, When its memory is estimated, Then one pass holds every light in three float channels, and blocks need far less', () => {
    const need = estimateStackMemory('OSC_Preprocessing', 100, { width: 1000, height: 1000 })
    const frameBytes = 1000 * 1000 * 4 * 3
    expect(need.onePassBytes).toBe(0.5 * GB + 102 * frameBytes)
    expect(need.minimumBytes).toBe(0.5 * GB + 100 * 1000 * 4 * 3 * 32 + 2 * frameBytes)
    expect(need.minimumBytes).toBeLessThan(need.onePassBytes)
  })

  it('[ADV-001] Given mono and extraction scripts, When channels are counted, Then they integrate one; colour scripts three', () => {
    expect(stackChannels('Mono_Preprocessing')).toBe(1)
    expect(stackChannels('OSC_Extract_HaOIII')).toBe(1)
    expect(stackChannels('OSC_Preprocessing_WithoutDBF')).toBe(3)
  })

  it('[ADV-002] Given the PC\'s memory, When a stack is checked, Then it fits in one pass, in blocks, or is short with what to do', () => {
    const need = { onePassBytes: 10 * GB, minimumBytes: 2 * GB }
    expect(memoryFit(need, { totalBytes: 32 * GB, availableBytes: 20 * GB })).toEqual({ fit: 'one-pass', text: 'Fits in memory: 10 GB of 20 GB free.' })
    expect(memoryFit(need, { totalBytes: 32 * GB, availableBytes: 4 * GB }).fit).toBe('blocks')
    const closing = memoryFit(need, { totalBytes: 16 * GB, availableBytes: 1 * GB })
    expect(closing.fit).toBe('short')
    expect(closing.text).toMatch(/Close other programs/)
    const fewer = memoryFit(need, { totalBytes: 2 * GB, availableBytes: 1 * GB })
    expect(fewer.text).toMatch(/Stack fewer lights at a time/)
    expect(memoryFit(need, null)).toMatchObject({ fit: 'unknown' })
  })
})

describe('drizzle', () => {
  it('[ADV-004] Given the scale and the lights, When drizzle is weighed, Then it is suggested only for undersampled colour stacks with enough frames', () => {
    expect(drizzleAdvice('colour', 2.4, 150)).toMatchObject({ suggest: true })
    expect(drizzleAdvice('colour', 2.4, 40)).toMatchObject({ suggest: false, reason: expect.stringMatching(/too few/) })
    expect(drizzleAdvice('colour', 1.2, 400)).toMatchObject({ suggest: false, reason: expect.stringMatching(/well sampled/) })
    expect(drizzleAdvice('colour', null, 400)).toMatchObject({ suggest: false, reason: expect.stringMatching(/unknown/) })
    expect(drizzleAdvice('mono', 3, 400)).toMatchObject({ suggest: false, reason: expect.stringMatching(/colour cameras/) })
  })
})

describe('rejection', () => {
  it('[ADV-009] Given the kept lights, When rejection is advised, Then it steps from none to percentile, Winsorized and GESDT', () => {
    expect(rejectionAdvice(2).siril).toBe('rej n')
    expect(rejectionAdvice(5).siril).toBe('rej p 0.2 0.1')
    expect(rejectionAdvice(10).siril).toBe('rej w 3 3')
    expect(rejectionAdvice(49).method).toBe('Winsorized sigma clipping')
    expect(rejectionAdvice(50).siril).toBe('rej g 0.3 0.05')
  })
})

describe('calibration', () => {
  it('[ADV-005] Given darks that match, When checked, Then they match; and kinds with no frames say so', () => {
    const checks = checkCalibration([light()], [frame('dark'), frame('dark')])
    expect(checks.find(c => c.kind === 'dark')).toMatchObject({ status: 'matches', count: 2, text: '2 darks match the lights.' })
    expect(checks.find(c => c.kind === 'flat')).toMatchObject({ status: 'none', text: 'No flats in this folder.' })
  })

  it('[ADV-005] Given darks too warm and short, flats of another filter and biases of another gain, When checked, Then each says what differs', () => {
    const checks = checkCalibration(
      [light({ filter: 'Ha' })],
      [frame('dark', { sensorTempC: 5, exposureSec: 60 }), frame('flat', { filter: 'OIII' }), frame('bias', { gain: 200 })]
    )
    const text = (kind: string) => checks.find(c => c.kind === kind)?.text
    expect(text('dark')).toBe("The darks do not match the lights: the nearest has sensor at 5 °C against the lights' -10 °C and 60 s exposures against the lights' 300 s. Siril will still use them, which can add noise or leave amp glow and dust.")
    expect(text('flat')).toMatch(/filter OIII against the lights' Ha/)
    expect(text('bias')).toMatch(/gain 200 against the lights' 100/)
  })

  it('[ADV-005] Given darks that match some lights but not others, When checked, Then it says some', () => {
    const checks = checkCalibration([light(), light({ exposureSec: 60 })], [frame('dark')])
    expect(checks[0]).toMatchObject({ status: 'mismatch', gaps: [{ mismatches: ["300 s exposures against the lights' 60 s"] }] })
    expect(checks[0].text).toMatch(/^The darks do not match some lights/)
  })

  it('[ADV-006] Given Seestar lights and no calibration frames, When checked, Then none are needed', () => {
    expect(calibratesOnBoard('ZWO Seestar S50')).toBe(true)
    expect(calibratesOnBoard(null)).toBe(false)
    const checks = checkCalibration([light({ scope: 'Seestar S50' })], [])
    expect(checks.map(c => c.status)).toEqual(['not-needed', 'not-needed', 'not-needed'])
    expect(checks[0].text).toBe('No darks needed: the Seestar calibrates its frames on board.')
  })
})

describe('nights', () => {
  const lightOn = (id: string, at: string, fwhm: number): GradableLight => ({
    fileId: id, path: `/d/${id}.fit`, capturedAt: new Date(at), filter: null, override: null, measureError: null,
    measurement: { fwhm, eccentricity: 0.3, starCount: 300, background: 1000, noise: 20, snr: 40 }
  })

  it('[ADV-007] Given lights over two nights and flats from one, When nights are planned, Then each night has its lights, kept, median FWHM and flats, and the shared flats are called out', () => {
    const report = gradeFrames(
      [
        lightOn('a', '2026-01-10T22:00:00Z', 2), lightOn('b', '2026-01-10T23:00:00Z', 4), lightOn('c', '2026-01-10T23:30:00Z', 3),
        lightOn('d', '2026-01-12T01:00:00Z', 3)
      ],
      DEFAULT_GRADE_LIMITS
    )
    const plan = planNights(report, [{ capturedAt: new Date('2026-01-10T21:00:00Z') }, { capturedAt: null }])
    expect(plan.nights).toEqual([
      { night: '2026-01-10', lights: 3, kept: 3, rejected: 0, medianFwhm: 3, flats: 1, leftOut: false },
      { night: '2026-01-11', lights: 1, kept: 1, rejected: 0, medianFwhm: 3, flats: 0, leftOut: false }
    ])
    expect(plan.sharedFlatsNote).toMatch(/^1 of 2 nights have no flats of their own/)
  })

  it('[ADV-008] Given a night left out, When nights are planned, Then it says so; a frame rejected by hand does not', () => {
    const report = gradeFrames(
      [
        { ...lightOn('a', '2026-01-10T22:00:00Z', 2), override: 'reject' },
        { ...lightOn('d', '2026-01-12T01:00:00Z', 3), override: 'reject', overrideBy: 'night' }
      ],
      DEFAULT_GRADE_LIMITS
    )
    expect(planNights(report, []).nights.map(n => [n.night, n.leftOut])).toEqual([['2026-01-10', false], ['2026-01-11', true]])
    expect(report.grades.find(g => g.fileId === 'd')?.reasons[0]).toBe('Left out with its night.')
  })

  it('[ADV-007] Given one night, or no flats at all, When nights are planned, Then there is no shared flats note; undated lights group as unknown', () => {
    const one = gradeFrames([lightOn('a', '2026-01-10T22:00:00Z', 2)], DEFAULT_GRADE_LIMITS)
    expect(planNights(one, []).sharedFlatsNote).toBeNull()
    const undated = gradeFrames([{ ...lightOn('x', '2026-01-10T22:00:00Z', 2), capturedAt: null }, lightOn('a', '2026-01-10T22:00:00Z', 2)], DEFAULT_GRADE_LIMITS)
    const plan = planNights(undated, [])
    expect(plan.nights.map(n => n.night)).toEqual(['2026-01-10', 'Unknown date'])
    expect(plan.sharedFlatsNote).toBeNull()
  })
})

describe('channel balance', () => {
  it('[ADV-010] Given far less OIII than Ha, When the target is weighed, Then OIII is the gap; balanced or one-shot colour targets have none', () => {
    const ha = subs(72, 300, '2026-01-10T21:00:00Z', { filter: 'Ha' })
    const oiii = subs(8, 300, '2026-01-11T21:00:00Z', { filter: 'OIII' })
    expect(channelGap(target('NGC 7000', { subs: [...ha, ...oiii] }))).toEqual({ filter: 'OIII', haveSec: 2400, leadFilter: 'Ha', leadSec: 21600 })
    expect(channelGap(target('NGC 7000', { subs: [...ha, ...subs(40, 300, '2026-01-11T21:00:00Z', { filter: 'OIII' })] }))).toBeNull()
    expect(channelGap(target('M 42', { subs: subs(40, 10, '2026-01-11T21:00:00Z') }))).toBeNull()
    expect(channelGap(target('NGC 7000', { subs: [...ha, ...subs(8, 300, '2026-01-11T21:00:00Z', { filter: 'OIII', rejected: true })] }))).toBeNull()
  })

  it('[ADV-010] Given LRGB with far more luminance than colour, When weighed, Then luminance is not the lead', () => {
    const lrgb = ['R', 'G', 'B'].flatMap(f => subs(20, 300, '2026-01-10T21:00:00Z', { filter: f }))
    expect(channelGap(target('M 101', { subs: [...subs(200, 300, '2026-01-10T21:00:00Z', { filter: 'L' }), ...lrgb] }))).toBeNull()
  })

  it('[ADV-010] Given a filter with a goal and no frames yet, When weighed, Then it is the gap at nothing', () => {
    const t = target('NGC 7000', { subs: subs(72, 300, '2026-01-10T21:00:00Z', { filter: 'Ha' }), filterGoals: [{ filter: 'Ha', goalSec: 21600 }, { filter: 'OIII', goalSec: 21600 }] })
    expect(channelGap(t)).toEqual({ filter: 'OIII', haveSec: 0, leadFilter: 'Ha', leadSec: 21600 })
  })
})
