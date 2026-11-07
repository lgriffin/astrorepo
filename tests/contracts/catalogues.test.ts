import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll } from 'vitest'
import type Database from 'better-sqlite3'
import { InMemoryCatalogueSeeds, InMemoryCatalogueStore, FixedClock, type CatalogueInstall } from '@astro/testkit'
import { catalogueSeedsContract, catalogueStoreContract } from '@astro/testkit/contracts/catalogues.contract'
import { FileCatalogueSeeds, SqliteCatalogueStore } from '../../src/main/adapters/catalogues'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

const made: string[] = []
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true })
  teardownTestDb()
})

catalogueSeedsContract('in-memory', (catalogues, version) => new InMemoryCatalogueSeeds(catalogues, version))

catalogueSeedsContract('JSON files', (catalogues, version) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-seeds-'))
  made.push(dir)
  catalogues.forEach((c, i) => {
    const { objects, ...catalogue } = c
    fs.writeFileSync(path.join(dir, `${i}-${c.abbreviation.toLowerCase()}.json`), JSON.stringify({ catalogue: { ...catalogue, version }, objects }))
  })
  // A file that is not a catalogue is not read.
  fs.writeFileSync(path.join(dir, 'README.md'), '# catalogues')
  return new FileCatalogueSeeds(catalogues.length > 0 ? dir : path.join(dir, 'missing'))
})

catalogueStoreContract('in-memory', install => new InMemoryCatalogueStore(install))

/** Writes an install into the database as the old seeder and the scanners left it. */
function writeInstall(db: Database.Database, install: CatalogueInstall): void {
  const now = '2026-11-01T00:00:00.000Z'
  for (const c of install.catalogues) {
    db.prepare('INSERT INTO catalogues (id, name, abbreviation, description, total_objects, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
      .run(`cat-${c.abbreviation}`, c.name, c.abbreviation, c.description, c.totalObjects, now)
  }
  for (const t of install.targets) {
    db.prepare(`INSERT INTO targets (id, canonical_name, object_type, workflow_stage, is_custom, created_at, updated_at) VALUES (?, ?, 'unknown', ?, ?, ?, ?)`)
      .run(t.id, t.canonicalName, t.stage ?? 'not_observed', t.isCustom ? 1 : 0, now, now)
    for (const a of t.aliases ?? []) db.prepare('INSERT INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, ?)').run(`${t.id}:${a.alias}`, t.id, a.alias, a.source)
    for (const e of t.entries ?? []) {
      db.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run(`${t.id}:${e.designation}`, `cat-${e.catalogue}`, t.id, e.designation)
    }
  }
  if (install.frames?.length) db.prepare(`INSERT INTO fits_scans (id, folder_path, status, started_at, created_at) VALUES ('scan', 'D:/Astro', 'done', ?, ?)`).run(now, now)
  for (const f of install.frames ?? []) {
    db.prepare(`INSERT INTO fits_files (id, scan_id, file_path, file_name, file_size_bytes, folder_name, object_name, target_id, created_at) VALUES (?, 'scan', ?, ?, 1, ?, ?, ?, ?)`)
      .run(f.id, `D:/Astro/${f.id}.fit`, `${f.id}.fit`, f.folderName, f.objectName, f.targetId, now)
  }
  for (const f of install.folders ?? []) {
    db.prepare(`INSERT INTO target_home_folders (id, target_id, folder_type, subfolder_name, subfolder_path, scanned_at) VALUES (?, ?, 'raw', ?, ?, ?)`)
      .run(f.id, f.targetId, f.name, `D:/Astro/raw/${f.name}`, now)
  }
}

catalogueStoreContract('SQLite', install => {
  const db = setupTestDb()
  writeInstall(db, install)
  return new SqliteCatalogueStore(db, new FixedClock(new Date('2026-11-07T12:00:00Z')))
})
