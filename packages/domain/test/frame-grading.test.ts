import { describe, expect, it } from 'vitest'
import {
  binBayer,
  DEFAULT_GRADE_LIMITS,
  findPeaks,
  GRADE_CSV_COLUMNS,
  GRADE_LIMIT_KEYS,
  gradeFrames,
  gradesCsv,
  measureFrame,
  measureStar,
  nightTrend,
  parseGradeLimits,
  rejectedPaths,
  skyStatistics,
  type FrameMeasurement,
  type GradableLight,
  type Plane
} from '@astro/domain'

/** A deterministic pseudo-random generator, so the noise is the same on every run. */
function prng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

interface FakeStar {
  x: number
  y: number
  peak: number
  /** Standard deviations along x and y (an elongated star when they differ). */
  sx: number
  sy: number
}

/** A sky with Gaussian noise and Gaussian stars. */
function sky(width: number, height: number, stars: FakeStar[], options: { background?: number; noise?: number; seed?: number } = {}): Plane {
  const background = options.background ?? 1000
  const noise = options.noise ?? 10
  const rand = prng(options.seed ?? 1)
  const data = new Float32Array(width * height)
  for (let i = 0; i < data.length; i++) {
    // Box-Muller from two uniforms.
    const g = Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
    data[i] = background + noise * g
  }
  for (const s of stars) {
    for (let y = Math.max(0, Math.floor(s.y - 8)); y < Math.min(height, s.y + 9); y++) {
      for (let x = Math.max(0, Math.floor(s.x - 8)); x < Math.min(width, s.x + 9); x++) {
        data[y * width + x] += s.peak * Math.exp(-((x - s.x) ** 2) / (2 * s.sx ** 2) - (y - s.y) ** 2 / (2 * s.sy ** 2))
      }
    }
  }
  return { width, height, data }
}

/** A grid of identical stars, well apart. */
function field(sx: number, sy: number, options: { count?: number; peak?: number; noise?: number; background?: number } = {}): Plane {
  const stars: FakeStar[] = []
  const n = options.count ?? 36
  const side = Math.ceil(Math.sqrt(n))
  for (let i = 0; i < n; i++) stars.push({ x: 20 + (i % side) * 25 + 0.3, y: 20 + Math.floor(i / side) * 25 + 0.4, peak: options.peak ?? 2000, sx, sy })
  return sky(20 + side * 25, 20 + side * 25, stars, { noise: options.noise, background: options.background })
}

const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.LN2)

