import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { setupTestDb, teardownTestDb } from '../helpers/setup'
import { fitsBytes } from '../helpers/fits'
import { readerThreads } from '../helpers/reader-threads'
import type { ScanFileCounts } from '../../src/shared/types'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const { startFolderScan, useFrameReaders } = await import('../../src/main/services/fits-analyzer')
const { ScanPacer, ScanCancelled } = await import('../../src/main/services/scan-pacer')
const { WorkerFrameReader, inPlaceFrameReader } = await import('../../src/main/fits/frame-reader')

/** Never rests, so tests run at full speed; still honours cancellation. */
const fast = (signal?: AbortSignal) => new ScanPacer(signal, { sliceMs: Number.MAX_SAFE_INTEGER, dutyCycle: 1 })

let root: string

function addLights(count: number, night: string) {
  const dir = path.join(root, 'M 81', night)
  fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < count; i++) {
    fs.writeFileSync(path.join(dir, `Light_${String(i).padStart(3, '0')}.fit`), fitsBytes({ OBJECT: 'M 81', EXPTIME: 10, FRAME: i }))
  }
}

const indexed = () => (sqlite.prepare('SELECT COUNT(*) AS n FROM fits_files').get() as { n: number }).n
const quarantined = () => (sqlite.prepare('SELECT COUNT(*) AS n FROM quarantined_files').get() as { n: number }).n

beforeEach(() => {
  sqlite = setupTestDb()
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-threads-'))
})

afterEach(() => {
  useFrameReaders(() => inPlaceFrameReader)
  teardownTestDb()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('a scan read on reader threads', () => {
  it('[NFR-023] Given a folder, When scanned on reader threads, Then every frame is indexed with its headers, eight lists at most under way, and the threads stop with the scan', async () => {
    addLights(150, 'night1')
    const threads = readerThreads({ delayMs: 2 })
    useFrameReaders(() => new WorkerFrameReader(threads.create))
    const scan = await startFolderScan(root, { pacer: fast() })
    expect(scan.status).toBe('completed')
    expect(indexed()).toBe(150)
    const frame = sqlite.prepare(
      "SELECT h.value FROM fits_headers h JOIN fits_files f ON f.id = h.file_id WHERE f.file_name = 'Light_042.fit' AND h.keyword = 'FRAME'"
    ).get() as { value: string }
    expect(frame.value).toBe('42')
    expect(threads.counts.most).toBeGreaterThan(1)
    expect(threads.counts.most).toBeLessThanOrEqual(8)
    expect(threads.counts.terminated).toBe(threads.made.length)
  })

  it('[NFR-023] Given one slow list, When the others come back, Then they are written without waiting for it', async () => {
    addLights(64, 'night1')
    // The first list (Light_000 to Light_015) takes far longer than the rest.
    const threads = readerThreads({ delayMs: 1, slowPath: { match: 'Light_000', delayMs: 300 } })
    const seen: ScanFileCounts[] = []
    await startFolderScan(root, {
      pacer: fast(),
      reader: new WorkerFrameReader(threads.create),
      onProgress: p => seen.push(p)
    })
    const readCounts = seen.map(p => p.filesRead).filter(n => n > 0)
    // Three lists were written before the slow first one: reading was not held up in batches.
    expect(readCounts.slice(0, 3)).toEqual([16, 32, 48])
    expect(readCounts.at(-1)).toBe(64)
    expect(indexed()).toBe(64)
  })

  it('[ING-016] Given a scan, When it checks files for changes, Then progress counts the files checked', async () => {
    addLights(150, 'night1')
    const seen: ScanFileCounts[] = []
    await startFolderScan(root, { pacer: fast(), reader: new WorkerFrameReader(readerThreads().create), onProgress: p => seen.push({ ...p }) })
    const checking = seen.filter(p => p.filesToRead === 0 && p.filesChecked > 0).map(p => p.filesChecked)
    expect(checking.length).toBeGreaterThan(1)
    expect(checking.at(-1)).toBe(150)
    expect(seen.at(-1)).toMatchObject({ filesChecked: 150, filesRead: 150, secondsLeft: null })
  })

  it('[NFR-024] Given reader threads that cannot start, When scanned, Then the scan reads in place and no file is set aside as unreadable', async () => {
    addLights(80, 'night1')
    const threads = readerThreads({ failFrom: 0 })
    const scan = await startFolderScan(root, { pacer: fast(), reader: new WorkerFrameReader(threads.create) })
    expect(scan.status).toBe('completed')
    expect(indexed()).toBe(80)
    expect(quarantined()).toBe(0)
    // The scan gave up on threads after the first failure rather than starting one for every list.
    expect(threads.made.length).toBeLessThanOrEqual(8)
  })

  it('[NFR-024] Given a thread that dies part way, When scanned, Then every frame is still indexed and none is called unreadable', async () => {
    addLights(120, 'night1')
    const threads = readerThreads({ failFrom: 3, delayMs: 2 })
    await startFolderScan(root, { pacer: fast(), reader: new WorkerFrameReader(threads.create, 4) })
    expect(indexed()).toBe(120)
    expect(quarantined()).toBe(0)
  })

  it('[ING-014] Given a scan on reader threads cancelled part way, When scanned again, Then lists read before the cancel are kept and only the rest is read', async () => {
    addLights(200, 'night1')
    const abort = new AbortController()
    await expect(startFolderScan(root, {
      pacer: fast(abort.signal),
      reader: new WorkerFrameReader(readerThreads({ delayMs: 2 }).create),
      onProgress: p => { if (p.filesRead >= 32) abort.abort() }
    })).rejects.toBeInstanceOf(ScanCancelled)
    const kept = indexed()
    expect(kept).toBeGreaterThanOrEqual(32)
    expect(kept).toBeLessThan(200)
    expect(kept % 16).toBe(0)

    const again: ScanFileCounts[] = []
    await startFolderScan(root, { pacer: fast(), onProgress: p => again.push(p) })
    expect(again.at(-1)).toMatchObject({ filesUnchanged: kept, filesRead: 200 - kept })
    expect(indexed()).toBe(200)
  })
})
