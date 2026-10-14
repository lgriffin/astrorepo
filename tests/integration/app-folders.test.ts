import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppFolders } from '../../src/main/adapters/app-folders'
import { seedFitsScan, setupTestDb, teardownTestDb } from '../helpers/setup'

afterEach(() => teardownTestDb())

const DATA = path.resolve('/app-data')
const set = (db: ReturnType<typeof setupTestDb>, key: string, value: string) =>
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value)

describe('AppFolders', () => {
  it('[HEX-014] [ING-001] Given home, master and scanned folders, When asked, Then every one is read-only and unset settings are left out', () => {
    const db = setupTestDb()
    set(db, 'home_folder_path', '/astro/home')
    seedFitsScan(db, { id: 's1', folderPath: '/astro/nights' })
    seedFitsScan(db, { id: 's2', folderPath: '/astro/nights' })
    expect(new AppFolders(db, DATA).readOnlyDirs()).toEqual(['/astro/home', '/astro/nights'])
  })

  it('[HEX-014] [ING-013] Given no work area set, When asked, Then the work area is under the app data folder, and a setting replaces it', () => {
    const db = setupTestDb()
    const folders = new AppFolders(db, DATA)
    expect(folders.workArea()).toBe(path.join(DATA, 'work'))
    set(db, 'work_area_path', '/fast/ssd')
    expect(folders.workArea()).toBe('/fast/ssd')
  })

  it('[HEX-014] [ING-013] [NFR-018] Given source folders and targets, When their work folders are asked for, Then each sits in the work area under its own name', () => {
    const db = setupTestDb()
    set(db, 'work_area_path', '/work')
    const folders = new AppFolders(db, DATA)
    const a = folders.sirilWorkDir('/nights/2026-10-01/lights')
    const b = folders.sirilWorkDir('/nights/2026-10-02/lights')
    expect(path.dirname(a)).toBe(path.join('/work', 'siril'))
    expect(path.basename(a)).toMatch(/^lights-[0-9a-f]+$/)
    expect(a).not.toBe(b)
    expect(folders.sirilWorkDir('/nights/2026-10-01/lights/')).toBe(a)
    expect(folders.solveWorkDir('M 31/panel')).toBe(path.join('/work', 'solve', 'M_31_panel'))
  })

  it('[HEX-014] [ARC-012] Given no archive folder set, When asked, Then archives go in the work area, and a setting replaces it', () => {
    const db = setupTestDb()
    set(db, 'work_area_path', '/work')
    const folders = new AppFolders(db, DATA)
    expect(folders.archiveRoot()).toBe(path.join('/work', 'archive'))
    set(db, 'archive_root', '/nas/archive')
    expect(folders.archiveRoot()).toBe('/nas/archive')
  })

  it('[VSP-012] [VSP-014] Given the home folder and Vespera settings, When asked, Then copies land in the home raw folder unless a folder of their own is set, and saved values are read', () => {
    const db = setupTestDb()
    const folders = new AppFolders(db, DATA)
    expect(folders.vesperaSettings()).toMatchObject({ host: '10.0.0.1', port: 21, landingRoot: null, formats: ['fits', 'tiff'] })
    expect(folders.homeFolder()).toBeNull()
    set(db, 'home_folder_path', '/astro/home')
    expect(folders.vesperaSettings()).toMatchObject({ landingRoot: path.join('/astro/home', 'raw'), landingIsHomeRaw: true })
    set(db, 'vespera_landing', '/nas/vespera')
    set(db, 'vespera_host', '192.168.4.1:2121')
    set(db, 'vespera_formats', 'fits,tiff')
    expect(folders.vesperaSettings()).toMatchObject({ host: '192.168.4.1', port: 2121, landingRoot: '/nas/vespera', landingIsHomeRaw: false, formats: ['fits', 'tiff'], ignored: [] })
  })
})
