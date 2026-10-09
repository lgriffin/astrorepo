import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryGalleryCatalogue, InMemoryPaletteStore } from '@astro/testkit'
import { galleryContract } from '@astro/testkit/contracts/gallery.contract'
import { SqliteGalleryCatalogue, SqlitePaletteStore } from '../../src/main/adapters/sqlite-gallery'
import { seedFitsFile, seedFitsScan, seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

galleryContract('in-memory', async seed => {
  const catalogue = new InMemoryGalleryCatalogue()
  const masterPath = (name: string) => `/data/${name}`
  const finishedPath = (targetId: string, name: string) => `/images/${targetId}/${name}`
  for (const f of seed.files) {
    catalogue.files.set(f.id, { path: masterPath(f.name), name: f.name })
    if (f.kind === 'master') {
      catalogue.images.set(f.targetId, [
        ...(catalogue.images.get(f.targetId) ?? []),
        { path: masterPath(f.name), name: f.name, kind: 'master', filter: f.filter, colour: f.colour, modifiedAt: new Date(f.modifiedAt) }
      ])
    } else {
      const list = catalogue.integration.get(f.targetId) ?? []
      const same = list.find(i => i.filter === f.filter && i.colour === f.colour)
      if (same) same.seconds += f.exposureSec
      else list.push({ filter: f.filter, colour: f.colour, seconds: f.exposureSec })
      catalogue.integration.set(f.targetId, list)
    }
  }
  for (const f of seed.finished) {
    catalogue.images.set(f.targetId, [
      ...(catalogue.images.get(f.targetId) ?? []),
      { path: finishedPath(f.targetId, f.name), name: f.name, kind: 'finished', filter: null, colour: null, modifiedAt: new Date(f.modifiedAt) }
    ])
  }
  catalogue.objects = seed.objects
    .filter(o => o.catalogue !== 'C')
    .map(o => ({ designation: o.designation, name: o.name !== o.designation ? o.name : null, raDeg: o.raHours * 15, decDeg: o.decDeg, sizeArcmin: o.sizeArcmin }))
  return { catalogue, palettes: new InMemoryPaletteStore(), masterPath, finishedPath }
})

const dirs: string[] = []
afterEach(() => {
  teardownTestDb()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-gallery-'))
  dirs.push(root)
  return root
}

galleryContract('SQLite', async seed => {
  const db = setupTestDb()
  const root = tempRoot()
  const scan = seedFitsScan(db)
  const masterPath = (name: string) => path.join(root, 'fits', name)
  const finishedPath = (targetId: string, name: string) => path.join(root, 'images', targetId, name)
  fs.mkdirSync(path.join(root, 'fits'))
  const header = db.prepare('INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES (?, ?, ?, ?, NULL, ?)')
  for (const targetId of new Set([...seed.files.map(f => f.targetId), ...seed.finished.map(f => f.targetId)])) seedTarget(db, { id: targetId, canonicalName: targetId.toUpperCase() })
  for (const f of seed.files) {
    fs.writeFileSync(masterPath(f.name), 'pixels')
    seedFitsFile(db, scan, {
      id: f.id,
      fileName: f.name,
      filePath: masterPath(f.name),
      targetId: f.targetId,
      filter: f.filter,
      exposureSec: f.exposureSec,
      imageType: 'Light',
      isStacked: f.kind === 'master',
      ncombine: f.kind === 'master' ? 20 : null
    })
    db.prepare('UPDATE fits_files SET file_modified_at = ? WHERE id = ?').run(f.modifiedAt, f.id)
    if (f.kind === 'light' && f.colour) header.run(`${f.id}-bayer`, f.id, 'BAYERPAT', "'RGGB'", 1)
    if (f.kind === 'master') header.run(`${f.id}-naxis`, f.id, f.colour ? 'NAXIS3' : 'NAXIS', f.colour ? '3' : '2', 1)
  }
  for (const f of seed.finished) {
    const file = finishedPath(f.targetId, f.name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'pixels')
    const t = new Date(f.modifiedAt)
    fs.utimesSync(file, t, t)
    db.prepare('INSERT OR REPLACE INTO target_home_data (target_id, images_path, scanned_at) VALUES (?, ?, ?)').run(f.targetId, path.join(root, 'images', f.targetId), new Date().toISOString())
  }
  const now = new Date().toISOString()
  for (const abbr of ['M', 'NGC', 'IC', 'C']) db.prepare('INSERT INTO catalogues (id, name, abbreviation, created_at) VALUES (?, ?, ?, ?)').run(`cat-${abbr}`, `Catalogue ${abbr}`, abbr, now)
  for (const o of seed.objects) {
    seedTarget(db, { id: `t-${o.designation}`, canonicalName: o.name, raHours: o.raHours, decDegrees: o.decDeg })
    db.prepare('UPDATE targets SET angular_size_arcmin = ? WHERE id = ?').run(o.sizeArcmin, `t-${o.designation}`)
    db.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run(`e-${o.designation}`, `cat-${o.catalogue}`, `t-${o.designation}`, o.designation)
  }
  return { catalogue: new SqliteGalleryCatalogue(db), palettes: new SqlitePaletteStore(db), masterPath, finishedPath }
})

describe('SqliteGalleryCatalogue', () => {
  it('[INS-007] Given a master gone from disk and files the inspector cannot read, When listed, Then neither is offered', async () => {
    const db = setupTestDb()
    const root = tempRoot()
    const scan = seedFitsScan(db)
    seedTarget(db, { id: 'm1' })
    seedFitsFile(db, scan, { id: 'gone', filePath: path.join(root, 'gone.fit'), targetId: 'm1', isStacked: true, ncombine: 9, imageType: 'Light' })
    const images = path.join(root, 'images')
    fs.mkdirSync(path.join(images, 'v1', 'deeper'), { recursive: true })
    fs.writeFileSync(path.join(images, 'final.jpg'), 'x')
    fs.writeFileSync(path.join(images, 'v1', 'final.tif'), 'x')
    fs.writeFileSync(path.join(images, 'v1', 'final.png'), 'x')
    fs.writeFileSync(path.join(images, 'v1', 'deeper', 'old.png'), 'x')
    db.prepare('INSERT INTO target_home_data (target_id, images_path, scanned_at) VALUES (?, ?, ?)').run('m1', images, new Date().toISOString())
    expect((await new SqliteGalleryCatalogue(db).targetImages('m1')).map(i => i.name)).toEqual(['final.png'])
  })

  it('[INS-007] Given an images folder that is gone, When listed, Then the target simply has no finished images', async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 'm1' })
    db.prepare('INSERT INTO target_home_data (target_id, images_path, scanned_at) VALUES (?, ?, ?)').run('m1', '/no/such/folder', new Date().toISOString())
    expect(await new SqliteGalleryCatalogue(db).targetImages('m1')).toEqual([])
  })

  it('[INS-006] Given a palette name this version does not know, When read, Then there is no choice', async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 'm1' })
    db.prepare("INSERT INTO target_palettes (target_id, palette, chosen_at) VALUES ('m1', 'XYZ', '2026-01-01')").run()
    expect(await new SqlitePaletteStore(db).chosen('m1')).toBeNull()
  })
})
