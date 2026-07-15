import { getSqlite } from '../db/connection'

export function getSetting(key: string): string | null {
  const sqlite = getSqlite()
  const row = sqlite.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  const sqlite = getSqlite()
  sqlite.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value)
}

export function deleteSetting(key: string): void {
  const sqlite = getSqlite()
  sqlite.prepare('DELETE FROM app_settings WHERE key = ?').run(key)
}

export function listSettings(): Array<{ key: string; value: string }> {
  const sqlite = getSqlite()
  return sqlite.prepare('SELECT key, value FROM app_settings ORDER BY key').all() as Array<{ key: string; value: string }>
}