describe('measuring a frame', () => {
  it('[GRD-001] Given round stars of known width, When measured, Then FWHM is close to the truth and eccentricity is near zero', () => {
    const m = measureFrame(field(1.5, 1.5), { binned: false })
    expect(m.fwhm).toBeCloseTo(1.5 * FWHM_PER_SIGMA, 0)
    expect(m.eccentricity).toBeLessThan(0.25)
    expect(m.starCount).toBe(36)
    expect(m.background).toBeCloseTo(1000, -1)
    expect(m.noise).toBeCloseTo(10, 0)
    expect(m.snr).toBeGreaterThan(50)
  })

  it('[GRD-001] Given trailed stars, When measured, Then eccentricity is high', () => {
    const m = measureFrame(field(2.6, 1.2), { binned: false })
    // sqrt(1 - (1.2/2.6)²) is about 0.89.
    expect(m.eccentricity).toBeGreaterThan(0.75)
  })

  it('[GRD-001] Given softer stars, When measured, Then FWHM grows with them', () => {
    const sharp = measureFrame(field(1.2, 1.2), { binned: false })
    const soft = measureFrame(field(2.2, 2.2), { binned: false })
    expect(soft.fwhm ?? 0).toBeGreaterThan((sharp.fwhm ?? 0) * 1.5)
  })

  it('[GRD-001] Given brighter stars over the same noise, When measured, Then SNR is higher', () => {
    const faint = measureFrame(field(1.5, 1.5, { peak: 300 }), { binned: false })
    const bright = measureFrame(field(1.5, 1.5, { peak: 3000 }), { binned: false })
    expect(bright.snr ?? 0).toBeGreaterThan((faint.snr ?? 0) * 5)
  })

  it('[GRD-011] Given a frame with too few stars, When measured, Then FWHM, eccentricity and SNR are not reported', () => {
    const m = measureFrame(field(1.5, 1.5, { count: 3 }), { binned: false })
    expect(m).toMatchObject({ fwhm: null, eccentricity: null, snr: null, starCount: 3 })
  })

  it('[GRD-011] Given a flat frame with no noise, When measured, Then nothing is found and nothing throws', () => {
    const plane: Plane = { width: 40, height: 40, data: new Float32Array(1600).fill(500) }
    expect(measureFrame(plane, { binned: false })).toEqual({ fwhm: null, eccentricity: null, starCount: 0, background: 500, noise: 0, snr: null })
  })

  it('[GRD-001] Given saturated stars, When measured with a saturation level, Then they are counted but not measured for shape', () => {
    const plane = field(1.5, 1.5, { peak: 60000 })
    const m = measureFrame(plane, { binned: false, search: { saturation: 50000 } })
    expect(m.starCount).toBe(36)
    expect(m.fwhm).toBeNull()
  })

  it('[GRD-002] Given a binned colour frame, When measured, Then FWHM is reported in the frame’s own pixels', () => {
    const plane = field(1.5, 1.5)
    const asBinned = measureFrame(plane, { binned: true })
    const asIs = measureFrame(plane, { binned: false })
    expect(asBinned.fwhm).toBeCloseTo((asIs.fwhm ?? 0) * 2, 5)
  })

  it('[GRD-002] Given a Bayer frame, When binned, Then each 2×2 cell becomes one summed pixel and an odd edge is dropped', () => {
    const plane: Plane = { width: 5, height: 3, data: Float32Array.from([1, 2, 3, 4, 99, 5, 6, 7, 8, 99, 99, 99, 99, 99, 99]) }
    expect(binBayer(plane)).toEqual({ width: 2, height: 1, data: Float32Array.from([14, 22]) })
  })

  it('[GRD-002] Given a checkerboard Bayer pattern with no stars, When binned and measured, Then the pattern is not counted as stars', () => {
    const width = 200
    const data = new Float32Array(width * width)
    const rand = prng(7)
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) data[y * width + x] = ((x + y) % 2 ? 2000 : 800) + 5 * (rand() - 0.5)
    const raw = measureFrame({ width, height: width, data }, { binned: false })
    const binned = measureFrame(binBayer({ width, height: width, data }), { binned: true })
    expect(binned.starCount).toBe(0)
    expect(raw.noise).toBeGreaterThan(binned.noise)
  })

  it('[GRD-001] Given a bright star with a lumpy halo, When peaks are found, Then the halo’s small maxima are not counted as more stars', () => {
    const plane = sky(60, 60, [{ x: 30, y: 30, peak: 5000, sx: 2, sy: 2 }, { x: 33, y: 30, peak: 400, sx: 0.8, sy: 0.8 }], { noise: 2 })
    expect(findPeaks(plane, 1100, 6)).toHaveLength(1)
  })

  it('[GRD-001] Given a peak too close to the edge, When its shape is measured, Then it is skipped', () => {
    const plane = field(1.5, 1.5)
    expect(measureStar(plane, 2, 2, 1000, 6)).toBeNull()
  })

  it('[GRD-001] Given a plane, When the sky is measured, Then background and noise come from the median and MAD', () => {
    const { background, noise } = skyStatistics(sky(100, 100, [], { background: 250, noise: 4 }))
    expect(background).toBeCloseTo(250, 0)
    expect(noise).toBeCloseTo(4, 0)
  })
})

const m = (over: Partial<FrameMeasurement> = {}): FrameMeasurement => ({ fwhm: 3, eccentricity: 0.3, starCount: 400, background: 1000, noise: 20, snr: 50, ...over })

let id = 0
function light(over: Partial<GradableLight> = {}): GradableLight {
  id++
  return {
    fileId: `f${id}`,
    path: `/data/Light_${String(id).padStart(3, '0')}.fit`,
    capturedAt: new Date(Date.UTC(2026, 0, 10, 21, id)),
    filter: null,
    measurement: m(),
    measureError: null,
    override: null,
    ...over
  }
}

