import type { TargetFrames } from '@astro/domain'
import type { FrameCatalogue } from '@astro/application'

export class InMemoryFrameCatalogue implements FrameCatalogue {
  private readonly targets = new Map<string, TargetFrames>()

  add(target: TargetFrames): this {
    this.targets.set(target.targetId, structuredClone(target))
    return this
  }

  async listTargetFrames(): Promise<TargetFrames[]> {
    return [...this.targets.values()]
      .filter(t => t.subs.length > 0 || t.stacks.length > 0)
      .map(t => structuredClone(t))
  }
}
