import type Database from 'better-sqlite3'
import { makeListStackingSuggestions } from '@astro/application'
import { SqliteFrameCatalogue } from './adapters/sqlite-frame-catalogue'

/**
 * Composition root for the hexagonal core inside the desktop app. IPC handlers call these use
 * cases instead of services as each service is strangled out of src/main/services.
 */
export function composeCore(db: Database.Database) {
  const frames = new SqliteFrameCatalogue(db)
  return {
    listStackingSuggestions: makeListStackingSuggestions({ frames })
  }
}

export type Core = ReturnType<typeof composeCore>