describe('grading frames', () => {
  it('[GRD-003] Given a trailed frame, When graded, Then it is rejected and the eccentricity limit is named', () => {
    const report = gradeFrames([light(), light({ measurement: m({ eccentricity: 0.72 }) }), light()], DEFAULT_GRADE_LIMITS)
    expect(report.grades.map(g => g.verdict)).toEqual(['keep', 'reject', 'keep'])
    expect(report.grades[1].reasons).toEqual(['Eccentricity 0.72 is above the limit of 0.6 (stars are trailed).'])
  })

  it('[GRD-003] Given a frame failing several limits, When graded, Then every failed limit is named', () => {
    const report = gradeFrames([light(), light(), light({ measurement: m({ fwhm: 6, starCount: 100, background: 2000 }) })], DEFAULT_GRADE_LIMITS)
    expect(report.grades[2].reasons).toEqual([
      "FWHM 6 px is more than 1.5× the night's median of 3 px.",
      "100 stars is under 50% of the night's median of 400 (cloud or haze).",
      "Background is more than 1.5× the night's median (moon, dawn or cloud)."
    ])
  })

  it('[GRD-003] Given a fixed FWHM limit, When a sharp night is all above it, Then each frame names the fixed limit', () => {
    const report = gradeFrames([light({ measurement: m({ fwhm: 5 }) })], { ...DEFAULT_GRADE_LIMITS, maxFwhmPixels: 4 })
    expect(report.grades[0]).toMatchObject({ verdict: 'reject', reasons: ['FWHM 5 px is above the fixed limit of 4 px.'] })
  })

  it('[GRD-004] Given a soft night and a sharp night, When graded, Then each frame is judged against its own night', () => {
    const soft = Date.UTC(2026, 0, 12, 22)
    const lights = [
      light({ measurement: m({ fwhm: 2 }) }),
      light({ measurement: m({ fwhm: 2.1 }) }),
      ...[0, 1, 2].map(i => light({ capturedAt: new Date(soft + i * 60_000), measurement: m({ fwhm: 4 }) }))
    ]
    const report = gradeFrames(lights, DEFAULT_GRADE_LIMITS)
    expect(report.rejected).toBe(0)
    expect(report.nights.map(n => [n.night, n.medianFwhm])).toEqual([['2026-01-10', 2.05], ['2026-01-12', 4]])
  })

  it('[GRD-004] Given two filters on one night, When graded, Then each filter is judged against its own frames', () => {
    const lights = [
      light({ filter: 'Ha', measurement: m({ starCount: 100, background: 200 }) }),
      light({ filter: 'Ha', measurement: m({ starCount: 110, background: 210 }) }),
      light({ filter: 'L', measurement: m({ starCount: 900 }) }),
      light({ filter: 'L', measurement: m({ starCount: 950 }) })
    ]
    expect(gradeFrames(lights, DEFAULT_GRADE_LIMITS).rejected).toBe(0)
  })

  it('[GRD-005] Given the user keeps a frame the limits reject, When graded, Then it is kept and still shows what it failed', () => {
    const report = gradeFrames([light(), light({ override: 'keep', measurement: m({ eccentricity: 0.9 }) })], DEFAULT_GRADE_LIMITS)
    expect(report.grades[1]).toMatchObject({ verdict: 'keep', override: 'keep' })
    expect(report.grades[1].reasons[0]).toBe('Kept by hand.')
    expect(report.grades[1].reasons[1]).toMatch(/Eccentricity/)
  })

  it('[GRD-005] Given the user rejects a frame that never measured, When graded, Then it is rejected by hand', () => {
    const report = gradeFrames([light({ override: 'reject', measurement: null })], DEFAULT_GRADE_LIMITS)
    expect(report.grades[0]).toMatchObject({ verdict: 'reject', reasons: ['Rejected by hand.'] })
  })

  it('[GRD-006] Given kept frames of different SNR, When graded, Then the best weighs 1 and others SNR² relative to it, and rejected frames weigh nothing', () => {
    const report = gradeFrames(
      [light({ measurement: m({ snr: 40 }) }), light({ measurement: m({ snr: 20 }) }), light({ measurement: m({ snr: 80, eccentricity: 0.9 }) })],
      DEFAULT_GRADE_LIMITS
    )
    expect(report.grades.map(g => g.weight)).toEqual([1, 0.25, null])
  })

  it('[GRD-011] Given a frame that could not be measured, When graded, Then it is unmeasured with the reason and stays in the stack', () => {
    const report = gradeFrames([light({ measurement: null, measureError: 'The pixel data is truncated.' }), light({ measurement: null })], DEFAULT_GRADE_LIMITS)
    expect(report.grades.map(g => [g.verdict, g.reasons[0]])).toEqual([
      ['unmeasured', 'Not measured: The pixel data is truncated.'],
      ['unmeasured', 'Not measured yet.']
    ])
    expect(report.unmeasured).toBe(2)
    expect(rejectedPaths(report).size).toBe(0)
  })

  it('[GRD-007] Given a graded set, When the paths to leave out are asked for, Then only rejected frames are named', () => {
    const lights = [light(), light({ measurement: m({ eccentricity: 0.8 }) }), light({ override: 'reject' })]
    expect([...rejectedPaths(gradeFrames(lights, DEFAULT_GRADE_LIMITS))]).toEqual([lights[1].path, lights[2].path])
  })

  it('[GRD-009] Given a night’s frames out of order, When its trend is read, Then they come back in capture order', () => {
    const a = light({ capturedAt: new Date(Date.UTC(2026, 0, 10, 23)) })
    const b = light({ capturedAt: new Date(Date.UTC(2026, 0, 10, 21)) })
    const report = gradeFrames([a, b], DEFAULT_GRADE_LIMITS)
    expect(nightTrend(report, '2026-01-10', null).map(g => g.fileId)).toEqual([b.fileId, a.fileId])
  })

  it('[GRD-009] Given frames with no capture time, When graded, Then they share an unknown night instead of breaking the summary', () => {
    const report = gradeFrames([light({ capturedAt: null }), light({ capturedAt: null })], DEFAULT_GRADE_LIMITS)
    expect(report.nights).toEqual([expect.objectContaining({ night: 'Unknown date', frames: 2, kept: 2 })])
  })
})

