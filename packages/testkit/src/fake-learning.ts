import type { TargetFacts, TargetFactsSource } from '@astro/application'

/** Target names and sizes held in memory, keyed by target id. */
export class InMemoryTargetFacts implements TargetFactsSource {
  private readonly targets = new Map<string, TargetFacts>()

  /** Adds a target with its own name first, then its other names. */
  add(targetId: string, facts: TargetFacts): void {
    this.targets.set(targetId, { names: [...facts.names], angularSizeArcmin: facts.angularSizeArcmin })
  }

  async facts(targetId: string): Promise<TargetFacts | null> {
    const f = this.targets.get(targetId)
    return f ? { names: [...f.names], angularSizeArcmin: f.angularSizeArcmin } : null
  }
}
