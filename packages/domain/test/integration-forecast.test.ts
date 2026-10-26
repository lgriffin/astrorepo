import { describe, expect, it } from 'vitest'
import {
  FORECAST_MODEL,
  MIN_SAMPLE,
  NEXT_HOUR_SEC,
  acceptanceRange,
  forecastGain,
  gainPercent,
  rankExposure,
  summarise,
  summariseByFilter,
  timeToGoal,
  type ForecastFrame
} from '@astro/domain'

const frame = (over: Partial<ForecastFrame> = {}): ForecastFrame => ({ seconds: 300, filter: 'Ha', accepted: true, snr: null, ...over })
const many = (n: number, over: Partial<ForecastFrame> = {}) => Array.from({ length: n }, () => frame(over))
const H = 3600

describe('integration summaries', () => {
  it('[AI-001] Given kept and rejected lights, When summed, Then acquired and accepted exposure are counted independently with the acceptance', () => {
    const s = summarise([...many(8), ...many(2, { accepted: false }), frame({ seconds: null }), frame({ seconds: 0, accepted: false })])
    expect(s).toEqual({ filter: null, frames: 12, acceptedFrames: 9, acquiredSec: 3000, acceptedSec: 2400, acceptance: 0.75, measured: 0, weightedSec: null, weights: [] })
    expect(summarise([])).toMatchObject({ frames: 0, acceptance: null, acquiredSec: 0 })
  })

  it('[AI-001] Given lights of several filters, When summed by filter, Then each filter has its own summary and spellings of one filter are one', () => {
    const { all, byFilter } = summariseByFilter([frame(), frame({ filter: ' ha ' }), frame({ filter: 'OIII', accepted: false }), frame({ filter: null }), frame({ filter: '  ' })])
    expect(all.frames).toBe(5)
    expect(byFilter.map(s => [s.filter, s.frames, s.acceptedFrames])).toEqual([
      ['Ha', 2, 2],
      ['No filter', 2, 2],
      ['OIII', 1, 0]
    ])
  })

  it('[AI-001, AI-007] Given enough measured kept frames, When summed, Then accepted exposure is also weighted by SNR² against the median frame', () => {
    const lights = [...many(MIN_SAMPLE - 1, { snr: 10 }), frame({ snr: 20 }), frame({ snr: null }), frame({ accepted: false, snr: 50 })]
    const s = summarise(lights)
    expect(s.measured).toBe(MIN_SAMPLE)
    // Nine at weight 1, one at 4, and the unmeasured one at the median's worth.
    expect(s.weightedSec).toBeCloseTo(300 * (9 + 4 + 1))
    expect(s.weights).toHaveLength(MIN_SAMPLE)
    expect(summarise(many(MIN_SAMPLE - 1, { snr: 10 })).weightedSec).toBeNull()
  })
})

