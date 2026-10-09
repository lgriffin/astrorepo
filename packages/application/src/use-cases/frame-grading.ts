import { gradeFrames, gradesCsv, rejectedPaths, type GradeLimits, type GradeOverride, type GradeReport } from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { FrameGradeStore, FrameMeasurer, GradeLimitsSource } from '../ports/frame-grading'

export interface FrameGradingDeps {
  store: FrameGradeStore
  measurer: FrameMeasurer
  limits: GradeLimitsSource
  clock: Clock
}

export interface MeasureBatchResult {
  measured: number
  failed: number
  /** Lights still to try after this batch; the caller asks again while this is above zero. */
  remaining: number
  /** The last light this batch tried, so a retry can carry on after it. */
  last: string | null
}

/** Frames measured per call, so the app stays responsive and the user can stop between batches. */
export const MEASURE_BATCH = 8

export interface TargetGrades extends GradeReport {
  limits: GradeLimits
}

/** Measures, grades, overrides and exports a target's lights, and says which to leave out of a stack. */
export function makeFrameGrading(deps: FrameGradingDeps) {
  const grade = async (targetId: string): Promise<TargetGrades> => {
    const [lights, limits] = await Promise.all([deps.store.lightsOf(targetId), deps.limits.read()])
    return { ...gradeFrames(lights, limits), limits }
  }

  /** Grades for the lights among these paths, judged with the rest of their target's lights as the grading page judges them. */
  const reportFor = async (paths: string[]): Promise<GradeReport> => {
    const [lights, limits] = await Promise.all([deps.store.lightsAlongside(paths), deps.limits.read()])
    const report = gradeFrames(lights, limits)
    const asked = new Set(paths)
    const grades = report.grades.filter(g => asked.has(g.path))
    const count = (v: string) => grades.filter(g => g.verdict === v).length
    return { ...report, grades, kept: count('keep'), rejected: count('reject'), unmeasured: count('unmeasured') }
  }

  return {
    /**
     * Measures the next few lights that have never been measured. With `retry` it also tries
     * again those that failed before, in capture order after `retryAfter` (the `last` of the
     * previous batch), so a retry reaches every failed light once even when many still fail.
     * Each frame's result is saved as soon as it is known.
     */
    async measureBatch(
      targetId: string,
      options: { retry?: boolean; retryAfter?: string | null; batch?: number } = {}
    ): Promise<MeasureBatchResult> {
      const lights = await deps.store.lightsOf(targetId)
      const from = options.retryAfter ? lights.findIndex(l => l.fileId === options.retryAfter) + 1 : 0
      const pending = lights.filter((l, i) => !l.measurement && (!l.measureError || (options.retry && i >= from)))
      const batch = pending.slice(0, options.batch ?? MEASURE_BATCH)
      let measured = 0
      let failed = 0
      for (const light of batch) {
        try {
          const measurement = await deps.measurer.measure(light.path)
          await deps.store.saveMeasurement(light.fileId, { measurement }, deps.clock.now())
          measured++
        } catch (error) {
          await deps.store.saveMeasurement(light.fileId, { error: error instanceof Error ? error.message : String(error) }, deps.clock.now())
          failed++
        }
      }
      return { measured, failed, remaining: pending.length - batch.length, last: batch.length > 0 ? batch[batch.length - 1].fileId : null }
    },

    grade,

    limits: () => deps.limits.read(),

    async setOverride(fileId: string, override: GradeOverride | null): Promise<void> {
      await deps.store.setOverride(fileId, override, deps.clock.now())
    },

    async exportCsv(targetId: string): Promise<string> {
      return gradesCsv(await grade(targetId))
    },

    /** Grades for the lights among these paths (a stack's source folder). */
    reportFor,

    /** The lights among these paths that grading rejects, exactly as the grading page shows them. */
    async rejected(paths: string[]): Promise<Set<string>> {
      return rejectedPaths(await reportFor(paths))
    },

    /**
     * Keeps or rejects every light of one night by hand (ADV-008), or hands them all back to the
     * limits. Returns how many lights it changed.
     */
    async setNightOverride(targetId: string, night: string, override: GradeOverride | null): Promise<number> {
      const { grades } = gradeFrames(await deps.store.lightsOf(targetId), await deps.limits.read())
      const ofNight = grades.filter(g => (g.night ?? 'Unknown date') === night)
      for (const g of ofNight) await deps.store.setOverride(g.fileId, override, deps.clock.now())
      return ofNight.length
    }
  }
}

export type FrameGrading = ReturnType<typeof makeFrameGrading>

/** What a stack needs from grading: which lights to leave out, and how each night graded. */
export type FrameSelection = Pick<FrameGrading, 'rejected' | 'reportFor'>
