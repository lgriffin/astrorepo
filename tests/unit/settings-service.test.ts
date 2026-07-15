import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const { getSetting, setSetting, deleteSetting, listSettings } = await import('../../src/main/services/settings')

describe('SettingsService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: App Settings CRUD', () => {
    // Event: Application reads or writes configuration
    // Action: System queries/mutates the app_settings key-value table
    // Response: Returns setting value or performs write
    // State: app_settings row created/updated/deleted

    it('Given no settings exist, When getSetting is called, Then it returns null', () => {
      expect(getSetting('nonexistent_key')).toBeNull()
    })

    it('Given a setting is stored, When getSetting is called with its key, Then the value is returned', () => {
      setSetting('fits_master_folder', '/home/astro/fits')
      expect(getSetting('fits_master_folder')).toBe('/home/astro/fits')
    })

    it('Given a setting exists, When setSetting is called with the same key, Then the value is overwritten', () => {
      setSetting('base_folder_path', '/old/path')
      setSetting('base_folder_path', '/new/path')
      expect(getSetting('base_folder_path')).toBe('/new/path')
    })

    it('Given a setting exists, When deleteSetting is called, Then the key is removed', () => {
      setSetting('temp_key', 'temp_value')
      deleteSetting('temp_key')
      expect(getSetting('temp_key')).toBeNull()
    })

    it('Given multiple settings, When listSettings is called, Then all are returned sorted by key', () => {
      setSetting('z_setting', 'last')
      setSetting('a_setting', 'first')
      setSetting('m_setting', 'middle')

      const settings = listSettings()
      expect(settings).toHaveLength(3)
      expect(settings[0].key).toBe('a_setting')
      expect(settings[1].key).toBe('m_setting')
      expect(settings[2].key).toBe('z_setting')
    })
  })
})
