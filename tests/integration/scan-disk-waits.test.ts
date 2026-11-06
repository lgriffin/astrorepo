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

const { startHomeScan, getHomeScanProgress } = await import('../../src/main/services/home-scanner')
const { parseFitsHeadersAsync } = await import('../../src/main/fits/parser')

/**
 * A disk that answers every open, stat and read after a few milliseconds, as Windows does even on
 * a local disk while its virus scanner looks at each file, and counts how many calls are under way.
 */
const WAIT_MS = 4
const disk = { inFlight: 0, most: 0, reads: 0 }
const promises = fs.promises as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
const originals = { open: promises.open, stat: promises.stat }
async function waited<T>(call: () => Promise<T>): Promise<T> {
  disk.inFlight++
  disk.most = Math.max(disk.most, disk.inFlight)
  try {
    await new Promise(resolve => setTimeout(resolve, WAIT_MS))
    return await call()
  } finally {
    disk.inFlight--
  }
}

let home: string

beforeEach(() => {
  Object.assign(disk, { inFlight: 0, most: 0, reads: 0 })
  promises.stat = (...args) => waited(() => originals.stat.apply(fs.promises, args))
  promises.open = async (...args) => {
    const handle = await waited(() => originals.open.apply(fs.promises, args)) as fs.promises.FileHandle
    const read = handle.read.bind(handle) as (...a: unknown[]) => Promise<unknown>
    ;(handle as unknown as { read: unknown }).read = (...a: unknown[]) => { disk.reads++; return waited(() => read(...a)) }
    return handle
  }
  sqlite = setupTestDb()
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-waits-'))
  const extra: Record<string, number> = {}
  // Sixty cards: a two-block header, like a Seestar sub's.
  for (let k = 0; k < 60; k++) extra[`KEY${k}`] = k
  for (const night of ['2026-09-01', '2026-09-02']) {
    const dir = path.join(home, 'raw', 'M 31', night)
    fs.mkdirSync(dir, { recursive: true })
    for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(dir, `Light_${i}.fit`), fitsBytes({ OBJECT: 'M 31', EXPTIME: 10, ...extra }))
  }
})

afterEach(() => {
  Object.assign(promises, originals)
  teardownTestDb()
  fs.rmSync(home, { recursive: true, force: true })
})

async function settled() {
  for (let i = 0; i < 6000; i++) {
    const p = getHomeScanProgress()
    if (p.status !== 'scanning' && p.status !== 'cancelling') return p
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('scan did not finish')
}

describe('a scan on a disk that makes each call wait', () => {
  it('[NFR-022] Given every open, stat and read waiting on the disk, When the library is scanned with the gentle pacing, Then waits overlap four at a time and the scan is not slowed by resting for them', async () => {
    const started = Date.now()
    expect(startHomeScan(home)).toEqual({ started: true })
    const done = await settled()
    const took = Date.now() - started
    expect(done.status).toBe('done')
    expect(done.files).toMatchObject({ filesFound: 120, filesRead: 120 })
    expect(disk.most).toBeGreaterThan(1)
    expect(disk.most).toBeLessThanOrEqual(4)
    // 120 files cost about 600 calls of 4 ms. One at a time, resting for each wait as if it were
    // work, that was over 6 seconds; four at once and resting only for real work, well under 3.
    expect(took).toBeLessThan(3000)
  }, 20000)

  it('[NFR-022] Given a two-block header, When it is read for a scan, Then it costs one read', async () => {
    const file = path.join(home, 'raw', 'M 31', '2026-09-01', 'Light_0.fit')
    disk.reads = 0
    const parsed = await parseFitsHeadersAsync(file)
    expect(parsed.headerMap.get('KEY59')?.value).toBe(59)
    expect(disk.reads).toBe(1)
  })
})

describe('reading a header in pieces', () => {
  it('[NFR-022] Given a disk that answers each read with less than asked for, When a multi-block header is read, Then every card is read and nothing is called unreadable', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-short-'))
    try {
      const extra: Record<string, number> = {}
      for (let k = 0; k < 120; k++) extra[`KEY${k}`] = k
      const file = path.join(dir, 'Light_0.fit')
      fs.writeFileSync(file, fitsBytes({ OBJECT: 'M 31', ...extra }, 2880 * 3))
      promises.open = async (...args) => {
        const handle = await originals.open.apply(fs.promises, args) as fs.promises.FileHandle
        const read = handle.read.bind(handle) as (b: Buffer, o: number, l: number, p: number) => Promise<{ bytesRead: number }>
        // 1,000 bytes at a time: never a whole block, never what was asked for.
        ;(handle as unknown as { read: unknown }).read = (b: Buffer, o: number, l: number, p: number) => read(b, o, Math.min(l, 1000), p)
        return handle
      }
      const parsed = await parseFitsHeadersAsync(file)
      expect(parsed.headerMap.get('KEY119')?.value).toBe(119)
      expect(parsed.headerMap.get('OBJECT')?.value).toBe('M 31')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