describe('grading limits', () => {
  it('[GRD-010] Given nothing saved, When limits are read, Then the defaults apply and there is no fixed FWHM', () => {
    expect(parseGradeLimits(() => null)).toEqual(DEFAULT_GRADE_LIMITS)
    expect(DEFAULT_GRADE_LIMITS.maxFwhmPixels).toBeNull()
  })

  it('[GRD-010] Given saved values, some nonsense, When read, Then good values apply and the rest fall back', () => {
    const saved: Record<string, string> = {
      [GRADE_LIMIT_KEYS.maxEccentricity]: '0.5',
      [GRADE_LIMIT_KEYS.maxFwhmRatio]: 'wide',
      [GRADE_LIMIT_KEYS.minStarRatio]: '2',
      [GRADE_LIMIT_KEYS.maxBackgroundRatio]: '3',
      [GRADE_LIMIT_KEYS.maxFwhmPixels]: ''
    }
    expect(parseGradeLimits(k => saved[k] ?? null)).toEqual({ ...DEFAULT_GRADE_LIMITS, maxEccentricity: 0.5, maxBackgroundRatio: 3 })
  })

  it('[GRD-010] Given stricter limits, When the same measurements are graded again, Then more frames are rejected without measuring', () => {
    const lights = [light({ measurement: m({ eccentricity: 0.45 }) }), light()]
    expect(gradeFrames(lights, DEFAULT_GRADE_LIMITS).rejected).toBe(0)
    expect(gradeFrames(lights, { ...DEFAULT_GRADE_LIMITS, maxEccentricity: 0.4 }).rejected).toBe(1)
  })
})

describe('exporting grades', () => {
  it('[GRD-008] Given graded frames, When exported, Then there is a header and one row per light with every measurement, verdict and reasons', () => {
    const report = gradeFrames([light({ filter: 'L' }), light({ filter: 'L', measurement: m({ eccentricity: 0.8 }) }), light({ filter: 'L', measurement: null })], DEFAULT_GRADE_LIMITS)
    const lines = gradesCsv(report).trimEnd().split('\r\n')
    expect(lines[0]).toBe(GRADE_CSV_COLUMNS.join(','))
    expect(lines).toHaveLength(4)
    expect(lines[2]).toContain(',reject,,3,0.8,400,1000,20,50,,Eccentricity 0.8 is above the limit of 0.6 (stars are trailed).')
    expect(lines[3]).toMatch(/,unmeasured,,,,,,,,,Not measured yet\.$/)
  })

  it('[GRD-008] Given a path with a comma, a quote and a leading formula sign, When exported, Then the cell is quoted and cannot run as a formula', () => {
    const report = gradeFrames([light({ path: '=HYPERLINK("x"),1.fit' })], DEFAULT_GRADE_LIMITS)
    expect(gradesCsv(report).split('\r\n')[1].startsWith(`"'=HYPERLINK(""x""),1.fit"`)).toBe(true)
  })
})

describe('grading limits at their edges', () => {
  const read = (saved: Record<string, string>) => parseGradeLimits(k => saved[k] ?? null)

  it('[GRD-010] Given each limit saved at the ends of its range, When read, Then both ends are accepted', () => {
    const low = read({
      [GRADE_LIMIT_KEYS.maxEccentricity]: '0.05',
      [GRADE_LIMIT_KEYS.maxFwhmRatio]: '1',
      [GRADE_LIMIT_KEYS.minStarRatio]: '0',
      [GRADE_LIMIT_KEYS.maxBackgroundRatio]: '1',
      [GRADE_LIMIT_KEYS.maxFwhmPixels]: '0.5'
    })
    expect(low).toEqual({ maxEccentricity: 0.05, maxFwhmRatio: 1, minStarRatio: 0, maxBackgroundRatio: 1, maxFwhmPixels: 0.5 })
    const high = read({
      [GRADE_LIMIT_KEYS.maxEccentricity]: '1',
      [GRADE_LIMIT_KEYS.maxFwhmRatio]: '10',
      [GRADE_LIMIT_KEYS.minStarRatio]: '1',
      [GRADE_LIMIT_KEYS.maxBackgroundRatio]: '100',
      [GRADE_LIMIT_KEYS.maxFwhmPixels]: '100'
    })
    expect(high).toEqual({ maxEccentricity: 1, maxFwhmRatio: 10, minStarRatio: 1, maxBackgroundRatio: 100, maxFwhmPixels: 100 })
  })

  it('[GRD-010] Given each limit saved just outside its range, blank or not a number, When read, Then it is rejected for the default', () => {
    expect(read({
      [GRADE_LIMIT_KEYS.maxEccentricity]: '0.04',
      [GRADE_LIMIT_KEYS.maxFwhmRatio]: '0.99',
      [GRADE_LIMIT_KEYS.minStarRatio]: '-0.01',
      [GRADE_LIMIT_KEYS.maxBackgroundRatio]: '0.99',
      [GRADE_LIMIT_KEYS.maxFwhmPixels]: '0.49'
    })).toEqual(DEFAULT_GRADE_LIMITS)
    expect(read({
      [GRADE_LIMIT_KEYS.maxEccentricity]: '1.01',
      [GRADE_LIMIT_KEYS.maxFwhmRatio]: '10.01',
      [GRADE_LIMIT_KEYS.minStarRatio]: '1.01',
      [GRADE_LIMIT_KEYS.maxBackgroundRatio]: '100.01',
      [GRADE_LIMIT_KEYS.maxFwhmPixels]: '100.01'
    })).toEqual(DEFAULT_GRADE_LIMITS)
    // A blank star ratio would read as 0 if it were taken as a number.
    expect(read({ [GRADE_LIMIT_KEYS.minStarRatio]: '   ', [GRADE_LIMIT_KEYS.maxFwhmPixels]: 'Infinity' })).toEqual(DEFAULT_GRADE_LIMITS)
    expect(read({ [GRADE_LIMIT_KEYS.maxFwhmPixels]: ' 4 ' }).maxFwhmPixels).toBe(4)
  })
})

