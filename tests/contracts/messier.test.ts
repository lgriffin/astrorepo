import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeTilePictures, InMemoryMessierCatalogue } from '@astro/testkit'
import { messierCatalogueContract, tilePicturesContract, type SeedPicture } from '@astro/testkit/contracts/messier.contract'
import { messierNumber } from '@astro/domain'
import { SqliteMessierCatalogue } from '../../src/main/adapters/sqlite-messier'
import { NodeTilePictures } from '../../src/main/adapters/tile-pictures'
import { NodeImagePixels } from '../../src/main/adapters/node-image-pixels'
import { seedFitsFile, seedFitsScan, seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'
import { fitsImage } from '../helpers/fits'
import { png } from '../helpers/png'

const dirs: string[] = []
afterEach(() => {
  teardownTestDb()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-messier-'))
  dirs.push(root)
  return root
}

messierCatalogueContract('in-memory', async seed => {
  const catalogue = new InMemoryMessierCatalogue()
  const pathOf = (p: Pick<SeedPicture, 'targetId' | 'name' | 'kind'>) => (p.kind === 'master' ? `/fits/${p.name}` : `/images/${p.targetId}/${p.name}`)
  for (const m of seed.messier) {
    catalogue.add({
      number: messierNumber(m.designation)!,
      designation: m.designation,
      targetId: m.targetId,
      name: m.name === m.designation ? null : m.name,
      objectType: m.objectType,
      constellation: m.constellation,
      magnitude: m.magnitude,
      raHours: m.raHours,
      decDeg: m.decDeg
    })
  }
  for (const p of seed.pictures.filter(p => !p.gone)) {
    catalogue.picture(p.targetId, { path: pathOf(p), kind: p.kind, colour: p.kind === 'master' ? (p.colour ?? null) : null, modifiedAt: new Date(p.modifiedAt) })
  }
  return { catalogue, pathOf }
})

/** The catalogues seeded as the app seeds them, with masters in the index and finished images in each target's folder. */
function seedSqlite(seed: Parameters<Parameters<typeof messierCatalogueContract>[1]>[0]) {
  const db = setupTestDb()
  const root = tempRoot()
  const scan = seedFitsScan(db)
  const now = new Date().toISOString()
  const pathOf = (p: Pick<SeedPicture, 'targetId' | 'name' | 'kind'>) => (p.kind === 'master' ? path.join(root, 'fits', p.name) : path.join(root, 'images', p.targetId, p.name))
  fs.mkdirSync(path.join(root, 'fits'))
  for (const abbr of ['M', 'NGC', 'C']) db.prepare('INSERT INTO catalogues (id, name, abbreviation, created_at) VALUES (?, ?, ?, ?)').run(`cat-${abbr}`, `Catalogue ${abbr}`, abbr, now)
  for (const m of seed.messier) {
    seedTarget(db, { id: m.targetId, canonicalName: m.name, objectType: m.objectType, constellation: m.constellation, magnitude: m.magnitude, raHours: m.raHours, decDegrees: m.decDeg })
    db.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run(`e-${m.designation}`, 'cat-M', m.targetId, m.designation)
  }
  for (const o of seed.others) {
    seedTarget(db, { id: o.targetId, canonicalName: o.designation })
    db.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run(`e-${o.designation}`, `cat-${o.catalogue}`, o.targetId, o.designation)
  }
  const header = db.prepare('INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES (?, ?, ?, ?, NULL, ?)')
  for (const [i, p] of seed.pictures.entries()) {
    const file = pathOf(p)
    if (p.kind === 'master') {
      if (!p.gone) fs.writeFileSync(file, 'pixels')
      const id = `f${i}`
      seedFitsFile(db, scan, { id, fileName: p.name, filePath: file, targetId: p.targetId, imageType: 'Light', isStacked: true, ncombine: 20, exposureSec: 10 })
      db.prepare('UPDATE fits_files SET file_modified_at = ? WHERE id = ?').run(p.modifiedAt, id)
      header.run(`${id}-naxis`, id, p.colour ? 'NAXIS3' : 'NAXIS', p.colour ? '3' : '2', 1)
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, 'pixels')
      const t = new Date(p.modifiedAt)
      fs.utimesSync(file, t, t)
      db.prepare('INSERT OR REPLACE INTO target_home_data (target_id, images_path, scanned_at) VALUES (?, ?, ?)').run(p.targetId, path.dirname(file), now)
    }
  }
  return { db, root, pathOf }
}

messierCatalogueContract('SQLite', async seed => {
  const { db, pathOf } = seedSqlite(seed)
  return { catalogue: new SqliteMessierCatalogue(db), pathOf }
})

describe('SqliteMessierCatalogue', () => {
  it('[MES-003] Given images filed loose in the library’s shared images folder, When an object’s pictures are listed, Then only files whose names give its Messier number are its own, and a folder named for it counts', async () => {
    const db = setupTestDb()
    const home = tempRoot()
    const images = path.join(home, 'images')
    fs.mkdirSync(path.join(images, 'M31 Andromeda'), { recursive: true })
    for (const name of ['M31_final.jpg', 'm 31 v2.png', 'M310-not.png', 'M3_cluster.png', 'NGC7000.jpg']) fs.writeFileSync(path.join(images, name), 'x')
    fs.writeFileSync(path.join(images, 'M31 Andromeda', 'deep.png'), 'x')
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('home_folder_path', ?)").run(home)
    db.prepare('INSERT INTO catalogues (id, name, abbreviation, created_at) VALUES (?, ?, ?, ?)').run('cat-M', 'Messier', 'M', new Date().toISOString())
    seedTarget(db, { id: 'andromeda', canonicalName: 'Andromeda Galaxy' })
    db.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run('e-m31', 'cat-M', 'andromeda', 'M31')
    db.prepare('INSERT INTO target_home_data (target_id, images_path, scanned_at) VALUES (?, ?, ?)').run('andromeda', images, new Date().toISOString())
    const names = (await new SqliteMessierCatalogue(db).pictures('andromeda')).map(p => path.basename(p.path)).sort()
    expect(names).toEqual(['M31_final.jpg', 'deep.png', 'm 31 v2.png'])
  })

  it('[MES-003] Given an object with its own folder, folders under its name or alias and loose images in the shared folder, When listed, Then all count, once each, even before a scan records a folder', async () => {
    const db = setupTestDb()
    const home = tempRoot()
    const images = path.join(home, 'images')
    const own = path.join(images, 'M31 Andromeda')
    fs.mkdirSync(path.join(own, 'v1'), { recursive: true })
    fs.mkdirSync(path.join(images, 'Andromeda Galaxy'))
    fs.mkdirSync(path.join(images, 'Great Andromeda 2025'))
    fs.mkdirSync(path.join(images, 'M33 Triangulum'))
    fs.mkdirSync(path.join(images, 'Andromedary'))
    fs.writeFileSync(path.join(own, 'final.jpg'), 'x')
    fs.writeFileSync(path.join(own, 'v1', 'older.png'), 'x')
    fs.writeFileSync(path.join(images, 'Andromeda Galaxy', 'alt.jpg'), 'x')
    fs.writeFileSync(path.join(images, 'Great Andromeda 2025', 'alias.png'), 'x')
    fs.writeFileSync(path.join(images, 'M33 Triangulum', 'm33.jpg'), 'x')
    fs.writeFileSync(path.join(images, 'Andromedary', 'camel.jpg'), 'x')
    for (const name of ['M31_loose.png', 'M33.png']) fs.writeFileSync(path.join(images, name), 'x')
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('home_folder_path', ?)").run(home)
    db.prepare('INSERT INTO catalogues (id, name, abbreviation, created_at) VALUES (?, ?, ?, ?)').run('cat-M', 'Messier', 'M', new Date().toISOString())
    seedTarget(db, { id: 'andromeda', canonicalName: 'Andromeda Galaxy' })
    db.prepare('INSERT INTO target_aliases (id, target_id, alias) VALUES (?, ?, ?)').run('a1', 'andromeda', 'Great Andromeda')
    db.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run('e-m31', 'cat-M', 'andromeda', 'M31')
    const catalogue = new SqliteMessierCatalogue(db)
    const all = ['M31_loose.png', 'alias.png', 'alt.jpg', 'final.jpg', 'older.png']
    expect((await catalogue.pictures('andromeda')).map(p => path.basename(p.path)).sort()).toEqual(all)
    db.prepare('INSERT INTO target_home_data (target_id, images_path, scanned_at) VALUES (?, ?, ?)').run('andromeda', own, new Date().toISOString())
    expect((await catalogue.pictures('andromeda')).map(p => path.basename(p.path)).sort()).toEqual(all)
  })

  it('[MES-003] Given a target’s own images folder, When listed, Then files one folder deep count and deeper ones and other files do not', async () => {
    const db = setupTestDb()
    const root = tempRoot()
    const images = path.join(root, 'M42')
    fs.mkdirSync(path.join(images, 'v1', 'deeper'), { recursive: true })
    fs.writeFileSync(path.join(images, 'final.jpeg'), 'x')
    fs.writeFileSync(path.join(images, 'v1', 'final.tiff'), 'x')
    fs.writeFileSync(path.join(images, 'v1', 'notes.txt'), 'x')
    fs.writeFileSync(path.join(images, 'v1', 'deeper', 'old.png'), 'x')
    seedTarget(db, { id: 'm42' })
    db.prepare('INSERT INTO target_home_data (target_id, images_path, scanned_at) VALUES (?, ?, ?)').run('m42', images, new Date().toISOString())
    const names = (await new SqliteMessierCatalogue(db).pictures('m42')).map(p => path.basename(p.path)).sort()
    expect(names).toEqual(['final.jpeg', 'final.tiff'])
  })
})

tilePicturesContract('fake', async images => {
  const pictures = new FakeTilePictures()
  for (const i of images) pictures.add(`/images/${i.name}`, i)
  return { pictures, path: name => `/images/${name}`, missing: '/images/gone.png' }
})

/** Writes each image as a file: a grey gradient PNG, or a FITS master of camera counts. */
function writeTileImages(dir: string, images: { name: string; width: number; height: number }[]) {
  for (const i of images) {
    if (i.name.endsWith('.png')) {
      const rows = Array.from({ length: i.height }, (_, y) => Array.from({ length: i.width * 3 }, (_, x) => (x * 5 + y * 3) % 256))
      fs.writeFileSync(path.join(dir, i.name), png(i.width, i.height, 2, 8, rows))
    } else {
      const plane = Array.from({ length: i.width * i.height }, (_, n) => 1000 + (n % 11) * 20)
      fs.writeFileSync(path.join(dir, i.name), fitsImage(i.width, i.height, [plane]))
    }
  }
}

tilePicturesContract('Node', async images => {
  const dir = tempRoot()
  writeTileImages(dir, images)
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x')
  return { pictures: new NodeTilePictures(new NodeImagePixels()), path: name => path.join(dir, name), missing: path.join(dir, 'gone.png') }
})

describe('NodeTilePictures', () => {
  it('[MES-003] Given a finished PNG, When drawn, Then its own tones are kept rather than stretched', async () => {
    const dir = tempRoot()
    // A flat mid-grey PNG: an auto-stretch would push it to a quarter grey; drawn as it is, it stays 128.
    fs.writeFileSync(path.join(dir, 'flat.png'), png(4, 4, 0, 8, Array.from({ length: 4 }, () => [128, 128, 128, 128])))
    const asked: { stretch?: string }[] = []
    const pixels = new NodeImagePixels()
    const spy = { preview: (p: string, o: { maxWidth: number; stretch?: 'auto' | 'linear' }) => (asked.push(o), pixels.preview(p, o)) }
    await new NodeTilePictures(spy).draw(path.join(dir, 'flat.png'), { maxWidth: 64, stretch: false })
    await new NodeTilePictures(spy).draw(path.join(dir, 'flat.png'), { maxWidth: 64, stretch: true })
    expect(asked.map(a => a.stretch)).toEqual(['linear', 'auto'])
    const { preview } = await pixels.preview(path.join(dir, 'flat.png'), { maxWidth: 64, stretch: 'linear' })
    expect([...preview.data]).toEqual(new Array(16).fill(128))
  })

  it('[MES-003] [MES-004] Given a JPEG or TIFF, When drawn, Then the host’s thumbnailer draws it, and without one it fails with a reason', async () => {
    const native = async (p: string, maxWidth: number) => ({ mime: 'image/jpeg' as const, data: Uint8Array.from([0xff, 0xd8]), width: Math.min(maxWidth, 100), height: 50, path: p })
    const drawn = await new NodeTilePictures(new NodeImagePixels(), native).draw('/images/final.JPG', { maxWidth: 64, stretch: false })
    expect(drawn).toMatchObject({ mime: 'image/jpeg', width: 64 })
    await expect(new NodeTilePictures(new NodeImagePixels()).draw('/images/final.jpg', { maxWidth: 64, stretch: false })).rejects.toThrow('JPEG images are drawn by the desktop app only.')
    await expect(new NodeTilePictures(new NodeImagePixels()).draw('/images/final.tif', { maxWidth: 64, stretch: false })).rejects.toThrow('TIFF images are drawn by the desktop app only.')
  })
})
