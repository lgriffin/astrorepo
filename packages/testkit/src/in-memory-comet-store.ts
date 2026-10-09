import type { CometStore } from '@astro/application'
import type { CometOrbit } from '@astro/domain'

export class InMemoryCometStore implements CometStore {
  private readonly orbits = new Map<string, CometOrbit>()

  async get(targetId: string): Promise<CometOrbit | null> {
    const o = this.orbits.get(targetId)
    return o ? { ...o, perihelionAt: new Date(o.perihelionAt) } : null
  }

  async set(targetId: string, orbit: CometOrbit | null): Promise<void> {
    if (orbit) this.orbits.set(targetId, { ...orbit, perihelionAt: new Date(orbit.perihelionAt) })
    else this.orbits.delete(targetId)
  }
}
