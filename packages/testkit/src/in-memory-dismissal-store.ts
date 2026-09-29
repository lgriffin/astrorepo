import type { Dismissal } from '@astro/domain'
import type { DismissalStore } from '@astro/application'

export class InMemoryDismissalStore implements DismissalStore {
  private readonly byId = new Map<string, Dismissal>()

  async listDismissals(): Promise<Dismissal[]> {
    return [...this.byId.values()].map(d => structuredClone(d))
  }

  async saveDismissal(dismissal: Dismissal): Promise<void> {
    this.byId.set(dismissal.suggestionId, structuredClone(dismissal))
  }
}
