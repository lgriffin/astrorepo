import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import { rebuildFtsIndex } from '../db/fts'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { Catalogue, CatalogueProgress } from '@shared/types'

interface SeedObject {
  designation: string
  name: string
  type: string
  ra: number | null
  dec: number | null
  mag: number | null
  size: number | null
  constellation: string
  aliases: string[]
}

interface SeedFile {
  catalogue: {
    name: string
    abbreviation: string
    description: string
    totalObjects: number
  }
  objects: SeedObject[]
}

export function loadCatalogueSeedData(): void {
  const sqlite = getSqlite()

  const existing = sqlite
    .prepare('SELECT COUNT(*) as cnt FROM catalogues WHERE is_builtin = 1')
    .get() as { cnt: number }

  if (existing.cnt > 0) return

  const seedDir = getSeedDataPath()
  if (!fs.existsSync(seedDir)) return

  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json'))

  const insertCatalogue = sqlite.prepare(
    'INSERT INTO catalogues (id, name, abbreviation, description, total_objects, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  )
  const insertTarget = sqlite.prepare(
    `INSERT OR IGNORE INTO targets (id, canonical_name, object_type, ra_hours, dec_degrees, magnitude,
     angular_size_arcmin, constellation, description, simbad_id, ned_id, workflow_stage, is_custom,
     folder_path, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'planned', 0, NULL, NULL, ?, ?)`
  )
  const insertAlias = sqlite.prepare(
    'INSERT OR IGNORE INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, ?)'
  )
  const insertEntry = sqlite.prepare(
    'INSERT OR IGNORE INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)'
  )
  const findByAlias = sqlite.prepare(
    `SELECT t.id FROM targets t
     LEFT JOIN target_aliases ta ON ta.target_id = t.id
     WHERE t.canonical_name = ? OR ta.alias = ?
     LIMIT 1`
  )

  const transaction = sqlite.transaction(() => {
    const now = new Date().toISOString()

    for (const file of files) {
      const raw = fs.readFileSync(path.join(seedDir, file), 'utf-8')
      const seed: SeedFile = JSON.parse(raw)

      const catId = ulid()
      insertCatalogue.run(
        catId,
        seed.catalogue.name,
        seed.catalogue.abbreviation,
        seed.catalogue.description,
        seed.catalogue.totalObjects,
        now
      )

      for (const obj of seed.objects) {
        let targetId: string | null = null

        const existingByName = findByAlias.get(obj.name, obj.name) as { id: string } | undefined
        if (existingByName) {
          targetId = existingByName.id
        }

        if (!targetId) {
          for (const alias of obj.aliases) {
            const existingByAlias = findByAlias.get(alias, alias) as { id: string } | undefined
            if (existingByAlias) {
              targetId = existingByAlias.id
              break
            }
          }
        }

        if (!targetId) {
          targetId = ulid()
          insertTarget.run(
            targetId,
            obj.name,
            obj.type,
            obj.ra,
            obj.dec,
            obj.mag,
            obj.size,
            obj.constellation,
            now,
            now
          )
        }

        insertEntry.run(ulid(), catId, targetId, obj.designation)

        if (obj.designation !== obj.name) {
          insertAlias.run(ulid(), targetId, obj.designation, seed.catalogue.abbreviation)
        }
        for (const alias of obj.aliases) {
          insertAlias.run(ulid(), targetId, alias, 'cross-reference')
        }
      }
    }
  })

  transaction()
  try {
    rebuildFtsIndex(sqlite)
  } catch {
    console.warn('FTS index rebuild skipped')
  }
}

export function listCatalogues(): Catalogue[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare('SELECT id, name, abbreviation, description, total_objects, is_builtin, created_at FROM catalogues ORDER BY name')
    .all() as Array<{
    id: string
    name: string
    abbreviation: string
    description: string | null
    total_objects: number | null
    is_builtin: number
    created_at: string
  }>

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    abbreviation: r.abbreviation,
    description: r.description,
    totalObjects: r.total_objects,
    isBuiltin: r.is_builtin === 1,
    createdAt: r.created_at
  }))
}

export function getCatalogueProgress(): CatalogueProgress[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare(
      `SELECT c.id as catalogue_id, c.name as catalogue_name, c.abbreviation,
              COUNT(ce.id) as total,
              COUNT(CASE WHEN t.workflow_stage IN ('published','printed','archived') THEN 1 END) as completed
       FROM catalogues c
       LEFT JOIN catalogue_entries ce ON ce.catalogue_id = c.id
       LEFT JOIN targets t ON t.id = ce.target_id
       GROUP BY c.id
       ORDER BY c.name`
    )
    .all() as Array<{
    catalogue_id: string
    catalogue_name: string
    abbreviation: string
    total: number
    completed: number
  }>

  return rows.map((r) => ({
    catalogueId: r.catalogue_id,
    catalogueName: r.catalogue_name,
    abbreviation: r.abbreviation,
    completed: r.completed,
    total: r.total
  }))
}

function getSeedDataPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'data', 'catalogues')
  }
  return path.join(app.getAppPath(), 'data', 'catalogues')
}