describe('the figures exactly', () => {
  it('[AI-007] Given an even number of measured frames in any order, When weighted, Then each weight is its SNR² over the median of the middle two', () => {
    const s = summarise([...[14, 5, 9, 12, 6, 11, 7, 13, 8, 10].map(snr => frame({ snr })), frame({ accepted: false, snr: 3 })])
    // SNR² median: (81 + 100) / 2 = 90.5.
    expect(s.weights.map(w => w.toFixed(4))).toEqual([196, 25, 81, 144, 36, 121, 49, 169, 64, 100].map(q => (q / 90.5).toFixed(4)))
    expect(s.weightedSec).toBeCloseTo(3265.19337, 4)
  })

  it('[AI-007] Given an odd number of measured frames, When weighted, Then the median is the middle one, and frames measured at 0 or with no time count as the median\'s worth or nothing', () => {
    const s = summarise([...[3, 1, 2, 5, 4, 7, 6, 9, 8, 11, 10].map(snr => frame({ snr })), frame({ snr: 0 }), frame({ seconds: -5 })])
    expect(s.measured).toBe(11)
    expect(s.weights[0]).toBeCloseTo(9 / 36)
    // Eleven measured (their weights sum to 50.6/3.6), the one at 0 at weight 1, the one of -5 s adding no time.
    expect(s.weightedSec).toBeCloseTo(300 * (506 / 36 + 1))
    expect(s.acquiredSec).toBe(12 * 300)
  })

  it('[AI-002, AI-007] Given measured frames of spread quality, When an hour is forecast, Then the gain and range are those of the weighted time and the 10th and 90th percentile weights', () => {
    const s = summarise([...[14, 5, 9, 12, 6, 11, 7, 13, 8, 10].map(snr => frame({ snr })), frame({ accepted: false })])
    const f = forecastGain(s, H)
    expect(f.snrGain).toBeCloseTo(1.41502909, 6)
    expect(f.range?.low).toBeCloseTo(1.13486881, 6)
    expect(f.range?.high).toBeCloseTo(1.74608033, 6)
  })

  it('[AI-002, AI-005] Given 3 of 4 frames kept, When the range and time to goal are worked out, Then they are the 90% Wilson interval and the shortfall over its ends', () => {
    const r = acceptanceRange(3, 4)
    expect(r.low).toBeCloseTo(0.35613991, 6)
    expect(r.high).toBeCloseTo(0.94209936, 6)
    const t = timeToGoal(summarise([frame(), frame(), frame(), frame({ accepted: false })]), 2 * H)
    expect(t.captureSec).toBeCloseTo(8400)
    expect(t.range?.low).toBeCloseTo(6687.19271, 3)
    expect(t.range?.high).toBeCloseTo(17689.67729, 3)
    expect(timeToGoal(summarise([]), 0)).toEqual({ needSec: 0, captureSec: 0, range: { low: 0, high: 0 } })
  })

  it('[AI-003] Given exactly the sample size of unmeasured frames, When forecast, Then it is no longer a rough guide but says frames are not measured', () => {
    expect(forecastGain(summarise(many(MIN_SAMPLE)), H).assumptions[2]).toBe(`Frames are not measured yet (0 of ${MIN_SAMPLE}), so every frame counts the same.`)
  })
})

describe('forecasts', () => {
  it('[AI-003] Given nothing captured or nothing accepted, When a forecast is asked, Then it is an insufficient-data state with no number', () => {
    const none = forecastGain(summarise([]), H)
    expect(none).toMatchObject({ kind: 'insufficient data', snrGain: null, range: null, expectedAcceptedSec: null, model: FORECAST_MODEL, addedSec: H })
    expect(none.assumptions).toEqual(['Nothing captured yet, so there is nothing to improve on.'])
    expect(forecastGain(summarise(many(3, { accepted: false })), H).assumptions).toEqual(['Nothing accepted yet, so there is nothing to improve on.'])
    expect(forecastGain(summarise(many(3, { seconds: null })), H).kind).toBe('insufficient data')
  })

  it('[AI-002] Given accepted light, When an hour more is forecast, Then the square-root gain at the acceptance so far comes with its assumptions and inputs', () => {
    // 12 frames of 300 s, 9 kept: 45 min accepted at 75%.
    const s = summarise([...many(9), ...many(3, { accepted: false })])
    const f = forecastGain(s, H)
    expect(f.kind).toBe('theoretical')
    expect(f.expectedAcceptedSec).toBe(2700)
    expect(f.snrGain).toBeCloseTo(Math.sqrt((2700 + 2700) / 2700))
    expect(f.range?.low).toBeLessThan(f.snrGain as number)
    expect(f.range?.high).toBeGreaterThan(f.snrGain as number)
    expect(f.inputs).toEqual({ frames: 12, acceptedFrames: 9, acquiredSec: 3600, acceptedSec: 2700, measured: 0, weightedSec: null })
    expect(f.assumptions).toEqual([
      'Signal to noise grows with the square root of accepted exposure: subs are comparable and limited by sky background.',
      'New capture is accepted at the rate so far: 75% of 12 frames.',
      'Frames are not measured yet (0 of 9), so every frame counts the same.',
      'Same scope, camera, filter and sky as before; seeing, moon and season are not modelled.'
    ])
  })

  it('[AI-003] Given fewer frames than the sample needs, When forecast, Then it is theoretical and says to treat it as a rough guide', () => {
    const f = forecastGain(summarise([frame()]), H)
    expect(f.kind).toBe('theoretical')
    expect(f.assumptions[1]).toBe('New capture is accepted at the rate so far: 100% of 1 frame.')
    expect(f.assumptions[2]).toBe(`Only 1 frame so far, under ${MIN_SAMPLE}: treat this as a rough guide.`)
    expect(forecastGain(summarise(many(4)), H).assumptions[2]).toBe(`Only 4 frames so far, under ${MIN_SAMPLE}: treat this as a rough guide.`)
  })

  it('[AI-002, AI-007] Given enough measured frames, When forecast, Then it is measured, starts from the weighted exposure and its range spans the frames\' quality', () => {
    const lights = [...many(5, { snr: 8 }), ...many(5, { snr: 12 }), ...many(2, { accepted: false })]
    const s = summarise(lights)
    const f = forecastGain(s, H)
    expect(f.kind).toBe('measured')
    expect(f.snrGain).toBeCloseTo(Math.sqrt(((s.weightedSec as number) + H * (10 / 12)) / (s.weightedSec as number)))
    expect(f.assumptions[2]).toBe('New frames are worth what the 10 measured frames are, by star SNR²; the range spans their 10th to 90th percentile.')
    const flat = forecastGain(summarise(many(12, { snr: 10 })), H)
    expect((f.range?.high as number) - (f.range?.low as number)).toBeGreaterThan((flat.range?.high as number) - (flat.range?.low as number))
  })

  it('[AI-002] Given more capture, When forecast, Then the gain grows but each extra hour buys less', () => {
    const s = summarise(many(24))
    const [half, one, two] = [1800, H, 2 * H].map(sec => forecastGain(s, sec).snrGain as number)
    expect(half).toBeLessThan(one)
    expect(one).toBeLessThan(two)
    expect(two - one).toBeLessThan(one - 1)
  })

  it('[AI-002] Given acceptance from few frames, When its range is worked out, Then it is wide, and narrows with more frames', () => {
    const few = acceptanceRange(3, 4)
    const lots = acceptanceRange(300, 400)
    expect(few.low).toBeLessThan(0.75)
    expect(few.high).toBeGreaterThan(0.75)
    expect(lots.high - lots.low).toBeLessThan(few.high - few.low)
    expect(acceptanceRange(0, 0)).toEqual({ low: 0, high: 1 })
    expect(acceptanceRange(5, 5).high).toBe(1)
    expect(acceptanceRange(0, 5).low).toBe(0)
  })
})

