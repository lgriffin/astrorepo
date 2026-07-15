import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { setupTestDb, teardownTestDb, seedTarget } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const { generateFolders, listTemplates, createTemplate } = await import('../../src/main/services/folder')

describe('FolderService', () => {
  let tmpDir: string

  beforeEach(() => {
    sqlite = setupTestDb()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astrorepo-test-'))
    sqlite.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('base_folder_path', ?)").run(tmpDir)
  })

  afterEach(() => {
    teardownTestDb()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('EARS: Folder Generation', () => {
    // Event: User triggers folder generation for a target
    // Action: System reads the template structure, creates directories on disk
    // Response: Returns the created path and list of created directories
    // State: Directories exist on disk, target.folder_path is updated in the database

    it('Given a target and the default Siril template, When folders are generated, Then lights/darks/biases/flats directories are created', () => {
      const targetId = seedTarget(sqlite, { canonicalName: 'Horsehead Nebula', objectType: 'dark_nebula' })

      const result = generateFolders(targetId)

      expect(result.path).toContain('Horsehead_Nebula')
      expect(fs.existsSync(result.path)).toBe(true)
      expect(fs.existsSync(path.join(result.path, 'lights'))).toBe(true)
      expect(fs.existsSync(path.join(result.path, 'darks'))).toBe(true)
      expect(fs.existsSync(path.join(result.path, 'biases'))).toBe(true)
      expect(fs.existsSync(path.join(result.path, 'flats'))).toBe(true)
    })

    it('Given a target with special characters in the name, When folders are generated, Then the name is sanitized', () => {
      const targetId = seedTarget(sqlite, { canonicalName: 'M42: Orion/Great', objectType: 'emission_nebula' })

      const result = generateFolders(targetId)

      expect(result.path).not.toContain(':')
      expect(result.path).not.toContain('/')
      expect(fs.existsSync(result.path)).toBe(true)
    })

    it('Given folder generation succeeds, When the target is re-read, Then folder_path is populated', () => {
      const targetId = seedTarget(sqlite, { canonicalName: 'Whirlpool', objectType: 'galaxy' })

      generateFolders(targetId)

      const row = sqlite.prepare('SELECT folder_path FROM targets WHERE id = ?').get(targetId) as { folder_path: string | null }
      expect(row.folder_path).toBeTruthy()
      expect(row.folder_path).toContain('Whirlpool')
    })

    it('Given a nonexistent target, When folder generation is attempted, Then it throws', () => {
      expect(() => generateFolders('no-such-id')).toThrow('Target not found')
    })
  })

  describe('EARS: Template Management', () => {
    // Event: User lists or creates folder templates
    // Action: System reads/writes template records
    // Response: Returns template objects
    // State: New template persisted with is_builtin = false

    it('Given the default Siril template exists, When listing templates, Then at least one builtin template is returned', () => {
      const templates = listTemplates()

      expect(templates.length).toBeGreaterThanOrEqual(1)
      expect(templates.some((t) => t.isBuiltin)).toBe(true)
      expect(templates.some((t) => t.name === 'Siril Default')).toBe(true)
    })

    it('Given a user creates a custom template, When listing templates, Then the custom template appears with isBuiltin=false', () => {
      const structure = { raw: {}, processed: {}, final: {} }
      const created = createTemplate('My Pipeline', structure)

      expect(created.name).toBe('My Pipeline')
      expect(created.isBuiltin).toBe(false)
      expect(created.structure).toEqual(structure)

      const all = listTemplates()
      expect(all.some((t) => t.name === 'My Pipeline')).toBe(true)
    })
  })
})
