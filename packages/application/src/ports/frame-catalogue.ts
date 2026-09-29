import type { CalibrationFrame, LightSetting, QuarantinedFile, TargetFrames, UnassignedLight } from '@astro/domain'

/**
 * Driven port: read access to indexed frames.
 * Adapters: SQLite (desktop today), in-memory (testkit), Postgres (NAS, later).
 */
export interface FrameCatalogue {
  /** Every target with at least one light sub, stack, processed or final file, or an integration goal. */
  listTargetFrames(): Promise<TargetFrames[]>
  /** Light subs that no target claims yet. */
  listUnassignedLights(): Promise<UnassignedLight[]>
  /** Every dark, flat and bias frame. */
  listCalibrationFrames(): Promise<CalibrationFrame[]>
  /** Distinct acquisition settings across all light subs, with how many lights used each. */
  listLightSettings(): Promise<LightSetting[]>
  /** Files the scanner found but could not read, with the reason. */
  listQuarantinedFiles(): Promise<QuarantinedFile[]>
}
