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

const { startHomeScan, cancelHomeScan, getHomeScanProgress } = await import('../../src/main/services/home-scanner')
const { ScanPacer } = await import('../../src/main/services/scan-pacer')

const fast = (signal: AbortSignal) => new ScanPacer(signal, { sliceMs: Number.MAX_SAFE_INTEGER, dutyCycle: 1 })

let home: string

async function settled() {
  for (let i = 0; i < 2000; i++) {
    const p = getHomeScanProgress()
    if (p.status !== 'scanning' && p.status !== 'cancelling') return p
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('scan did not finish')
}

beforeEach(() => {
  sqlite = setupTestDb()
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-home-'))
  const night = path.join(home, 'raw', 'M 31', '2026-09-01')
  fs.mkdirSync(night, { recursive: true })
  for (let i = 0; i < 30; i++) {
    fs.writeFileSync(path.join(night, `Light_${i}.fit`), fitsBytes({ OBJECT: 'M 31', EXPTIME: 10 }))
  }
  fs.mkdirSync(path.join(home, 'stacked', 'M 31'), { recursive: true })
  fs.writeFileSync(path.join(home, 'stacked', 'M 31', 'Stacked_30.fit'), fitsBytes({ OBJECT: 'M 31', NCOMBINE: 30 }))
  fs.mkdirSync(path.join(home, 'images', 'M 31'), { recursive: true })
  fs.writeFileSync(path.join(home, 'images', 'M 31', 'final.png'), 'png')
})

afterEach(async () => {
  await settled()
  teardownTestDb()
  fs.rmSync(home, { recursive: true, force: true })
})

describe('home folder scan', () => {
  it('[ING-007] Given a home folder, When scanned, Then it runs in the background with live counts and finds the target in every phase', async () => {
    expect(startHomeScan(home, fast)).toEqual({ started: true })
    // Returns at once: the work happens on later turns of the event loop.
    expect(getHomeScanProgress().status).toBe('scanning')

    const done = await settled()
    expect(done.status).toBe('done')
    expect(done.files).toMatchObject({ filesFound: 1, filesRead: 1 })
    expect(done.phases.map(p => p.status)).toEqual(['complete', 'complete', 'complete', 'complete'])
    const m31 = done.result?.targets.find(t => t.targetName === 'M31')
    expect(m31).toMatchObject({ rawFiles: 30, stackedFiles: 1, imageFiles: 1 })
    expect(m31?.thumbnailPath).toBe(path.join(home, 'images', 'M 31', 'final.png'))
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM fits_files').get() as { n: number }).n).toBe(31)
  })

  it('[ING-014] Given a running scan, When cancelled, Then it stops, says so, and a new scan can start', async () => {
    startHomeScan(home)
    expect(startHomeScan(home)).toEqual({ started: false, reason: 'Scan already in progress' })
    expect(cancelHomeScan()).toEqual({ cancelled: true })
    expect(getHomeScanProgress().status).toBe('cancelling')
    expect(cancelHomeScan()).toEqual({ cancelled: false })

    expect((await settled()).status).toBe('cancelled')
    expect(startHomeScan(home, fast)).toEqual({ started: true })
    expect((await settled()).status).toBe('done')
  })

  it('[ING-014] Given no scan running, When cancel is asked for, Then nothing happens', () => {
    expect(cancelHomeScan()).toEqual({ cancelled: false })
  })
})
