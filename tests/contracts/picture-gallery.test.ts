import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryObjectCatalogue, InMemoryPictureFolder, objectFacts } from '@astro/testkit'
import { objectCatalogueContract, pictureFolderContract } from '@astro/testkit/contracts/picture-gallery.contract'
import { MAX_FOLDER_DEPTH, MAX_UNSHRUNK_BYTES, NodePictureFolder } from '../../src/main/adapters/node-picture-folder'
import { SqliteObjectCatalogue } from '../../src/main/adapters/sqlite-object-catalogue'
import { seedFitsFile, seedFitsScan, seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

const dirs: string[] = []
afterEach(() => {
  teardownTestDb()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

function tempHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-pictures-'))
  dirs.push(home)
  return home
}

const settings = (values: Record<string, string>) => (key: string) => values[key] ?? null

pictureFolderContract('in-memory', async seed => {
  const folder = new InMemoryPictureFolder()
  folder.rootPath = seed.hasRoot ? '/home/images' : null
  for (const f of seed.files) folder.add(f.relative, { bytes: f.bytes, sizeBytes: f.bytes.length, modifiedAt: f.modifiedAt })
  return { folder, root: folder.rootPath, pathOf: rel => folder.pathOf(rel) }
})

pictureFolderContract('Node', async seed => {
  const home = tempHome()
  const root = path.join(home, 'images')
  const pathOf = (rel: string) => path.join(root, ...rel.split('/'))
  if (seed.hasRoot) fs.mkdirSync(root)
  for (const f of seed.files) {
    fs.mkdirSync(path.dirname(pathOf(f.relative)), { recursive: true })
    fs.writeFileSync(pathOf(f.relative), f.bytes)
    const t = new Date(f.modifiedAt)
    fs.utimesSync(pathOf(f.relative), t, t)
  }
  return { folder: new NodePictureFolder(settings(seed.hasRoot ? { home_folder_path: home } : {})), root: seed.hasRoot ? root : null, pathOf }
})

describe('NodePictureFolder', () => {
  it('[GAL-012] Given a home folder without an images folder, or an images file that is not a folder, When asked, Then there is no root', async () => {
    const home = tempHome()
    expect(await new NodePictureFolder(settings({ home_folder_path: home })).root()).toBeNull()
    fs.writeFileSync(path.join(home, 'images'), 'not a folder')
    expect(await new NodePictureFolder(settings({ home_folder_path: home })).root()).toBeNull()
    expect(await new NodePictureFolder(settings({ home_folder_path: '   ' })).root()).toBeNull()
  })

  it('[GAL-001] Given folders deeper than the limit, When listed, Then pictures below the limit are not counted', async () => {
    const home = tempHome()
    const folders = Array.from({ length: MAX_FOLDER_DEPTH + 1 }, (_, i) => `d${i}`)
    let dir = path.join(home, 'images')
    for (const f of folders) {
      dir = path.join(dir, f)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${f}.png`), 'x')
    }
    const names = (await new NodePictureFolder(settings({ home_folder_path: home })).list()).map(p => p.name).sort()
    expect(names).toEqual(folders.slice(0, MAX_FOLDER_DEPTH).map(f => `${f}.png`).sort())
  })

  it('[GAL-001] Given a link to a folder outside the root, When listed, Then the link is not followed', async () => {
    const home = tempHome()
    const outside = tempHome()
    fs.mkdirSync(path.join(home, 'images'))
    fs.writeFileSync(path.join(outside, 'secret.png'), 'x')
    try {
      fs.symlinkSync(outside, path.join(home, 'images', 'linked'), 'junction')
    } catch {
      return // Links need rights this machine does not give; nothing to check.
    }
    expect(await new NodePictureFolder(settings({ home_folder_path: home })).list()).toEqual([])
  })

  it('[GAL-011] Given an images folder that is a link to another folder, When asked, Then there is no root and nothing is listed', async () => {
    const home = tempHome()
    const outside = tempHome()
    fs.writeFileSync(path.join(outside, 'secret.png'), 'x')
    try {
      fs.symlinkSync(outside, path.join(home, 'images'), 'junction')
    } catch {
      return // Links need rights this machine does not give; nothing to check.
    }
    const folder = new NodePictureFolder(settings({ home_folder_path: home }))
    expect(await folder.root()).toBeNull()
    expect(await folder.list()).toEqual([])
    await expect(folder.read(path.join(home, 'images', 'secret.png'), 400)).rejects.toThrow(/no longer a picture in the images folder/)
  })

  it('[GAL-011] Given a listed picture swapped for a link, a file outside the root, or a folder, When read, Then the read is refused and nothing is shrunk', async () => {
    const home = tempHome()
    const outside = tempHome()
    fs.mkdirSync(path.join(home, 'images', 'M42'), { recursive: true })
    const secret = path.join(outside, 'secret.png')
    fs.writeFileSync(secret, 'x')
    const swapped = path.join(home, 'images', 'M31.png')
    try {
      fs.symlinkSync(secret, swapped)
    } catch {
      return // Links need rights this machine does not give; nothing to check.
    }
    const shrunk: string[] = []
    const folder = new NodePictureFolder(settings({ home_folder_path: home }), async p => {
      shrunk.push(p)
      return { data: 'small', mime: 'image/jpeg', width: null, height: null }
    })
    await expect(folder.read(swapped, 400)).rejects.toThrow(/no longer a picture in the images folder/)
    await expect(folder.read(secret, 400)).rejects.toThrow(/no longer a picture in the images folder/)
    await expect(folder.read(path.join(home, 'images', 'M42'), 400)).rejects.toThrow(/no longer a picture in the images folder/)
    await expect(folder.read(path.join(home, 'images', 'gone.png'), 400)).rejects.toThrow(/no longer there/)
    expect(shrunk).toEqual([])
  })

  it('[GAL-011] Given a picture read after the home folder setting was cleared, When read, Then the read is refused', async () => {
    const home = tempHome()
    fs.mkdirSync(path.join(home, 'images'))
    const file = path.join(home, 'images', 'M31.png')
    fs.writeFileSync(file, 'x')
    const values: Record<string, string> = { home_folder_path: home }
    const folder = new NodePictureFolder(settings(values))
    expect((await folder.read(file, 400)).data).toBe(Buffer.from('x').toString('base64'))
    delete values.home_folder_path
    await expect(folder.read(file, 400)).rejects.toThrow(/no longer a picture in the images folder/)
  })

  it('[NFR-021] Given a shrinker, When a picture is read, Then the shrinker makes it at the width asked', async () => {
    const home = tempHome()
    fs.mkdirSync(path.join(home, 'images'))
    const file = path.join(home, 'images', 'M31.png')
    fs.writeFileSync(file, 'x')
    const asked: [string, number][] = []
    const folder = new NodePictureFolder(settings({ home_folder_path: home }), async (p, w) => {
      asked.push([p, w])
      return { data: 'small', mime: 'image/jpeg', width: 6000, height: 4000 }
    })
    expect(await folder.read(file, 400)).toEqual({ data: 'small', mime: 'image/jpeg', width: 6000, height: 4000 })
    expect(asked).toEqual([[file, 400]])
  })

  it('[NFR-021] Given a picture too large to send unshrunk or not a PNG or JPEG, When read without a shrinker, Then the read fails with a reason', async () => {
    const home = tempHome()
    fs.mkdirSync(path.join(home, 'images'))
    const big = path.join(home, 'images', 'big.png')
    fs.writeFileSync(big, '')
    fs.truncateSync(big, MAX_UNSHRUNK_BYTES + 1)
    const text = path.join(home, 'images', 'notes.txt')
    fs.writeFileSync(text, 'x')
    const folder = new NodePictureFolder(settings({ home_folder_path: home }))
    await expect(folder.read(big, 400)).rejects.toThrow(/too large/)
    await expect(folder.read(text, 400)).rejects.toThrow(/not a PNG or JPEG/)
  })
})

objectCatalogueContract('in-memory', async seed => {
  const catalogue = new InMemoryObjectCatalogue()
  const night = (iso: string) => new Date(new Date(`${iso}Z`).getTime() - 12 * 3600_000).toISOString().slice(0, 10)
  const ranks = ['M', 'NGC', 'IC', 'C', 'Sh2']
  for (const o of seed.objects) {
    const lights = seed.lights.filter(l => l.targetId === o.id)
    const nights = [...new Set(lights.map(l => night(l.dateObs)))].sort()
    const designations = [...o.entries].sort((a, b) => ranks.indexOf(a.catalogue) - ranks.indexOf(b.catalogue)).map(e => e.designation)
    catalogue.add(
      objectFacts(o.id, {
        name: o.name,
        objectType: o.objectType,
        constellation: o.constellation,
        magnitude: o.magnitude,
        sizeArcmin: o.sizeArcmin,
        raHours: o.raHours,
        decDeg: o.decDeg,
        designations,
        aliases: o.aliases.filter(a => !designations.includes(a)),
        collections: o.collections.map(name => ({ id: `c-${name}`, name })),
        stage: o.stage,
        data: {
          lightFrames: lights.length,
          integrationSec: lights.reduce((s, l) => s + l.exposureSec, 0),
          nights: nights.length,
          lastNight: nights[nights.length - 1] ?? null,
          masters: seed.masters.filter(m => m === o.id).length,
          hasMosaicPlan: seed.mosaics.includes(o.id)
        }
      })
    )
  }
  return catalogue
})

objectCatalogueContract('SQLite', async seed => {
  const db = setupTestDb()
  const now = new Date().toISOString()
  for (const abbr of ['M', 'NGC', 'IC', 'C', 'Sh2']) db.prepare('INSERT INTO catalogues (id, name, abbreviation, created_at) VALUES (?, ?, ?, ?)').run(`cat-${abbr}`, `Catalogue ${abbr}`, abbr, now)
  const scan = seedFitsScan(db)
  for (const o of seed.objects) {
    seedTarget(db, { id: o.id, canonicalName: o.name, objectType: o.objectType, constellation: o.constellation, magnitude: o.magnitude, raHours: o.raHours, decDegrees: o.decDeg, workflowStage: o.stage })
    db.prepare('UPDATE targets SET angular_size_arcmin = ? WHERE id = ?').run(o.sizeArcmin, o.id)
    for (const e of o.entries) db.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run(`e-${e.designation}`, `cat-${e.catalogue}`, o.id, e.designation)
    for (const a of o.aliases) db.prepare('INSERT INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, NULL)').run(`a-${a}`, o.id, a)
    for (const c of o.collections) {
      db.prepare('INSERT OR IGNORE INTO collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(`c-${c}`, c, now, now)
      db.prepare('INSERT INTO collection_memberships (collection_id, target_id, added_at) VALUES (?, ?, ?)').run(`c-${c}`, o.id, now)
    }
  }
  seed.lights.forEach((l, i) => seedFitsFile(db, scan, { id: `light-${i}`, targetId: l.targetId, dateObs: l.dateObs, exposureSec: l.exposureSec, imageType: 'Light' }))
  seed.masters.forEach((m, i) => seedFitsFile(db, scan, { id: `master-${i}`, targetId: m, isStacked: true, ncombine: 30, imageType: 'Light', exposureSec: 300 }))
  for (const m of seed.mosaics) db.prepare('INSERT INTO mosaic_plans (target_id, field_width_deg, field_height_deg, rotation_deg, overlap, saved_at) VALUES (?, 1, 1, 0, 0.1, ?)').run(m, now)
  return new SqliteObjectCatalogue(db)
})

describe('SqliteObjectCatalogue', () => {
  it('[GAL-003] Given an alias written as a designation with a space ("M 31"), When named, Then it is a designation, written as the catalogue writes it', async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 't1', canonicalName: 'Andromeda Galaxy' })
    db.prepare("INSERT INTO target_aliases (id, target_id, alias, source) VALUES ('a1', 't1', 'M 31', NULL)").run()
    expect(await new SqliteObjectCatalogue(db).namedObjects()).toEqual([{ id: 't1', designations: ['M31'], names: ['Andromeda Galaxy'] }])
  })

  it('[GAL-006] Given a light frame with no exposure, When the data is read, Then it is not counted, as the frame catalogue leaves it out too', async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 't1' })
    const scan = seedFitsScan(db)
    seedFitsFile(db, scan, { id: 'l1', targetId: 't1', dateObs: '2026-02-10T22:00:00', exposureSec: 60, imageType: 'Light' })
    seedFitsFile(db, scan, { id: 'l2', targetId: 't1', dateObs: '2026-02-11T22:00:00', exposureSec: null, imageType: 'Light' })
    expect((await new SqliteObjectCatalogue(db).objectFacts('t1'))?.data).toMatchObject({ lightFrames: 1, integrationSec: 60, nights: 1, lastNight: '2026-02-10' })
  })

  it('[GAL-005] Given blank type, constellation and description, When read, Then they come back as unknown', async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 't1', objectType: ' ', constellation: '' })
    db.prepare("UPDATE targets SET description = '  ' WHERE id = 't1'").run()
    expect(await new SqliteObjectCatalogue(db).objectFacts('t1')).toMatchObject({ objectType: null, constellation: null, description: null })
  })
})
