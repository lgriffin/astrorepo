import type Database from 'better-sqlite3'

/** Reads one key of the app_settings table; null when it is unset. Shared by every adapter that reads settings. */
export type SettingReader = (key: string) => string | null

export function settingReader(db: Database.Database): SettingReader {
  const get = db.prepare('SELECT value FROM app_settings WHERE key = ?')
  return key => (get.get(key) as { value: string } | undefined)?.value ?? null
}
