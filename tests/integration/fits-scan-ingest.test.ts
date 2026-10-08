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
const { ScanPacer, ScanCancelled } = await import('../../src/main/services/scan-pacer')

/** Never rests, so tests run at full speed; still honours cancellation. */
const fast = (signal?: AbortSignal) => new ScanPacer(signal, { sliceMs: Number.MAX_SAFE_INTEGER, dutyCycle: 1 })

function addLights(count: number, dir = path.join(root, 'M 81', 'night2')) {
  fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < count; i++) {
    fs.writeFileSync(path.join(dir, `Light_${String(i).padStart(3, '0')}.fit`), fitsBytes({ OBJECT: 'M 81', EXPTIME: 10 }))
  }
}

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
  it('[ING-006] Given a folder with a file that is not FITS, When scanned, Then the file is quarantined with its reason and the others are indexed', async () => {
    await startFolderScan(root)
    expect(rows().map(r => r.file_name)).toEqual(['Light_001.fit', 'Light_002.fit'])
    expect(quarantined()).toEqual([{ file_path: path.join(root, 'M 81', 'night1', 'broken.fit'), error: expect.stringMatching(/.+/) }])
  })

  it('[ING-006] Given a quarantined file that is later fixed, When rescanned, Then it leaves quarantine and is indexed', async () => {
    await startFolderScan(root)
    fs.writeFileSync(path.join(root, 'M 81', 'night1', 'broken.fit'), fitsBytes({ OBJECT: 'M 81', EXPTIME: 10 }))
    await startFolderScan(root)
    expect(quarantined()).toEqual([])
    expect(rows()).toHaveLength(3)
  })

  it('[ING-008] Given an unchanged file, When the folder is scanned again, Then its row, target link and quality verdict are kept', async () => {
    await startFolderScan(root)
    const before = rows()
    sqlite.prepare("UPDATE fits_files SET quality_flag = 'reject' WHERE file_name = 'Light_001.fit'").run()

    await startFolderScan(root)

    const after = rows()
    expect(after.map(r => r.id)).toEqual(before.map(r => r.id))
    expect(after.find(r => r.file_name === 'Light_001.fit')?.quality_flag).toBe('reject')
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM fits_scans').get()).toEqual({ n: 1 })
  })

  it('[ING-008] Given one file rewritten and one deleted, When scanned again, Then only the rewritten file is re-read and the deleted one is dropped', async () => {
    await startFolderScan(root)
    const before = rows()
    const p2 = path.join(root, 'M 81', 'night1', 'Light_002.fit')
    fs.writeFileSync(p2, fitsBytes({ OBJECT: 'M 81', EXPTIME: 20, IMAGETYP: 'Light Frame' }, 2880))
    fs.rmSync(path.join(root, 'M 81', 'night1', 'Light_001.fit'))

    await startFolderScan(root)

    const after = rows()
    expect(after.map(r => r.file_name)).toEqual(['Light_002.fit'])
    expect(after[0].id).not.toBe(before.find(r => r.file_name === 'Light_002.fit')?.id)
    expect(sqlite.prepare("SELECT exposure_sec FROM fits_files").get()).toEqual({ exposure_sec: 20 })
  })

  it('[ING-006] Given an unreadable file that has not changed, When rescanned, Then it stays quarantined without being read again', async () => {
    await startFolderScan(root)
    sqlite.prepare("UPDATE quarantined_files SET quarantined_at = '2000-01-01T00:00:00.000Z'").run()
    await startFolderScan(root)
    expect(sqlite.prepare('SELECT quarantined_at FROM quarantined_files').all()).toEqual([{ quarantined_at: '2000-01-01T00:00:00.000Z' }])
  })

  it('[ING-008] Given a parent folder already scanned, When a child folder is scanned, Then its files keep their rows and move to the new scan', async () => {
    await startFolderScan(root)
    const before = rows()
    const child = await startFolderScan(path.join(root, 'M 81', 'night1'))
    const after = sqlite.prepare('SELECT id, scan_id FROM fits_files ORDER BY file_name').all() as { id: string; scan_id: string }[]
    expect(after.map(r => r.id)).toEqual(before.map(r => r.id))
    expect(after.every(r => r.scan_id === child.id)).toBe(true)
    expect(quarantined()).toHaveLength(1)
  })

  it('[ING-008] Given the same folder spelled with a trailing separator, When scanned, Then it is the same scan root and nothing is re-read', async () => {
    await startFolderScan(root)
    const before = rows()
    await startFolderScan(root + path.sep)
    expect(rows().map(r => r.id)).toEqual(before.map(r => r.id))
    expect(sqlite.prepare('SELECT folder_path FROM fits_scans').all()).toEqual([{ folder_path: root }])
  })

  it('[ING-001] Given a source folder, When scanned twice, Then every file keeps its bytes, size and modified time', async () => {
    const before = snapshot(root)
    await startFolderScan(root)
    await startFolderScan(root)
    expect(snapshot(root)).toEqual(before)
  })

  it('[ING-007] Given a folder, When scanned and scanned again, Then progress counts what was found, read, kept and set aside', async () => {
    const first: { filesFound: number; filesToRead: number; filesRead: number; filesUnchanged: number; quarantined: number }[] = []
    await startFolderScan(root, { pacer: fast(), onProgress: p => first.push(p) })
    expect(first.at(-1)).toEqual({ filesFound: 3, filesToRead: 3, filesRead: 3, filesUnchanged: 0, quarantined: 1 })

    const again: typeof first = []
    await startFolderScan(root, { pacer: fast(), onProgress: p => again.push(p) })
    expect(again.at(-1)).toEqual({ filesFound: 3, filesToRead: 0, filesRead: 0, filesUnchanged: 2, quarantined: 1 })
  })

  it('[ING-014] Given a scan cancelled part way, When scanned again, Then what was read is kept and only the rest is read', async () => {
    addLights(60)
    const abort = new AbortController()
    await expect(startFolderScan(root, {
      pacer: fast(abort.signal),
      onProgress: p => { if (p.filesRead >= 20) abort.abort() }
    })).rejects.toBeInstanceOf(ScanCancelled)

    expect(sqlite.prepare('SELECT status FROM fits_scans').all()).toEqual([{ status: 'cancelled' }])
    const kept = rows()
    expect(kept.length).toBeGreaterThanOrEqual(19)
    expect(kept.length).toBeLessThan(60)

    const again: { filesRead: number; filesUnchanged: number }[] = []
    await startFolderScan(root, { pacer: fast(), onProgress: p => again.push(p) })
    expect(again.at(-1)?.filesUnchanged).toBe(kept.length)
    expect(rows()).toHaveLength(62)
    expect(rows().filter(r => kept.some(k => k.id === r.id))).toHaveLength(kept.length)
    expect(sqlite.prepare('SELECT status FROM fits_scans').all()).toEqual([{ status: 'completed' }])
  })

  it('[ING-014] Given a scan cancelled before it starts reading, When it stops, Then nothing indexed before is lost', async () => {
    await startFolderScan(root)
    const before = rows()
    const abort = new AbortController()
    abort.abort()
    await expect(startFolderScan(root, { pacer: fast(abort.signal) })).rejects.toBeInstanceOf(ScanCancelled)
    expect(rows()).toEqual(before)
  })

  it('[NFR-013] Given a large folder, When scanned with the default pacing, Then the app gets turns throughout the scan', async () => {
    addLights(150)
    let turns = 0
    let longest = 0
    let last = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      longest = Math.max(longest, now - last)
      last = now
      turns++
    }, 1)
    const started = Date.now()
    await startFolderScan(root)
    clearInterval(timer)
    expect(rows()).toHaveLength(152)
    expect(turns).toBeGreaterThan(3)
    // Generous for slow CI runners; before pacing the whole scan was one uninterrupted block.
    expect(longest).toBeLessThan(Math.max(250, (Date.now() - started) / 2))
  })

  it('[NFR-013] Given a scan of a folder already running, When the same or an overlapping folder is scanned, Then the second is refused', async () => {
    const first = startFolderScan(root)
    await expect(startFolderScan(path.join(root, 'M 81'))).rejects.toThrow(/already running/)
    await first
    await expect(startFolderScan(path.join(root, 'M 81'))).resolves.toMatchObject({ status: 'completed' })
  })

  it('[ING-014] Given changed files, When the scan is cancelled before rereading all of them, Then each keeps its old row or gets its new one, never neither', async () => {
    await startFolderScan(root)
    const night1 = path.join(root, 'M 81', 'night1')
    fs.writeFileSync(path.join(night1, 'Light_001.fit'), fitsBytes({ OBJECT: 'M 81', EXPTIME: 30 }, 2880))
    fs.writeFileSync(path.join(night1, 'Light_002.fit'), fitsBytes({ OBJECT: 'M 81', EXPTIME: 30 }, 2880))

    const abort = new AbortController()
    await expect(startFolderScan(root, {
      pacer: fast(abort.signal),
      onProgress: p => { if (p.filesToRead > 0) abort.abort() }
    })).rejects.toBeInstanceOf(ScanCancelled)
    expect(rows().map(r => r.file_name)).toEqual(['Light_001.fit', 'Light_002.fit'])

    await startFolderScan(root)
    expect(sqlite.prepare('SELECT exposure_sec FROM fits_files').all()).toEqual([{ exposure_sec: 30 }, { exposure_sec: 30 }])
  })
})
