import type { CatalogueRepairPlan, InstalledTarget, LinkedItem, SeedCatalogue } from '@astro/domain'

/** Driven port: the built-in catalogues the app ships (data/catalogues), read only (specs/047-catalogue-names). */
export interface CatalogueSeeds {
  /** The catalogues in the order they are seeded, and the version they were built as. */
  read(): Promise<{ version: string; catalogues: SeedCatalogue[] }>
}

/** Driven port: the install's targets as the catalogues made them, and the one change that repairs them. */
export interface CatalogueStore {
  /** The catalogue version the install was last seeded or repaired from; null before the first. */
  version(): Promise<string | null>
  /** Every target with its aliases and built-in catalogue entries. */
  installed(): Promise<InstalledTarget[]>
  /** The frames and library folders linked to these targets, with the names they go by. */
  linked(targetIds: string[]): Promise<{ frames: LinkedItem[]; folders: LinkedItem[] }>
  /**
   * Applies the plan as one change: catalogues written, the catalogues' aliases and entries replaced,
   * targets created, updated and removed, frames and folders moved, the catalogues' own collections
   * refilled, and the version recorded. Aliases the user gave are kept; nothing else is deleted.
   */
  apply(plan: CatalogueRepairPlan, catalogues: Array<Omit<SeedCatalogue, 'objects'>>, version: string): Promise<void>
}
