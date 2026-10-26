import { afterEach } from 'vitest'
import { InMemoryProjectSources, InMemoryProjectStore } from '@astro/testkit'
import { projectSourcesContract, projectStoreContract } from '@astro/testkit/contracts/projects.contract'
import { SqliteProjectSources, SqliteProjectStore } from '../../src/main/adapters/sqlite-projects'
import { seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

afterEach(() => teardownTestDb())

projectStoreContract('in-memory', () => new InMemoryProjectStore())

projectStoreContract('SQLite', () => {
  const db = setupTestDb()
  for (const id of ['m31', 'm42', 'm81']) seedTarget(db, { id, canonicalName: id.toUpperCase() })
  return new SqliteProjectStore(db)
})

projectSourcesContract('in-memory', f =>
  new InMemoryProjectSources(
    new Map(Object.entries(f.names)),
    // The fake keeps targets in the order given, so the fixture's designation order is applied here.
    f.catalogues.map(c => ({ id: c.id, name: c.name, targetIds: [...c.entries].sort((a, b) => a.designation.length - b.designation.length || a.designation.localeCompare(b.designation)).map(e => e.targetId) })),
    f.collections
  )
)

projectSourcesContract('SQLite', f => {
  const db = setupTestDb()
  for (const [id, name] of Object.entries(f.names)) seedTarget(db, { id, canonicalName: name })
  for (const c of f.catalogues) {
    db.prepare("INSERT INTO catalogues (id, name, abbreviation, created_at) VALUES (?, ?, ?, '2026-10-26')").run(c.id, c.name, c.id.toUpperCase())
    c.entries.forEach((e, i) => db.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run(`${c.id}-${i}`, c.id, e.targetId, e.designation))
  }
  for (const c of f.collections) {
    db.prepare("INSERT INTO collections (id, name, created_at, updated_at) VALUES (?, ?, '2026-10-26', '2026-10-26')").run(c.id, c.name)
    c.targetIds.forEach((t, i) => db.prepare('INSERT INTO collection_memberships (collection_id, target_id, added_at) VALUES (?, ?, ?)').run(c.id, t, `2026-10-26T00:00:0${i}Z`))
  }
  return new SqliteProjectSources(db)
})
