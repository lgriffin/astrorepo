import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'
import type { CatalogueSeeds, CatalogueStore, Clock } from '@astro/application'
import { CROSS_REFERENCE, type CatalogueRepairPlan, type InstalledTarget, type LinkedItem, type SeedCatalogue } from '@astro/domain'
import { settingReader } from './shared/app-settings'
import { YOURS } from './shared/sql'

/** The app setting that records the catalogue version an install was last seeded or repaired from. */
export const CATALOGUE_VERSION_KEY = 'catalogue_seed_version'

/**
 * CatalogueSeeds over the JSON files in data/catalogues (specs/047-catalogue-names), in file-name
 * order as the seeder has always read them. The version is the one each file's catalogue block names.
 */
export class FileCatalogueSeeds implements CatalogueSeeds {
  constructor(private readonly folder: string) {}

  async read(): Promise<{ version: string; catalogues: SeedCatalogue[] }> {
    if (!fs.existsSync(this.folder)) return { version: '', catalogues: [] }
    const files = fs.readdirSync(this.folder).filter(f => f.endsWith('.json')).sort()
    const versions = new Set<string>()
    const catalogues = files.map(file => {
      const seed = JSON.parse(fs.readFileSync(path.join(this.folder, file), 'utf-8')) as {
        catalogue: Omit<SeedCatalogue, 'objects'> & { version?: string }
        objects: SeedCatalogue['objects']
      }
      versions.add(seed.catalogue.version ?? '')
      const { name, abbreviation, description, totalObjects } = seed.catalogue
      return { name, abbreviation, description, totalObjects, objects: seed.objects }
    })
    return { version: [...versions].sort().join('+'), catalogues }
  }
}

/** CatalogueStore over the app's SQLite database. */
export class SqliteCatalogueStore implements CatalogueStore {
  constructor(
    private readonly db: Database.Database,
    private readonly clock: Clock
  ) {}

  async version(): Promise<string | null> {
    return settingReader(this.db)(CATALOGUE_VERSION_KEY)
  }

  async installed(): Promise<InstalledTarget[]> {
    const targets = this.db.prepare(
      // A target the user linked to another is theirs to keep too, beyond what the target list counts.
      `SELECT t.id, t.canonical_name, t.is_custom, (${YOURS} OR EXISTS (SELECT 1 FROM target_relationships r
         WHERE r.source_target_id = t.id OR r.related_target_id = t.id)) AS yours FROM targets t ORDER BY t.created_at, t.id`
    ).all() as Array<{ id: string; canonical_name: string; is_custom: number; yours: number }>
    const aliases = this.db.prepare('SELECT target_id, alias, source FROM target_aliases ORDER BY rowid').all() as Array<{ target_id: string; alias: string; source: string | null }>
    const entries = this.db.prepare(
      `SELECT ce.target_id, c.abbreviation, ce.designation FROM catalogue_entries ce
       JOIN catalogues c ON c.id = ce.catalogue_id WHERE c.is_builtin = 1 ORDER BY ce.rowid`
    ).all() as Array<{ target_id: string; abbreviation: string; designation: string }>
    const byTarget = new Map(targets.map(t => [t.id, {
      id: t.id,
      canonicalName: t.canonical_name,
      isCustom: t.is_custom === 1,
      isYours: t.yours === 1,
      aliases: [] as InstalledTarget['aliases'],
      entries: [] as InstalledTarget['entries']
    }]))
    for (const a of aliases) byTarget.get(a.target_id)?.aliases.push({ alias: a.alias, source: a.source ?? '' })
    for (const e of entries) byTarget.get(e.target_id)?.entries.push({ catalogue: e.abbreviation, designation: e.designation })
    return [...byTarget.values()]
  }

  async linked(targetIds: string[]): Promise<{ frames: LinkedItem[]; folders: LinkedItem[] }> {
    const ids = new Set(targetIds)
    const frames = (this.db.prepare(
      'SELECT id, target_id, object_name, folder_name FROM fits_files WHERE target_id IS NOT NULL'
    ).all() as Array<{ id: string; target_id: string; object_name: string | null; folder_name: string | null }>)
      .filter(f => ids.has(f.target_id))
      .map(f => ({ id: f.id, targetId: f.target_id, name: f.object_name, folderName: f.folder_name }))
    const folders = (this.db.prepare(
      'SELECT id, target_id, subfolder_name, subfolder_path FROM target_home_folders'
    ).all() as Array<{ id: string; target_id: string; subfolder_name: string | null; subfolder_path: string }>)
      .filter(f => ids.has(f.target_id))
      .map(f => ({ id: f.id, targetId: f.target_id, name: f.subfolder_name ?? path.basename(f.subfolder_path) }))
    return { frames, folders }
  }

