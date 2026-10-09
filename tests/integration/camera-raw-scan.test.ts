import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { makeEstimateSirilRun } from '@astro/application'
import { setupTestDb, teardownTestDb } from '../helpers/setup'
import { fitsBytes } from '../helpers/fits'
import { cr2Bytes } from '../helpers/tiff'
import { runMigrations } from '../../src/main/db/migrations'
import { NodeSirilWorkspace } from '../../src/main/adapters/node-siril-workspace'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const { startFolderScan } = await import('../../src/main/services/fits-analyzer')
const { ScanPacer } = await import('../../src/main/services/scan-pacer')

const fast = () => new ScanPacer(undefined, { sliceMs: Number.MAX_SAFE_INTEGER, dutyCycle: 1 })

let root: string
beforeEach(() => {
  sqlite = setupTestDb()
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-raw-scan-'))
  const lights = path.join(root, 'M 31', 'Lights')
  const darks = path.join(root, 'M 31', 'Darks')
  fs.mkdirSync(lights, { recursive: true })
  fs.mkdirSync(darks, { recursive: true })
  fs.writeFileSync(path.join(lights, 'IMG_0001.CR2'), cr2Bytes())
  fs.writeFileSync(path.join(lights, 'IMG_0002.CR2'), cr2Bytes({ date: '2024:03:10 21:17:05' }))
  fs.writeFileSync(path.join(lights, 'IMG_0003.CR3'), 'ftypcrx ISO base media, not TIFF')
  fs.writeFileSync(path.join(lights, 'DSC_0004.NEF'), 'a damaged file, not TIFF at all')
  fs.writeFileSync(path.join(darks, 'IMG_0100.CR2'), cr2Bytes({ offset: null }))
  fs.writeFileSync(path.join(root, 'M 31', 'notes.txt'), 'not a frame')
})

