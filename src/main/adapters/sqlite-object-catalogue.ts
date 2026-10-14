import type Database from 'better-sqlite3'
import type { ObjectCatalogue, ObjectFacts } from '@astro/application'
import { asDesignation, type NamedObject } from '@astro/domain'
import { IS_INTEGRATED_LIGHT, IS_LIGHT } from './shared/sql'

/** Catalogues in the order their designations are shown: the best-known first. */
const CATALOGUE_RANK = "CASE c.abbreviation WHEN 'M' THEN 0 WHEN 'NGC' THEN 1 WHEN 'IC' THEN 2 WHEN 'C' THEN 3 WHEN 'Sh2' THEN 4 ELSE 5 END"


/** The night a frame belongs to, noon to noon UTC, from DATE-OBS. */
const NIGHT = "date(datetime(f.date_obs, '-12 hours'))"

/**
 * ObjectCatalogue over the targets, their catalogue entries and aliases, and the index of frames
 * (spec 031). Reads only.
 */
export class SqliteObjectCatalogue implements ObjectCatalogue {
  constructor(private readonly db: Database.Database) {}

  async namedObjects(): Promise<NamedObject[]> {
    return this.named(null)
  }

  /** Every object's designations and names, or one object's when an id is given. */
  private named(only: string | null): NamedObject[] {
    const where = (column: string) => (only === null ? '' : ` WHERE ${column} = @only`)
    const args = only === null ? {} : { only }
    const targets = this.db.prepare(`SELECT id, canonical_name FROM targets${where('id')} ORDER BY canonical_name`).all(args) as { id: string; canonical_name: string }[]
    const entries = this.db
      .prepare(`SELECT ce.target_id, ce.designation FROM catalogue_entries ce JOIN catalogues c ON c.id = ce.catalogue_id${where('ce.target_id')} ORDER BY ${CATALOGUE_RANK}, ce.designation`)
      .all(args) as { target_id: string; designation: string }[]
    const aliases = this.db.prepare(`SELECT target_id, alias FROM target_aliases${where('target_id')} ORDER BY alias`).all(args) as { target_id: string; alias: string }[]
    const objects = new Map<string, NamedObject>(targets.map(t => [t.id, { id: t.id, designations: [], names: [] }]))
    const add = (id: string, text: string, isEntry: boolean) => {
      const o = objects.get(id)
      if (!o) return
      const designation = isEntry ? text : asDesignation(text)
      if (designation) {
        if (!o.designations.includes(designation)) o.designations.push(designation)
      } else if (!o.names.includes(text)) o.names.push(text)
    }
    for (const e of entries) add(e.target_id, e.designation, true)
    for (const t of targets) add(t.id, t.canonical_name, false)
    for (const a of aliases) add(a.target_id, a.alias, false)
    return [...objects.values()]
  }

  async objectFacts(objectId: string): Promise<ObjectFacts | null> {
    const t = this.db
      .prepare('SELECT id, canonical_name, object_type, constellation, magnitude, angular_size_arcmin, ra_hours, dec_degrees, description, workflow_stage FROM targets WHERE id = ?')
      .get(objectId) as
      | { id: string; canonical_name: string; object_type: string | null; constellation: string | null; magnitude: number | null; angular_size_arcmin: number | null; ra_hours: number | null; dec_degrees: number | null; description: string | null; workflow_stage: string }
      | undefined
    if (!t) return null
    const [named] = this.named(objectId)
    const collections = this.db
      .prepare('SELECT c.id, c.name FROM collection_memberships m JOIN collections c ON c.id = m.collection_id WHERE m.target_id = ? ORDER BY c.name')
      .all(objectId) as { id: string; name: string }[]
    const lights = this.db
      .prepare(
        `SELECT COUNT(*) AS frames, COALESCE(SUM(f.exposure_sec), 0) AS seconds,
                COUNT(DISTINCT ${NIGHT}) AS nights, MAX(${NIGHT}) AS last_night
         FROM fits_files f WHERE f.target_id = ? AND f.is_stacked = 0 AND ${IS_LIGHT}`
      )
      .get(objectId) as { frames: number; seconds: number; nights: number; last_night: string | null }
    const masters = this.db.prepare(`SELECT COUNT(*) AS n FROM fits_files f WHERE f.target_id = ? AND f.is_stacked = 1 AND ${IS_INTEGRATED_LIGHT}`).get(objectId) as { n: number }
    const mosaic = this.db.prepare('SELECT 1 FROM mosaic_plans WHERE target_id = ?').get(objectId)
    return {
      id: t.id,
      name: t.canonical_name,
      objectType: t.object_type?.trim() || null,
      constellation: t.constellation?.trim() || null,
      magnitude: t.magnitude,
      sizeArcmin: t.angular_size_arcmin,
      raHours: t.ra_hours,
      decDeg: t.dec_degrees,
      description: t.description?.trim() || null,
      designations: named.designations,
      aliases: named.names.filter(n => n !== t.canonical_name),
      collections,
      stage: t.workflow_stage,
      data: {
        lightFrames: lights.frames,
        integrationSec: lights.seconds,
        nights: lights.nights,
        lastNight: lights.last_night,
        masters: masters.n,
        hasMosaicPlan: mosaic !== undefined
      }
    }
  }
}
