import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { setupTestDb, teardownTestDb } from '../helpers/setup'
import { fitsBytes } from '../helpers/fits'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const { startFolderScan } = await import('../../src/main/services/fits-analyzer')

let root: string
const snapshot = (dir: string) =>
  fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => {
      const p = path.join(e.parentPath ?? (e as unknown as { path: string }).path, e.name)
      const st = fs.statSync(p)
      return { p: path.relative(dir, p), size: st.size, mtime: st.mtimeMs, bytes: fs.readFileSync(p).toString('base64') }
    })
    .sort((a, b) => a.p.localeCompare(b.p))

beforeEach(() => {
  sqlite = setupTestDb()
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-scan-'))
  fs.mkdirSync(path.join(root, 'M 81', 'night1'), { recursive: true })
  fs.writeFileSync(path.join(root, 'M 81', 'night1', 'Light_001.fit'), fitsBytes({ OBJECT: 'M 81', EXPTIME: 10, IMAGETYP: 'Light Frame', 'DATE-OBS': '2026-03-01T21:00:00' }))
  fs.writeFileSync(path.join(root, 'M 81', 'night1', 'Light_002.fit'), fitsBytes({ OBJECT: 'M 81', EXPTIME: 10, IMAGETYP: 'Light Frame', 'DATE-OBS': '2026-03-01T21:00:10' }))
  fs.writeFileSync(path.join(root, 'M 81', 'night1', 'broken.fit'), 'this is not a FITS file at all')
})

afterEach(() => {
  teardownTestDb()
  fs.rmSync(root, { recursive: true, force: true })
})

const rows = () => sqlite.prepare('SELECT id, file_name, quality_flag FROM fits_files ORDER BY file_name').all() as { id: string; file_name: string; quality_flag: string | null }[]
const quarantined = () => sqlite.prepare('SELECT file_path, error FROM quarantined_files').all() as { file_path: string; error: string }[]

describe('FITS scan ingest', () => {
  it('[ING-006] Given a folder with a file that is not FITS, When scanned, Then the file is quarantined with its reason and the others are indexed', () => {
    startFolderScan(root)
    expect(rows().map(r => r.file_name)).toEqual(['Light_001.fit', 'Light_002.fit'])
    expect(quarantined()).toEqual([{ file_path: path.join(root, 'M 81', 'night1', 'broken.fit'), error: expect.stringMatching(/.+/) }])
  })

  it('[ING-006] Given a quarantined file that is later fixed, When rescanned, Then it leaves quarantine and is indexed', () => {
    startFolderScan(root)
    fs.writeFileSync(path.join(root, 'M 81', 'night1', 'broken.fit'), fitsBytes({ OBJECT: 'M 81', EXPTIME: 10 }))
    startFolderScan(root)
    expect(quarantined()).toEqual([])
    expect(rows()).toHaveLength(3)
  })

  it('[ING-008] Given an unchanged file, When the folder is scanned again, Then its row, target link and quality verdict are kept', () => {
    startFolderScan(root)
    const before = rows()
    sqlite.prepare("UPDATE fits_files SET quality_flag = 'reject' WHERE file_name = 'Light_001.fit'").run()

    startFolderScan(root)

    const after = rows()
    expect(after.map(r => r.id)).toEqual(before.map(r => r.id))
    expect(after.find(r => r.file_name === 'Light_001.fit')?.quality_flag).toBe('reject')
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM fits_scans').get()).toEqual({ n: 1 })
  })

  it('[ING-008] Given one file rewritten and one deleted, When scanned again, Then only the rewritten file is re-read and the deleted one is dropped', () => {
    startFolderScan(root)
    const before = rows()
    const p2 = path.join(root, 'M 81', 'night1', 'Light_002.fit')
    fs.writeFileSync(p2, fitsBytes({ OBJECT: 'M 81', EXPTIME: 20, IMAGETYP: 'Light Frame' }, 2880))
    fs.rmSync(path.join(root, 'M 81', 'night1', 'Light_001.fit'))

    startFolderScan(root)

    const after = rows()
    expect(after.map(r => r.file_name)).toEqual(['Light_002.fit'])
    expect(after[0].id).not.toBe(before.find(r => r.file_name === 'Light_002.fit')?.id)
    expect(sqlite.prepare("SELECT exposure_sec FROM fits_files").get()).toEqual({ exposure_sec: 20 })
  })

  it('[ING-001] Given a source folder, When scanned twice, Then every file keeps its bytes, size and modified time', () => {
    const before = snapshot(root)
    startFolderScan(root)
    startFolderScan(root)
    expect(snapshot(root)).toEqual(before)
  })
})
