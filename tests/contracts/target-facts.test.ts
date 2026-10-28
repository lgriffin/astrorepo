import { afterEach } from 'vitest'
import { InMemoryTargetFacts } from '@astro/testkit'
import { targetFactsContract } from '@astro/testkit/contracts/target-facts.contract'
import { SqliteTargetFacts } from '../../src/main/adapters/sqlite-target-facts'
import { seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

afterEach(() => teardownTestDb())

targetFactsContract('in-memory', targets => {
  const source = new InMemoryTargetFacts()
  for (const [id, facts] of Object.entries(targets)) source.add(id, facts)
  return source
})

targetFactsContract('SQLite', targets => {
  const db = setupTestDb()
  db.prepare("INSERT INTO catalogues (id, name, abbreviation, created_at) VALUES ('cat-m', 'Messier', 'M', '2026-10-28')").run()
  for (const [id, facts] of Object.entries(targets)) {
    const [own, ...others] = facts.names
    seedTarget(db, { id, canonicalName: own })
    db.prepare('UPDATE targets SET angular_size_arcmin = ? WHERE id = ?').run(facts.angularSizeArcmin, id)
    others.forEach((name, i) => {
      // The first other name is a catalogue designation, the rest aliases, so both tables are read.
      if (i === 0) db.prepare("INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, 'cat-m', ?, ?)").run(`${id}-e`, id, name)
      else db.prepare('INSERT INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, NULL)').run(`${id}-a${i}`, id, name)
    })
  }
  return new SqliteTargetFacts(db)
})
