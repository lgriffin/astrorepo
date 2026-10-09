import type Database from 'better-sqlite3'
import type { CometStore } from '@astro/application'
import type { CometOrbit } from '@astro/domain'

interface OrbitRow {
  name: string
  perihelion_at: string
  q: number
  e: number
  inclination_deg: number
  node_deg: number
  peri_deg: number
  epoch: string | null
}

/** Comet orbits in the index, one per target; removing the target removes its orbit (RIG-011). */
export class SqliteCometStore implements CometStore {
  constructor(private readonly db: Database.Database) {}

  async get(targetId: string): Promise<CometOrbit | null> {
    const r = this.db.prepare('SELECT * FROM comet_orbits WHERE target_id = ?').get(targetId) as OrbitRow | undefined
    if (!r) return null
    return {
      name: r.name,
      perihelionAt: new Date(r.perihelion_at),
      q: r.q,
      e: r.e,
      inclinationDeg: r.inclination_deg,
      nodeDeg: r.node_deg,
      periDeg: r.peri_deg,
      epoch: r.epoch
    }
  }

  async set(targetId: string, orbit: CometOrbit | null): Promise<void> {
    if (!orbit) {
      this.db.prepare('DELETE FROM comet_orbits WHERE target_id = ?').run(targetId)
      return
    }
    this.db
      .prepare(
        `INSERT INTO comet_orbits (target_id, name, perihelion_at, q, e, inclination_deg, node_deg, peri_deg, epoch, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_id) DO UPDATE SET name = excluded.name, perihelion_at = excluded.perihelion_at, q = excluded.q,
           e = excluded.e, inclination_deg = excluded.inclination_deg, node_deg = excluded.node_deg, peri_deg = excluded.peri_deg,
           epoch = excluded.epoch, updated_at = excluded.updated_at`
      )
      .run(targetId, orbit.name, orbit.perihelionAt.toISOString(), orbit.q, orbit.e, orbit.inclinationDeg, orbit.nodeDeg, orbit.periDeg, orbit.epoch, new Date().toISOString())
  }
}