describe('grading at the limits', () => {
  it('[GRD-003] Given measurements exactly at each limit, When graded, Then none is rejected; just past each, Then each is named', () => {
    const limits = { ...DEFAULT_GRADE_LIMITS, maxFwhmPixels: 4.5 }
    // Medians of the five: fwhm 3, stars 400, background 1000.
    const at = [light(), light(), light({ measurement: m({ eccentricity: 0.6, fwhm: 4.5, starCount: 200, background: 1500 }) }), light(), light()]
    expect(gradeFrames(at, limits).grades.map(g => g.verdict)).toEqual(['keep', 'keep', 'keep', 'keep', 'keep'])
    const past = [light(), light(), light({ measurement: m({ eccentricity: 0.6049, fwhm: 4.54, starCount: 199, background: 1500.5 }) }), light(), light()]
    expect(gradeFrames(past, limits).grades[2].reasons).toEqual([
      'Eccentricity 0.6 is above the limit of 0.6 (stars are trailed).',
      'FWHM 4.5 px is above the fixed limit of 4.5 px.',
      "FWHM 4.5 px is more than 1.5× the night's median of 3 px.",
      "199 stars is under 50% of the night's median of 400 (cloud or haze).",
      "Background is more than 1.5× the night's median (moon, dawn or cloud)."
    ])
  })

  it('[GRD-003] Given measurements to many places, When a limit is named, Then the numbers are rounded for reading', () => {
    const lights = [light({ measurement: m({ fwhm: 2.04 }) }), light({ measurement: m({ fwhm: 2.06, starCount: 401 }) }), light({ measurement: m({ eccentricity: 0.7251, fwhm: 9.96, starCount: 10 }) }), light({ measurement: m({ fwhm: 2.1, starCount: 401 }) })]
    const report = gradeFrames(lights, { ...DEFAULT_GRADE_LIMITS, minStarRatio: 0.333, maxFwhmPixels: 9.9 })
    expect(report.grades[2].reasons).toEqual([
      'Eccentricity 0.73 is above the limit of 0.6 (stars are trailed).',
      'FWHM 10 px is above the fixed limit of 9.9 px.',
      "FWHM 10 px is more than 1.5× the night's median of 2.1 px.",
      "10 stars is under 33% of the night's median of 401 (cloud or haze)."
    ])
  })

  it('[GRD-003] Given a frame with no FWHM or eccentricity, When graded, Then those limits are skipped and only the counts judge it', () => {
    const lights = [light(), light({ measurement: m({ fwhm: null, eccentricity: null }) })]
    const report = gradeFrames(lights, { ...DEFAULT_GRADE_LIMITS, maxFwhmPixels: 1 })
    expect(report.grades.map(g => g.verdict)).toEqual(['reject', 'keep'])
    expect(report.nights[0].medianFwhm).toBe(3)
  })

  it('[GRD-004] Given a night whose median background or star count is zero or below, When graded, Then those ratios are not judged', () => {
    const lights = [
      light({ measurement: m({ background: -100, starCount: 0 }) }),
      light({ measurement: m({ background: -100, starCount: 0 }) }),
      light({ measurement: m({ background: -40, starCount: 0 }) })
    ]
    expect(gradeFrames(lights, DEFAULT_GRADE_LIMITS).rejected).toBe(0)
  })

  it('[GRD-005] Given hand choices, When graded, Then who made each is kept: by frame unless said, by night when its night was left out, and none without one', () => {
    const report = gradeFrames([light({ override: 'keep' }), light({ override: 'reject', overrideBy: 'night' }), light(), light({ override: 'reject', overrideBy: null })], DEFAULT_GRADE_LIMITS)
    expect(report.grades.map(g => [g.verdict, g.overrideBy, g.reasons[0]])).toEqual([
      ['keep', 'frame', 'Kept by hand.'],
      ['reject', 'night', 'Left out with its night.'],
      ['keep', null, undefined],
      ['reject', 'frame', 'Rejected by hand.']
    ])
    expect(report).toMatchObject({ kept: 2, rejected: 2, unmeasured: 0 })
  })

  it('[GRD-006] Given kept frames with SNR, one with none and one rejected, When weighted, Then weights are rounded to three places and only kept frames with SNR are weighted', () => {
    const report = gradeFrames(
      [light({ measurement: m({ snr: 40 }) }), light({ measurement: m({ snr: 30 }) }), light({ measurement: m({ snr: null }) }), light({ measurement: m({ snr: 0 }) }), light({ measurement: null }), light({ override: 'reject', measurement: m({ snr: 90 }) })],
      DEFAULT_GRADE_LIMITS
    )
    expect(report.grades.map(g => g.weight)).toEqual([1, 0.563, null, 0, null, null])
  })

  it('[GRD-006] Given kept frames that all have zero SNR, When weighted, Then none is weighted', () => {
    const report = gradeFrames([light({ measurement: m({ snr: 0 }) }), light({ measurement: m({ snr: 0 }) })], DEFAULT_GRADE_LIMITS)
    expect(report.grades.map(g => g.weight)).toEqual([null, null])
  })

  it('[GRD-009] Given frames over nights and filters, When summarised, Then each night and filter has its own row in date then filter order, with unmeasured frames counted as kept', () => {
    const later = new Date(Date.UTC(2026, 0, 12, 22))
    const lights = [
      light({ capturedAt: later, filter: 'Ha' }),
      light({ filter: 'OIII', measurement: m({ eccentricity: 0.9 }) }),
      light({ filter: 'Ha', measurement: null }),
      light({ filter: 'Ha', measurement: m({ fwhm: 4, starCount: 300, background: 900 }) }),
      light({ filter: null })
    ]
    const report = gradeFrames(lights, DEFAULT_GRADE_LIMITS)
    expect(report.nights).toEqual([
      { night: '2026-01-10', filter: null, frames: 1, kept: 1, rejected: 0, medianFwhm: 3, medianStars: 400, medianBackground: 1000 },
      { night: '2026-01-10', filter: 'Ha', frames: 2, kept: 2, rejected: 0, medianFwhm: 4, medianStars: 300, medianBackground: 900 },
      { night: '2026-01-10', filter: 'OIII', frames: 1, kept: 0, rejected: 1, medianFwhm: 3, medianStars: 400, medianBackground: 1000 },
      { night: '2026-01-12', filter: 'Ha', frames: 1, kept: 1, rejected: 0, medianFwhm: 3, medianStars: 400, medianBackground: 1000 }
    ])
    expect(report).toMatchObject({ kept: 3, rejected: 1, unmeasured: 1 })
    expect(report.grades[0]).toMatchObject({ night: '2026-01-12', filter: 'Ha', capturedAt: later, path: lights[0].path })
  })

  it('[GRD-009] Given a night with two filters and an undated frame, When its trend is read, Then only that night and filter come back, undated first', () => {
    const a = light({ filter: 'Ha', capturedAt: new Date(Date.UTC(2026, 0, 10, 22)) })
    const b = light({ filter: 'OIII', capturedAt: new Date(Date.UTC(2026, 0, 10, 21)) })
    const c = light({ filter: 'Ha', capturedAt: new Date(Date.UTC(2026, 0, 10, 21)) })
    const report = gradeFrames([a, b, c, light({ filter: 'Ha', capturedAt: null })], DEFAULT_GRADE_LIMITS)
    expect(nightTrend(report, '2026-01-10', 'Ha').map(g => g.fileId)).toEqual([c.fileId, a.fileId])
    expect(nightTrend(report, '2026-01-10', null)).toEqual([])
  })
})

