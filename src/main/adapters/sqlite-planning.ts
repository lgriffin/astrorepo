import type Database from 'better-sqlite3'
import type { PlanningSettings, TargetPosition, TargetPositions } from '@astro/application'
import { isValidSite, type Site } from '@astro/domain'

/** Settings keys the Sky Planner and Settings pages already write. */
export const SITE_KEYS = { latitude: 'observer_latitude', longitude: 'observer_longitude', elevation: 'observer_elevation' } as const
export const NARROWBAND_KEY = 'has_narrowband_filter'

/** PlanningSettings over the app_settings table. */
export class SqlitePlanningSettings implements PlanningSettings {
  constructor(private readonly db: Database.Database) {}

  private read(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
    const value = row?.value.trim()
    return value ? value : null
  }

  async site(): Promise<Site | null> {
    const lat = this.read(SITE_KEYS.latitude)
    const lon = this.read(SITE_KEYS.longitude)
    if (lat === null || lon === null) return null
    const site = { latitudeDeg: Number(lat), longitudeDeg: Number(lon), elevationM: Number(this.read(SITE_KEYS.elevation) ?? 0) || 0 }
    return isValidSite(site) ? site : null
  }

  /** Defaults to yes: the Seestar S50's built-in light-pollution filter is dual-band. */
  async hasNarrowbandFilter(): Promise<boolean> {
    const value = this.read(NARROWBAND_KEY)
    return value === null ? true : !['false', '0', 'no'].includes(value.toLowerCase())
  }
}

/** TargetPositions over the targets table. */
export class SqliteTargetPositions implements TargetPositions {
  constructor(private readonly db: Database.Database) {}

  async listPositions(): Promise<TargetPosition[]> {
    const rows = this.db
      .prepare(
        `SELECT id, ra_hours, dec_degrees, object_type FROM targets
         WHERE ra_hours IS NOT NULL AND dec_degrees IS NOT NULL ORDER BY id`
      )
      .all() as { id: string; ra_hours: number; dec_degrees: number; object_type: string }[]
    return rows.map(r => ({ targetId: r.id, raHours: r.ra_hours, decDeg: r.dec_degrees, objectType: r.object_type }))
  }
}
