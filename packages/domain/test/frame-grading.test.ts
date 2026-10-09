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
