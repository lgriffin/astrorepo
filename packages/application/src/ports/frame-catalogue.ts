import type { TargetFrames } from '@astro/domain'

/**
 * Driven port: read access to indexed frames, grouped by target.
 * Adapters: SQLite (desktop today), in-memory (testkit), Postgres (NAS, later).
 */
export interface FrameCatalogue {
  /** Every target that has at least one light sub or stacked image. */
  listTargetFrames(): Promise<TargetFrames[]>
}
