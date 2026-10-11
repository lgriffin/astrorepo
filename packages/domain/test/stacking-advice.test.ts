import { describe, expect, it } from 'vitest'
import {
  calibratesOnBoard,
  calibrationMismatches,
  channelGap,
  checkCalibration,
  commonImageScale,
  DEFAULT_GRADE_LIMITS,
  drizzleAdvice,
  filterTotals,
  estimateStackMemory,
  gradeFrames,
  imageScaleArcsec,
  laggingFilter,
  memoryFit,
  planNights,
  rejectionAdvice,
  SIRIL_MEMORY_RATIO,
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

  it('[ADV-002] Given the PC\'s memory, When a stack is checked, Then it fits in one pass, falls back to blocks, or warns that it is short and what to do', () => {
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

describe('image scale and memory in detail', () => {
  it('[ADV-003] Given a negative focal length or pixel size, When the scale is worked out, Then none is claimed', () => {
    expect(imageScaleArcsec(-250, 2.9)).toBeNull()
    expect(imageScaleArcsec(250, -2.9)).toBeNull()
    expect(imageScaleArcsec(250, null)).toBeNull()
    expect(imageScaleArcsec(206.265, 1)).toBe(1)
  })

  it('[ADV-003] Given scales that round alike and a tie, When the common scale is asked, Then rounding groups them and the first seen wins a tie', () => {
    // 2.9 µm at 250 mm is 2.3927"/px; 2.902 µm is 2.3943"/px: both 2.39.
    expect(commonImageScale([light({ focalMm: 500 }), light(), light({ pixelUm: 2.902 })])).toBe(2.39)
    expect(commonImageScale([light({ focalMm: 500 }), light()])).toBe(1.2)
    expect(commonImageScale([])).toBeNull()
  })

  it('[ADV-001] Given a mono stack of one light, When its memory is estimated, Then the least it needs is four frames, not one block', () => {
    const frameBytes = 1000 * 1000 * 4
    expect(estimateStackMemory('Mono_Preprocessing', 1, { width: 1000, height: 1000 })).toEqual({ onePassBytes: 0.5 * GB + 3 * frameBytes, minimumBytes: 0.5 * GB + 4 * frameBytes })
    expect(estimateStackMemory('OSC_Extract_Ha', 200, { width: 100, height: 50 })).toEqual({
      onePassBytes: 0.5 * GB + 202 * 100 * 50 * 4,
      minimumBytes: 0.5 * GB + 200 * 100 * 4 * 32 + 2 * 100 * 50 * 4
    })
    expect(stackChannels('OSC_Extract_Ha')).toBe(1)
    expect(stackChannels('OSC_Preprocessing')).toBe(3)
  })

  it('[ADV-002] Given a stack needing exactly the usable memory, When checked, Then it fits in one pass; a byte more falls back to slower blocks', () => {
    const usable = 10 * GB * SIRIL_MEMORY_RATIO
    const memory = { totalBytes: 32 * GB, availableBytes: 10 * GB }
    expect(memoryFit({ onePassBytes: usable, minimumBytes: GB }, memory)).toEqual({ fit: 'one-pass', text: 'Fits in memory: 9.0 GB of 10 GB free.' })
    expect(memoryFit({ onePassBytes: usable + 1, minimumBytes: usable }, memory)).toEqual({
      fit: 'blocks',
      text: 'Siril will stack in blocks, which is slower: 9.0 GB for one pass, 10 GB free.'
    })
  })

  it('[ADV-002] Given a stack short of memory, When checked, Then it says how short and whether closing programs is enough, up to exactly the usable total', () => {
    const need = { onePassBytes: 40 * GB, minimumBytes: 20 * GB * SIRIL_MEMORY_RATIO }
    expect(memoryFit(need, { totalBytes: 20 * GB, availableBytes: 4 * GB })).toEqual({
      fit: 'short',
      text: 'Short of memory: needs at least 18 GB, 4.0 GB free of 20 GB. Close other programs, or let it run in the night window.'
    })
    expect(memoryFit({ ...need, minimumBytes: need.minimumBytes + 1 }, { totalBytes: 20 * GB, availableBytes: 4 * GB }).text).toBe(
      'Short of memory: needs at least 18 GB, 4.0 GB free of 20 GB. Stack fewer lights at a time, by night.'
    )
    expect(memoryFit({ onePassBytes: 9.5 * GB, minimumBytes: GB }, null)).toEqual({
      fit: 'unknown',
      text: 'Needs 9.5 GB to stack in one pass; the PC did not say how much memory it has.'
    })
  })
})

describe('drizzle and rejection in detail', () => {
  it('[ADV-004] Given a colour stack at exactly 2"/px and exactly 100 lights, When drizzle is weighed, Then it is suggested, with the reason', () => {
    expect(drizzleAdvice('colour', 2, 100)).toEqual({
      suggest: true,
      reason: 'At 2.00"/px the stars are undersampled and 100 lights are enough: Bayer drizzle can recover finer detail, if the frames were dithered.'
    })
  })

  it('[ADV-004] Given a stack just short of each condition, When drizzle is weighed, Then it is not suggested and each reason is given in full', () => {
    expect(drizzleAdvice('colour', 2.4, 99).reason).toBe('At 2.40"/px drizzle could help, but 99 lights are too few to fill its finer grid; it pays from about 100, dithered.')
    expect(drizzleAdvice('colour', 1.996, 400).reason).toBe('At 2.00"/px the stars are already well sampled; drizzle would add disk and time for little.')
    expect(drizzleAdvice('colour', null, 400).reason).toBe('The lights do not record focal length and pixel size, so the image scale is unknown.')
    expect(drizzleAdvice('mono', 3, 400).reason).toBe("Siril's stock drizzle script is for colour cameras.")
  })

  it('[ADV-009] Given three, nine and ten lights, When rejection is advised, Then each step starts exactly there, with its reason', () => {
    expect(rejectionAdvice(3)).toEqual({ method: 'Percentile clipping', siril: 'rej p 0.2 0.1', reason: 'Under ten lights, sigma statistics are unreliable; percentile clipping works from the median.' })
    expect(rejectionAdvice(9).method).toBe('Percentile clipping')
    expect(rejectionAdvice(2)).toEqual({ method: 'None', siril: 'rej n', reason: 'With fewer than three lights there is nothing to compare a pixel against.' })
    expect(rejectionAdvice(10)).toEqual({ method: 'Winsorized sigma clipping', siril: 'rej w 3 3', reason: 'From ten lights, Winsorized sigma clipping removes satellites and planes without eating signal.' })
    expect(rejectionAdvice(49).siril).toBe('rej w 3 3')
    expect(rejectionAdvice(50)).toEqual({ method: 'Generalized extreme studentized deviate', siril: 'rej g 0.3 0.05', reason: 'From fifty lights, GESDT finds every outlier in a pixel stack, not just the worst.' })
  })
})

describe('calibration in detail', () => {
  const base = { exposureSec: 300, gain: 100, sensorTempC: -10, filter: 'Ha' }

  it('[ADV-005] Given darks at the edge of each tolerance, When compared, Then only what is past it is named, with fractions to one place', () => {
    expect(calibrationMismatches(frame('dark', { sensorTempC: -8, exposureSec: 301 }), base)).toEqual([])
    expect(calibrationMismatches(frame('dark', { sensorTempC: -7.5, exposureSec: 301.5, gain: 100.5 }), base)).toEqual([
      "sensor at -7.5 °C against the lights' -10 °C",
      "301.5 s exposures against the lights' 300 s",
      "gain 100.5 against the lights' 100"
    ])
    expect(calibrationMismatches(frame('dark', { sensorTempC: null, exposureSec: null, gain: null }), base)).toEqual([])
    expect(calibrationMismatches(frame('dark', { gain: 101 }), { ...base, gain: null })).toEqual([])
  })

  it('[ADV-005] Given biases and flats, When compared, Then biases are judged on gain only and flats on filter only, ignoring case and spaces', () => {
    expect(calibrationMismatches(frame('bias', { sensorTempC: 20, exposureSec: 0.001, gain: 0 }), base)).toEqual(["gain 0 against the lights' 100"])
    expect(calibrationMismatches(frame('flat', { sensorTempC: 20, exposureSec: 2, gain: 0, filter: ' ha ' }), base)).toEqual([])
    expect(calibrationMismatches(frame('flat', { filter: 'OIII ' }), { ...base, filter: ' Ha' })).toEqual(["filter OIII against the lights' Ha"])
    expect(calibrationMismatches(frame('flat', { filter: '  ' }), base)).toEqual([])
    expect(calibrationMismatches(frame('flat', { filter: 'OIII' }), { ...base, filter: null })).toEqual([])
    expect(calibrationMismatches(frame('flat', { filter: null }), base)).toEqual([])
  })

  it('[ADV-005] Given lights whose temperatures round alike, When checked against warm darks, Then they are one setting and the nearest dark is named', () => {
    const checks = checkCalibration(
      [light({ sensorTempC: -10.2 }), light({ sensorTempC: -9.8 })],
      [frame('dark', { sensorTempC: 5, exposureSec: 60, gain: 200 }), frame('dark', { sensorTempC: 5 })]
    )
    expect(checks[0]).toMatchObject({ kind: 'dark', status: 'mismatch', count: 2 })
    expect(checks[0].gaps).toEqual([{ light: { exposureSec: 300, gain: 100, sensorTempC: -10.2, filter: null }, mismatches: ["sensor at 5 °C against the lights' -10.2 °C"] }])
    expect(checks[0].text).toBe("The darks do not match the lights: the nearest has sensor at 5 °C against the lights' -10.2 °C. Siril will still use them, which can add noise or leave amp glow and dust.")
  })

  it('[ADV-005] Given darks that all have a match but one that suits no light, When checked, Then the stray is named with its nearest light', () => {
    const lights = [light(), light({ exposureSec: 60, sensorTempC: 0 })]
    const darks = [frame('dark'), frame('dark', { exposureSec: 60, sensorTempC: 0 }), frame('dark', { gain: 200, exposureSec: 60, sensorTempC: 0 })]
    const dark = checkCalibration(lights, darks)[0]
    expect(dark).toMatchObject({ kind: 'dark', status: 'mismatch', count: 3, gaps: [] })
    expect(dark.text).toBe("1 of 3 darks match no lights: the first has gain 200 against the lights' 100. Siril will use them with the rest; move them out of the folder.")
  })

  it('[ADV-005] Given flats and no lights at all, When checked, Then nothing is called unneeded and the flats match', () => {
    const none = checkCalibration([], [frame('flat', { filter: 'Ha' })])
    expect(none.map(c => [c.kind, c.status, c.text])).toEqual([
      ['dark', 'none', 'No darks in this folder.'],
      ['flat', 'matches', '1 flats match the lights.'],
      ['bias', 'none', 'No biases in this folder.']
    ])
  })

  it('[ADV-006] Given lights from a Seestar and another scope, When checked with no frames, Then the frames are missing, not unneeded', () => {
    const checks = checkCalibration([light({ scope: 'Seestar S50' }), light({ scope: 'Vaonis Vespera' })], [])
    expect(checks.map(c => c.status)).toEqual(['none', 'none', 'none'])
    expect(checkCalibration([light({ scope: 'Seestar S50' })], [])[2].text).toBe('No biases needed: the Seestar calibrates its frames on board.')
  })
})

describe('nights in detail', () => {
  const at = (id: string, when: string | null, measurement: GradableLight['measurement']): GradableLight => ({
    fileId: id, path: `/d/${id}.fit`, capturedAt: when ? new Date(when) : null, filter: null, override: null, measureError: null, measurement
  })
  const mm = (fwhm: number | null, eccentricity = 0.3) => ({ fwhm, eccentricity, starCount: 300, background: 1000, noise: 20, snr: 40 })

  it('[ADV-007] Given kept, rejected, unmeasured and shapeless frames, When nights are planned, Then the median FWHM is of kept frames with one, and unmeasured frames count as kept', () => {
    const report = gradeFrames(
      [at('a', '2026-01-10T22:00:00Z', mm(5)), at('b', '2026-01-10T22:10:00Z', mm(1)), at('c', '2026-01-10T22:20:00Z', mm(2)), at('d', '2026-01-10T22:30:00Z', mm(4)),
        at('e', '2026-01-10T22:40:00Z', mm(3, 0.9)), at('f', '2026-01-10T22:50:00Z', null), at('g', '2026-01-10T23:00:00Z', mm(null))],
      { ...DEFAULT_GRADE_LIMITS, maxFwhmRatio: 10 }
    )
    expect(planNights(report, []).nights).toEqual([{ night: '2026-01-10', lights: 7, kept: 6, rejected: 1, medianFwhm: 3, flats: 0, leftOut: false }])
  })

  it('[ADV-007] Given three nights with flats on one, When planned, Then the note counts the nights without flats; every night with flats, Then there is no note', () => {
    const report = gradeFrames(
      [at('a', '2026-01-12T22:00:00Z', mm(2)), at('b', '2026-01-10T22:00:00Z', mm(2)), at('c', '2026-01-11T22:00:00Z', mm(2))],
      DEFAULT_GRADE_LIMITS
    )
    const flat = (when: string) => ({ capturedAt: new Date(when) })
    const one = planNights(report, [flat('2026-01-10T21:00:00Z'), flat('2026-01-10T21:10:00Z')])
    expect(one.nights.map(n => [n.night, n.flats])).toEqual([['2026-01-10', 2], ['2026-01-11', 0], ['2026-01-12', 0]])
    expect(one.sharedFlatsNote).toBe(
      "2 of 3 nights have no flats of their own. Siril's stock scripts make one master flat for every night, so dust that moved between sessions will not calibrate out."
    )
    expect(planNights(report, [flat('2026-01-10T21:00:00Z'), flat('2026-01-11T21:00:00Z'), flat('2026-01-12T21:00:00Z')]).sharedFlatsNote).toBeNull()
    expect(planNights(report, [{ capturedAt: null }]).sharedFlatsNote).toMatch(/^3 of 3 nights/)
  })
})

describe('channel balance in detail', () => {
  it('[ADV-010] Given the least filter at exactly a third of the most, When weighed, Then it is balanced; just under, Then it is the gap', () => {
    expect(laggingFilter([{ filter: 'Ha', sec: 900 }, { filter: 'OIII', sec: 300 }])).toBeNull()
    expect(laggingFilter([{ filter: 'Ha', sec: 900 }, { filter: 'OIII', sec: 299 }])).toEqual({ filter: 'OIII', haveSec: 299, leadFilter: 'Ha', leadSec: 900 })
    expect(laggingFilter([{ filter: 'Ha', sec: 900 }])).toBeNull()
  })

  it('[ADV-010] Given filters tied at the bottom and the top, When weighed, Then the names decide which is the gap and which leads', () => {
    expect(laggingFilter([{ filter: 'S', sec: 1000 }, { filter: 'R', sec: 1000 }, { filter: 'G', sec: 10 }, { filter: 'B', sec: 10 }])).toEqual({ filter: 'B', haveSec: 10, leadFilter: 'S', leadSec: 1000 })
  })

  it('[ADV-010] Given filters spelled differently and luminance, When totalled, Then spellings merge under the first seen, and luminance counts only when asked', () => {
    const t = target('M 101', {
      subs: [...subs(2, 300, '2026-01-10T21:00:00Z', { filter: ' Ha ' }), ...subs(1, 300, '2026-01-10T22:00:00Z', { filter: 'ha' }), ...subs(1, 60, '2026-01-10T23:00:00Z', { filter: 'Lum' }), ...subs(1, 60, '2026-01-10T23:30:00Z')],
      filterGoals: [{ filter: 'OIII', goalSec: 3600 }]
    })
    expect(filterTotals(t)).toEqual([{ filter: 'Ha', sec: 900 }, { filter: 'OIII', sec: 0 }])
    expect(filterTotals(t, { withLuminance: true })).toEqual([{ filter: 'Ha', sec: 900 }, { filter: 'Lum', sec: 60 }, { filter: 'OIII', sec: 0 }])
  })
})