describe('exporting grades exactly', () => {
  it('[GRD-008] Given a measured and an unmeasured frame, When exported, Then each cell is written to its precision and the file ends with a line break', () => {
    const at = new Date(Date.UTC(2026, 0, 10, 21, 30))
    const report = gradeFrames(
      [
        light({ path: '/d/a.fit', capturedAt: at, filter: 'L', measurement: m({ fwhm: 2.34567, eccentricity: 0.123456, starCount: 321, background: -5.12345, noise: 3.33333, snr: 12.3456 }) }),
        light({ path: '/d/b.fit', capturedAt: null, filter: null, measurement: null, override: 'keep' })
      ],
      DEFAULT_GRADE_LIMITS
    )
    expect(gradesCsv(report)).toBe(
      [
        GRADE_CSV_COLUMNS.join(','),
        '/d/a.fit,2026-01-10,L,2026-01-10T21:30:00.000Z,keep,,2.346,0.123,321,-5.123,3.333,12.35,1,',
        '/d/b.fit,,,,keep,keep,,,,,,,,Kept by hand.',
        ''
      ].join('\r\n')
    )
  })

  it('[GRD-008] Given a measured frame with no shape, When exported, Then FWHM, eccentricity and SNR are blank and the rest are written', () => {
    const report = gradeFrames([light({ path: '/d/c.fit', measurement: m({ fwhm: null, eccentricity: null, snr: null }) })], DEFAULT_GRADE_LIMITS)
    expect(gradesCsv(report).split('\r\n')[1]).toBe('/d/c.fit,2026-01-10,,' + report.grades[0].capturedAt?.toISOString() + ',keep,,,,400,1000,20,,,')
  })

  it('[GRD-008] Given cells with line breaks, quotes or a leading sign, When exported, Then they are quoted or made safe', () => {
    const report = gradeFrames(
      [light({ path: 'a\nb.fit', filter: '+R', measurement: null, measureError: 'Bad "header"\r' }), light({ path: '@x.fit', filter: '-B', measurement: null })],
      DEFAULT_GRADE_LIMITS
    )
    const csv = gradesCsv(report)
    expect(csv).toContain(`"a\nb.fit",`)
    expect(csv).toContain(`,'+R,`)
    expect(csv).toContain(`"Not measured: Bad ""header""\r"`)
    expect(csv).toContain(`'@x.fit,`)
    expect(csv).toContain(`,'-B,`)
  })
})

