import type { Dismissal } from '@astro/domain'

/** Driven port: remembers which suggestions the user set aside. */
export interface DismissalStore {
  listDismissals(): Promise<Dismissal[]>
  /** Replaces any earlier dismissal of the same suggestion. */
  saveDismissal(dismissal: Dismissal): Promise<void>
}
