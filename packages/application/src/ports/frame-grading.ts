import type { FrameMeasurement, GradableLight, GradeLimits, GradeOverride } from '@astro/domain'

/**
 * Driven port: the lights a target holds, with what was measured and what the user chose.
 * Adapters: SQLite (desktop), in-memory (testkit).
 */
export interface FrameGradeStore {
  /** A target's lights, oldest capture first. */
  lightsOf(targetId: string): Promise<GradableLight[]>
  /**
   * The indexed lights among these paths, then every other light of the targets they belong to,
   * so each is graded against the same nights as on its target's page. Paths the index does not
   * know are left out.
   */
  lightsAlongside(paths: string[]): Promise<GradableLight[]>
  /** Saves a measurement, or why the frame could not be measured. */
  saveMeasurement(fileId: string, result: { measurement: FrameMeasurement } | { error: string }, at: Date): Promise<void>
  /** Sets or clears the user's keep or reject. */
  setOverride(fileId: string, override: GradeOverride | null, at: Date): Promise<void>
}

/** Driven port: measures one light from its pixels. Reads the file; never writes it. */
export interface FrameMeasurer {
  /** Throws with a reason the user can act on when the file cannot be measured. */
  measure(path: string): Promise<FrameMeasurement>
}

/** Driven port: the grading limits the user set. */
export interface GradeLimitsSource {
  read(): Promise<GradeLimits>
}