describe('time to a goal', () => {
  it('[AI-005] Given a goal, When asked how long, Then the capture still needed is the shortfall over the acceptance, with a range', () => {
    const s = summarise([...many(9), ...many(3, { accepted: false })])
    const t = timeToGoal(s, 2 * H)
    expect(t.needSec).toBe(2 * H - 2700)
    expect(t.captureSec).toBeCloseTo((2 * H - 2700) / 0.75)
    expect(t.range?.low).toBeLessThan(t.captureSec as number)
    expect(t.range?.high).toBeGreaterThan(t.captureSec as number)
    expect(timeToGoal(s, 1800)).toEqual({ needSec: 0, captureSec: 0, range: { low: 0, high: 0 } })
  })

  it('[AI-003, AI-005] Given nothing accepted, When asked how long, Then the shortfall is known but the capture time is not claimed', () => {
    expect(timeToGoal(summarise([]), H)).toEqual({ needSec: H, captureSec: null, range: null })
    expect(timeToGoal(summarise(many(2, { accepted: false })), H)).toEqual({ needSec: H, captureSec: null, range: null })
    // Everything accepted from one frame: the low end of the acceptance is above zero.
    expect(Number.isFinite(timeToGoal(summarise([frame()]), H).range?.high as number)).toBe(true)
  })
})

describe('ranking the next hour', () => {
  it('[AI-006] Given candidates, When ranked, Then the one an hour helps most comes first and those with nothing accepted follow by name', () => {
    const ranked = rankExposure([
      { id: 'deep', label: 'M 31 L', summary: summarise(many(48)) },
      { id: 'none', label: 'B', summary: summarise([]) },
      { id: 'thin', label: 'M 31 OIII', summary: summarise(many(6)) },
      { id: 'none2', label: 'A', summary: summarise([]) }
    ])
    expect(ranked.map(r => r.id)).toEqual(['thin', 'deep', 'none2', 'none'])
    expect(ranked[0].forecast.addedSec).toBe(NEXT_HOUR_SEC)
  })

  it('[AI-006] Given gains, When put as percentages, Then whole percents above 1% and one place below', () => {
    expect(gainPercent(1.08)).toBe('+8%')
    expect(gainPercent(1.004)).toBe('+0.4%')
    expect(gainPercent(1.5)).toBe('+50%')
  })
})