  async apply(plan: CatalogueRepairPlan, catalogues: Array<Omit<SeedCatalogue, 'objects'>>, version: string): Promise<void> {
    const db = this.db
    const now = this.clock.now().toISOString()
    const abbreviations = catalogues.map(c => c.abbreviation)
    db.transaction(() => {
      // Catalogues keep their ids, so the collections made from them keep pointing at them.
      const findCatalogue = db.prepare('SELECT id FROM catalogues WHERE abbreviation = ?')
      const updateCatalogue = db.prepare('UPDATE catalogues SET name = ?, description = ?, total_objects = ?, is_builtin = 1 WHERE id = ?')
      const insertCatalogue = db.prepare(
        'INSERT INTO catalogues (id, name, abbreviation, description, total_objects, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
      )
      const catalogueId = new Map<string, string>()
      for (const c of catalogues) {
        const held = findCatalogue.get(c.abbreviation) as { id: string } | undefined
        const id = held?.id ?? `catalogue-${c.abbreviation.toLowerCase()}`
        if (held) updateCatalogue.run(c.name, c.description, c.totalObjects, id)
        else insertCatalogue.run(id, c.name, c.abbreviation, c.description, c.totalObjects, now)
        catalogueId.set(c.abbreviation, id)
      }

      // The catalogues' own aliases and entries are written afresh; aliases the user gave stay.
      const marks = abbreviations.map(() => '?').join(', ')
      db.prepare(`DELETE FROM target_aliases WHERE source = ? OR source IN (${marks})`).run(CROSS_REFERENCE, ...abbreviations)
      db.prepare(`DELETE FROM catalogue_entries WHERE catalogue_id IN (${marks})`).run(...abbreviations.map(a => catalogueId.get(a)))

      const remove = db.prepare('DELETE FROM targets WHERE id = ?')
      for (const id of plan.remove) remove.run(id)

      const insertTarget = db.prepare(
        `INSERT INTO targets (id, canonical_name, object_type, ra_hours, dec_degrees, magnitude, angular_size_arcmin, constellation,
         workflow_stage, is_custom, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'not_observed', 0, ?, ?)`
      )
      for (const t of plan.create) {
        const f = t.facts
        insertTarget.run(t.id, t.canonicalName, f.type, f.ra, f.dec, f.mag, f.size, f.constellation, now, now)
      }
      const updateTarget = db.prepare(
        `UPDATE targets SET object_type = ?, ra_hours = ?, dec_degrees = ?, magnitude = ?, angular_size_arcmin = ?, constellation = ?,
         updated_at = ? WHERE id = ?`
      )
      for (const { id, facts: f } of plan.update) updateTarget.run(f.type, f.ra, f.dec, f.mag, f.size, f.constellation, now, id)

      // An alias the user already gave to some target keeps it there.
      const insertAlias = db.prepare('INSERT OR IGNORE INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, ?)')
      plan.aliases.forEach((a, i) => insertAlias.run(`${a.targetId}-a${i}`, a.targetId, a.alias, a.source))
      const insertEntry = db.prepare('INSERT OR IGNORE INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)')
      plan.entries.forEach((e, i) => insertEntry.run(`${e.targetId}-e${i}`, catalogueId.get(e.catalogue), e.targetId, e.designation))

      const moveFrame = db.prepare('UPDATE fits_files SET target_id = ? WHERE id = ?')
      for (const f of plan.frames) moveFrame.run(f.targetId, f.id)
      const moveFolder = db.prepare('UPDATE target_home_folders SET target_id = ? WHERE id = ?')
      for (const f of plan.folders) moveFolder.run(f.targetId, f.id)

      // Each catalogue's own collection lists that catalogue's targets again.
      const auto = db.prepare('SELECT id, source_catalogue_id FROM collections WHERE is_auto = 1 AND source_catalogue_id IS NOT NULL').all() as Array<{ id: string; source_catalogue_id: string }>
      for (const c of auto) {
        db.prepare('DELETE FROM collection_memberships WHERE collection_id = ?').run(c.id)
        db.prepare(
          `INSERT OR IGNORE INTO collection_memberships (collection_id, target_id, added_at)
           SELECT ?, target_id, ? FROM catalogue_entries WHERE catalogue_id = ?`
        ).run(c.id, now, c.source_catalogue_id)
      }

      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run(CATALOGUE_VERSION_KEY, version)
    })()
  }
}
