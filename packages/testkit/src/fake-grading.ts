import type { FrameGradeStore, FrameMeasurer, GradeLimitsSource } from '@astro/application'
import { DEFAULT_GRADE_LIMITS, type FrameMeasurement, type GradableLight, type GradeLimits, type GradeOverride } from '@astro/domain'

/** Lights and their grades over plain maps. Each light belongs to one target. */
export class InMemoryFrameGradeStore implements FrameGradeStore {
  readonly lights = new Map<string, GradableLight & { targetId: string }>()
  readonly saved: { fileId: string; at: Date }[] = []

  add(targetId: string, light: Partial<GradableLight> & { fileId: string; path: string }): this {
    this.lights.set(light.fileId, { capturedAt: null, filter: null, measurement: null, measureError: null, override: null, ...light, targetId })
    return this
  }

  private copy = ({ targetId: _t, ...l }: GradableLight & { targetId: string }): GradableLight => structuredClone(l)

  async lightsOf(targetId: string): Promise<GradableLight[]> {
    return [...this.lights.values()]
      .filter(l => l.targetId === targetId)
      .sort((a, b) => (a.capturedAt?.getTime() ?? 0) - (b.capturedAt?.getTime() ?? 0) || a.path.localeCompare(b.path))
      .map(this.copy)
  }

  async lightsAlongside(paths: string[]): Promise<GradableLight[]> {
    const byPath = new Map([...this.lights.values()].map(l => [l.path, l]))
    const asked = paths.flatMap(p => byPath.get(p) ?? [])
    const targets = new Set(asked.map(l => l.targetId))
    const seen = new Set(asked.map(l => l.path))
    const peers = [...this.lights.values()].filter(l => targets.has(l.targetId) && !seen.has(l.path))
    return [...asked, ...peers].map(this.copy)
  }

  async saveMeasurement(fileId: string, result: { measurement: FrameMeasurement } | { error: string }, at: Date): Promise<void> {
    const l = this.require(fileId)
    l.measurement = 'measurement' in result ? structuredClone(result.measurement) : null
    l.measureError = 'error' in result ? result.error : null
    this.saved.push({ fileId, at })
  }

  async setOverride(fileId: string, override: GradeOverride | null): Promise<void> {
    this.require(fileId).override = override
  }

  private require(fileId: string) {
    const l = this.lights.get(fileId)
    if (!l) throw new Error('That frame is no longer in the index. Scan its folder again.')
    return l
  }
}

/** Measurements by path; a path with none set fails with the given reason. */
export class FakeFrameMeasurer implements FrameMeasurer {
  readonly results = new Map<string, FrameMeasurement | string>()
  readonly measured: string[] = []

  set(path: string, result: FrameMeasurement | string): this {
    this.results.set(path, result)
    return this
  }

  async measure(path: string): Promise<FrameMeasurement> {
    this.measured.push(path)
    const r = this.results.get(path) ?? 'The file could not be read.'
    if (typeof r === 'string') throw new Error(r)
    return structuredClone(r)
  }
}

export class FixedGradeLimits implements GradeLimitsSource {
  constructor(public limits: GradeLimits = DEFAULT_GRADE_LIMITS) {}
  async read(): Promise<GradeLimits> {
    return { ...this.limits }
  }
}

/** A clean measurement, varied by the overrides. */
export function measurement(over: Partial<FrameMeasurement> = {}): FrameMeasurement {
  return { fwhm: 3, eccentricity: 0.3, starCount: 400, background: 1000, noise: 20, snr: 50, ...over }
}
