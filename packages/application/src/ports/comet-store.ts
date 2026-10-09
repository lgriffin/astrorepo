import type { CometOrbit } from '@astro/domain'

/**
 * Driven port: the orbits of targets marked as comets (RIG-011).
 * Adapters: SQLite (desktop), in-memory (testkit).
 */
export interface CometStore {
  /** The target's comet orbit, or null when it is not marked as a comet. */
  get(targetId: string): Promise<CometOrbit | null>
  /** Marks the target as this comet, replacing any earlier orbit; null unmarks it. */
  set(targetId: string, orbit: CometOrbit | null): Promise<void>
}