afterEach(() => {
  teardownTestDb()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('scanning camera RAW', () => {
  it('[RIG-001] [RIG-017] Given CR2 lights and darks, When the folder is scanned, Then they join the FITS index with exposure, ISO as gain, time, size, type and their format', async () => {
    await startFolderScan(root, { pacer: fast() })
    const rows = sqlite
      .prepare('SELECT file_name, source_format, image_type, exposure_sec, gain, date_obs, naxis1, naxis2, instrument, object_name FROM fits_files ORDER BY file_name')
      .all()
    expect(rows).toEqual([
      { file_name: 'IMG_0001.CR2', source_format: 'raw', image_type: 'Light', exposure_sec: 120, gain: 800, date_obs: '2024-03-10T20:15:03.000Z', naxis1: 5568, naxis2: 3708, instrument: 'Canon EOS 6D', object_name: 'M 31' },
      { file_name: 'IMG_0002.CR2', source_format: 'raw', image_type: 'Light', exposure_sec: 120, gain: 800, date_obs: '2024-03-10T20:17:05.000Z', naxis1: 5568, naxis2: 3708, instrument: 'Canon EOS 6D', object_name: 'M 31' },
      { file_name: 'IMG_0100.CR2', source_format: 'raw', image_type: 'Dark', exposure_sec: 120, gain: 800, date_obs: '2024-03-10T21:15:03.000', naxis1: 5568, naxis2: 3708, instrument: 'Canon EOS 6D', object_name: 'M 31' }
    ])
    const focal = sqlite.prepare("SELECT h.value FROM fits_headers h JOIN fits_files f ON f.id = h.file_id WHERE f.file_name = 'IMG_0001.CR2' AND h.keyword = 'FOCALLEN'").get() as { value: string }
    expect(focal.value).toBe('135')
  })

  it('[RIG-002] [RIG-003] Given a CR3 and a damaged NEF, When scanned, Then both are listed with the files that could not be read, each with its reason', async () => {
    await startFolderScan(root, { pacer: fast() })
    const quarantined = sqlite.prepare('SELECT file_path, error FROM quarantined_files ORDER BY file_path').all() as { file_path: string; error: string }[]
    expect(quarantined.map(q => path.basename(q.file_path))).toEqual(['DSC_0004.NEF', 'IMG_0003.CR3'])
    expect(quarantined[0].error).toContain('Camera RAW (NEF) could not be read')
    expect(quarantined[1].error).toContain('Camera RAW (CR3) found; its metadata is not read')
  })

  it('[RIG-004] Given a scanned folder of RAW frames, When the stacking plan is made, Then RAW frames are laid out as they are, taken as colour, and the colour script is chosen', async () => {
    fs.writeFileSync(path.join(root, 'M 31', 'Lights', 'Light_005.fit'), fitsBytes({ OBJECT: 'M 31', EXPTIME: 120, IMAGETYP: 'Light Frame', NAXIS1: 10, NAXIS2: 10, BAYERPAT: 'RGGB' }))
    await startFolderScan(root, { pacer: fast() })
    const workspace = new NodeSirilWorkspace(sqlite)
    const source = path.join(root, 'M 31')
    expect((await workspace.listSourceFrames(source)).map(f => [f.name, f.imageType])).toEqual([
      ['IMG_0100.CR2', 'Dark'],
      ['DSC_0004.NEF', null],
      ['IMG_0001.CR2', 'Light'],
      ['IMG_0002.CR2', 'Light'],
      ['IMG_0003.CR3', null],
      ['Light_005.fit', 'Light Frame']
    ])
    const [detail] = await workspace.frameDetails([path.join(source, 'Lights', 'IMG_0001.CR2')])
    expect(detail).toMatchObject({ width: 5568, height: 3708, colour: true, settings: { exposureSec: 120, gain: 800, focalMm: 135 } })
    const plan = await makeEstimateSirilRun({ workspace })(source, path.join(root, 'work'))
    expect(plan.counts).toEqual({ lights: 5, darks: 1, flats: 0, biases: 0 })
    expect(plan.sensor).toBe('colour')
    expect(plan.recommended.script).toBe('OSC_Preprocessing_WithoutFlat')
    expect(plan.cameraRaw).toEqual({ count: 4, unread: 1, formats: ['CR2', 'CR3', 'NEF'] })
  })

  it('[RIG-017] Given RAW darks and flats in folders such as "Darks_ISO800", "Flats-L" and "Darks/ISO800", When scanned and laid out, Then they are darks and flats, not lights', async () => {
    const target = path.join(root, 'NGC 7000')
    for (const dir of ['Darks_ISO800', 'Flats-L', path.join('Darks', 'ISO800'), 'Dark Shark']) fs.mkdirSync(path.join(target, dir), { recursive: true })
    fs.writeFileSync(path.join(target, 'Darks_ISO800', 'IMG_0200.CR2'), cr2Bytes())
    fs.writeFileSync(path.join(target, 'Flats-L', 'IMG_0300.CR2'), cr2Bytes())
    fs.writeFileSync(path.join(target, 'Darks', 'ISO800', 'IMG_0400.CR2'), cr2Bytes())
    fs.writeFileSync(path.join(target, 'Dark Shark', 'IMG_0500.CR2'), cr2Bytes())
    await startFolderScan(root, { pacer: fast() })
    const types = sqlite.prepare("SELECT file_name, image_type FROM fits_files WHERE file_name IN ('IMG_0200.CR2', 'IMG_0300.CR2', 'IMG_0400.CR2', 'IMG_0500.CR2') ORDER BY file_name").all()
    expect(types).toEqual([
      { file_name: 'IMG_0200.CR2', image_type: 'Dark' },
      { file_name: 'IMG_0300.CR2', image_type: 'Flat' },
      { file_name: 'IMG_0400.CR2', image_type: null },
      { file_name: 'IMG_0500.CR2', image_type: null }
    ])
    const listed = await new NodeSirilWorkspace(sqlite).listSourceFrames(target)
    expect(listed.map(f => [f.name, f.imageType]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ['IMG_0200.CR2', 'Dark'],
      ['IMG_0300.CR2', 'Flat'],
      ['IMG_0400.CR2', 'Dark'],
      ['IMG_0500.CR2', null]
    ])
    const plan = await makeEstimateSirilRun({ workspace: new NodeSirilWorkspace(sqlite) })(target, path.join(root, 'work'))
    expect(plan.counts).toEqual({ lights: 1, darks: 2, flats: 1, biases: 0 })
  })

  it('[RIG-001] Given the migrations, When they run again, Then the RAW format column and the comet table are there once and nothing changes', () => {
    runMigrations(sqlite)
    const columns = sqlite.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('fits_files') WHERE name = 'source_format'").get() as { n: number }
    expect(columns.n).toBe(1)
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'comet_orbits'").get()).toEqual({ name: 'comet_orbits' })
  })
})