/** A plane drawn from a function of x and y. */
const planeOf = (width: number, height: number, f: (x: number, y: number) => number): Plane => {
  const data = new Float32Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = f(x, y)
  return { width, height, data }
}

describe('measuring pixels exactly', () => {
  // A lopsided star on a sky of 10: brighter to the right and below, with a faint pixel at the box's corner and one just outside it.
  const STAR: Record<string, number> = { '4,4': 100, '5,4': 50, '3,4': 20, '4,5': 30, '4,3': 10, '5,5': 5, '1,1': 2, '7,4': 4 }
  const star = planeOf(9, 9, (x, y) => 10 + (STAR[`${x},${y}`] ?? 0))

  it('[GRD-001] Given a lopsided star, When its shape is measured, Then the centroid, flux, FWHM and eccentricity come from the second moments inside the box', () => {
    const s = measureStar(star, 4, 4, 10, 3)
    expect(s?.x).toBeCloseTo(4.1855203619909505, 10)
    expect(s?.y).toBeCloseTo(4.085972850678733, 10)
    expect(s?.flux).toBe(221)
    expect(s?.fwhm).toBeCloseTo(1.5142144248573095, 10)
    expect(s?.eccentricity).toBeCloseTo(0.7501581320661836, 10)
  })

  it('[GRD-001] Given a smaller box, When the star is measured, Then pixels outside it are not counted', () => {
    const s = measureStar(star, 4, 4, 10, 2)
    expect(s?.flux).toBe(215)
    expect(s?.x).toBeCloseTo(4.162790697674419, 10)
    expect(s?.y).toBeCloseTo(4.116279069767442, 10)
    expect(s?.fwhm).toBeCloseTo(1.198552397969788, 10)
    expect(s?.eccentricity).toBeCloseTo(0.6271793040883397, 10)
  })

  it('[GRD-001] Given peaks a box away from each edge, When measured, Then the box may touch the edge but not cross it, so those across are skipped', () => {
    expect(measureStar(star, 3, 3, 10, 3)?.flux).toBe(217)
    expect(measureStar(star, 5, 5, 10, 3)?.flux).toBe(219)
    expect(measureStar(star, 6, 4, 10, 3)).toBeNull()
    expect(measureStar(star, 4, 6, 10, 3)).toBeNull()
    expect(measureStar(star, 2, 4, 10, 3)).toBeNull()
    expect(measureStar(star, 4, 2, 10, 3)).toBeNull()
  })

  it('[GRD-001] Given a single hot pixel, or nothing above the background, When measured, Then no shape is reported', () => {
    const hot = planeOf(9, 9, (x, y) => (x === 4 && y === 4 ? 50 : 10))
    expect(measureStar(hot, 4, 4, 10, 3)).toBeNull()
    expect(measureStar(hot, 4, 4, 60, 3)).toBeNull()
  })

  it('[GRD-001] Given a skewed sky, When the sky is measured, Then it is clipped at 3σ three times', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 18, 25, 33, 45, 60, 80, 110]
    const { background, noise } = skyStatistics({ width: values.length, height: 1, data: Float32Array.from(values) })
    expect(background).toBe(7)
    expect(noise).toBeCloseTo(4.4478, 10)
  })

  it('[GRD-001] Given pixels that are not numbers, When the sky is measured, Then they are left out; an empty plane reads as zero', () => {
    expect(skyStatistics({ width: 5, height: 1, data: Float32Array.from([1, 2, 3, NaN, NaN]) })).toEqual({ background: 2, noise: 1.4826 })
    expect(skyStatistics({ width: 0, height: 0, data: new Float32Array(0) })).toEqual({ background: 0, noise: 0 })
  })

  it('[GRD-001] Given a plane larger than the sample, When the sky is measured, Then evenly spaced pixels are sampled', () => {
    // 100,000 pixels sampled at every second one: only even columns, which are all faint.
    const big = planeOf(400, 250, x => (x % 2 ? 1000 + x : x % 7))
    expect(skyStatistics(big)).toEqual({ background: 3, noise: 2.9652 })
  })

  it('[GRD-001] Given isolated spikes, When peaks are found, Then only strict local maxima above the threshold count, away from the edge, brightest first, one per radius', () => {
    const spikes: Record<string, number> = { '5,5': 10, '8,5': 9, '5,9': 8, '1,1': 7, '0,10': 50, '10,0': 50, '15,15': 3, '15,5': 6, '16,5': 6, '18,18': 4.5, '19,12': 50, '12,19': 50 }
    const plane = planeOf(20, 20, (x, y) => spikes[`${x},${y}`] ?? 0)
    expect(findPeaks(plane, 3, 3)).toEqual([
      { x: 5, y: 5, value: 10 },
      { x: 5, y: 9, value: 8 },
      { x: 1, y: 1, value: 7 },
      { x: 18, y: 18, value: 4.5 }
    ])
    // A radius of zero still keeps peaks apart by one pixel, so (8, 5) three pixels away stands alone.
    expect(findPeaks(plane, 3, 0).map(p => p.value)).toEqual([10, 9, 8, 7, 4.5])
  })

  it('[GRD-001] Given fainter peaks just inside and just outside the radius in every direction, When found, Then each is dropped only when within the radius', () => {
    const spikes: Record<string, number> = {
      '20,20': 100,
      '20,16': 90, // 4 up: within
      '25,20': 80, // 5 right: kept
      '13,20': 70, // 7 left: kept
      '20,24': 60, // 4 down: within
      '17,17': 40, // 3 left and 3 up: just outside
      '22,18': 30, // 2 right and 2 up: within
      '16,20': 20 // 4 left: within
    }
    const plane = planeOf(40, 40, (x, y) => spikes[`${x},${y}`] ?? 0)
    expect(findPeaks(plane, 1, 4).map(p => p.value)).toEqual([100, 80, 70, 40])
  })
})

