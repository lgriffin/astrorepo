import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/db/migrations'

const schemaOf = (db: Database.Database) =>
  db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all()

describe('Migrations', () => {
  it('[NFR-008] Given a fresh database, When migrations run twice, Then the second run changes nothing', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const first = schemaOf(db)
    runMigrations(db)
    expect(schemaOf(db)).toEqual(first)
    db.close()
  })

  it('[NFR-008] Given the one migration source, When run, Then it creates the tables the app and the core adapters use', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(t => t.name)
    expect(tables).toEqual(expect.arrayContaining(['targets', 'fits_files', 'integration_goals', 'target_home_data', 'dismissed_suggestions', 'app_settings', 'target_archives']))
    db.close()
  })
})
