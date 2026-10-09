import { describe, expect, it } from 'vitest'
import { DEFAULT_GRADE_LIMITS, gradeFrames, type GradableLight } from '@astro/domain'
import { measurement, stackAdvice } from '@astro/testkit'
import { nightLabel, toGradesView } from '../../src/main/adapters/grades-presenter'
import { toSirilPlanView } from '../../src/main/adapters/siril-plan-presenter'

const light = (n: number, over: Partial<GradableLight> = {}): GradableLight => ({
  fileId: `f${n}`,
  path: `C:\\data\\M 42\\Light_00${n}.fit`,
  capturedAt: new Date(Date.UTC(2026, 0, 10, 22, 10 - n)),
  filter: 'L',
  measurement: measurement(),
  measureError: null,
  override: null,
  ...over
})

describe('grades presenter', () => {
  it('[GRD-009] Given a graded night, When presented, Then it is labelled by date and filter and its frames run in capture order', () => {
    const report = gradeFrames([light(1), light(2), light(3, { measurement: measurement({ eccentricity: 0.81 }) })], DEFAULT_GRADE_LIMITS)
    const view = toGradesView({ ...report, limits: DEFAULT_GRADE_LIMITS })
    expect(view.summary).toBe('2 lights kept, 1 rejected. Only kept lights go to Siril.')
    expect(view.nights[0]).toMatchObject({ label: '10 Jan 2026 · L', frames: 3, kept: 2, rejected: 1, medianFwhm: '3 px', medianStars: '400' })
    expect(view.nights[0].trend.map(f => f.fileName)).toEqual(['Light_003.fit', 'Light_002.fit', 'Light_001.fit'])
    expect(view.nights[0].trend[0]).toMatchObject({ verdict: 'reject', eccentricity: 0.81, weight: null })
  })

  it('[GRD-011] Given nothing measured yet, When presented, Then the summary says to measure', () => {
    const report = gradeFrames([light(1, { measurement: null })], DEFAULT_GRADE_LIMITS)
    expect(toGradesView({ ...report, limits: DEFAULT_GRADE_LIMITS }).summary).toBe('1 light not measured yet. Measure them to grade each one before stacking.')
    expect(toGradesView({ ...gradeFrames([], DEFAULT_GRADE_LIMITS), limits: DEFAULT_GRADE_LIMITS }).summary).toMatch(/No light frames/)
  })

  it('[GRD-011] Given some lights unmeasured, When presented, Then the summary says they are kept until measured', () => {
    const report = gradeFrames([light(1), light(2, { measurement: null })], DEFAULT_GRADE_LIMITS)
    expect(toGradesView({ ...report, limits: DEFAULT_GRADE_LIMITS }).summary).toBe('1 light kept, 0 rejected, 1 not measured (kept until they are). Only kept lights go to Siril.')
  })

  it('[GRD-009] Given a night that is not a date, When labelled, Then it shows as it is', () => {
    expect(nightLabel('2026-10-01')).toBe('1 Oct 2026')
    expect(nightLabel('Unknown date')).toBe('Unknown date')
  })

  it('[GRD-007] Given a stacking plan with rejected lights, When presented, Then it says how many grading left out', () => {
    const base = {
      counts: { lights: 10, darks: 0, flats: 0, biases: 0 }, rejectedLights: 2, sensor: 'colour' as const, sensorKnown: true,
      geometry: { width: 100, height: 100 }, geometryApproximate: false, geometryMixed: false, prepBytes: 0, freeBytes: 1e9, usedBytes: 0,
      recommended: { script: 'OSC_Preprocessing_WithoutDBF' as const, reason: 'x' }, scripts: [], advice: stackAdvice()
    }
    expect(toSirilPlanView(base).gradingNote).toBe('2 lights rejected by frame grading are left out of the stack and the space.')
    expect(toSirilPlanView({ ...base, rejectedLights: 1 }).gradingNote).toBe('1 light rejected by frame grading is left out of the stack and the space.')
    expect(toSirilPlanView({ ...base, rejectedLights: 0 }).gradingNote).toBeNull()
  })
})