describe('measuring a frame’s stars', () => {
  it('[GRD-001] Given more stars than the search measures, When measured, Then only that many brightest are measured, and under five gives no shape', () => {
    const plane = field(1.5, 1.5)
    expect(measureFrame(plane, { binned: false, search: { maxStars: 4 } })).toMatchObject({ fwhm: null, eccentricity: null, snr: null, starCount: 36 })
    expect(measureFrame(plane, { binned: false, search: { maxStars: 5 } }).fwhm).not.toBeNull()
  })

  it('[GRD-011] Given exactly five stars, When measured, Then the shape is reported; with four it is not', () => {
    expect(measureFrame(field(1.5, 1.5, { count: 5 }), { binned: false }).fwhm).toBeCloseTo(1.5 * FWHM_PER_SIGMA, 0)
    expect(measureFrame(field(1.5, 1.5, { count: 4 }), { binned: false }).fwhm).toBeNull()
  })

  it('[GRD-001] Given a saturation level equal to the brightest peak, When measured, Then that peak is not measured either', () => {
    const plane = field(1.5, 1.5, { count: 5 })
    const brightest = Math.max(...findPeaks(plane, 1100, 6).map(p => p.value))
    expect(measureFrame(plane, { binned: false, search: { saturation: brightest } })).toMatchObject({ starCount: 5, fwhm: null })
    expect(measureFrame(plane, { binned: false, search: { saturation: brightest + 1 } }).fwhm).not.toBeNull()
  })

  it('[GRD-001] Given blobs wider than the measuring box, When measured, Then they are counted but not taken for stars', () => {
    // Twelve bright knots, each ringed by nebulosity at the edge of the box: a shape about 11 px wide.
    const plane = planeOf(200, 80, (x, y) => 1000 + ((x * 7 + y * 13) % 5) - 2)
    for (let i = 0; i < 12; i++) {
      const cx = 20 + 30 * (i % 6)
      const cy = i < 6 ? 20 : 55
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (Math.abs(dx) === 6 || Math.abs(dy) === 6) plane.data[(cy + dy) * 200 + cx + dx] = 1500
      plane.data[cy * 200 + cx] = 3000
    }
    expect(measureStar(plane, 20, 20, 1000, 6)?.fwhm).toBeGreaterThan(9)
    expect(measureFrame(plane, { binned: false })).toMatchObject({ starCount: 12, fwhm: null, eccentricity: null, snr: null })
  })

  it('[GRD-001] Given a frame, When measured, Then FWHM, eccentricity and SNR are the medians of the stars measured in the default box', () => {
    const plane = field(1.5, 1.5)
    const m = measureFrame(plane, { binned: false })
    const peaks = findPeaks(plane, m.background + 5 * m.noise, 6)
    const shapes = peaks.map(p => measureStar(plane, p.x, p.y, m.background, 6)).filter(s => s !== null)
    const mid = (v: number[]) => {
      const s = [...v].sort((a, b) => a - b)
      return (s[17] + s[18]) / 2
    }
    expect(shapes).toHaveLength(36)
    expect(m.fwhm).toBeCloseTo(mid(shapes.map(s => s.fwhm)), 10)
    expect(m.eccentricity).toBeCloseTo(mid(shapes.map(s => s.eccentricity)), 10)
    expect(m.snr).toBeCloseTo(mid(shapes.map(s => s.flux)) / (m.noise * 13), 10)
  })

  it('[GRD-001] Given a detection threshold above the stars, When measured, Then none are found', () => {
    const plane = field(1.5, 1.5)
    expect(measureFrame(plane, { binned: false, search: { sigma: 250 } })).toMatchObject({ starCount: 0, fwhm: null })
    expect(measureFrame(plane, { binned: false, search: { sigma: 100 } }).starCount).toBe(36)
  })
})
