import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { OBJECT_KINDS, CATALOGUE_KINDS, nameClashes, nameKey, separationDeg, type SeedCatalogue } from '@astro/domain'
import { buildCatalogues } from '../../scripts/catalogues/build-seed'
import { normalizeCatalogName } from '../../src/main/services/fits-linker'
import { MINE } from '../../src/main/services/target'
import { YOURS } from '../../src/main/adapters/shared/sql'

const DIR = path.join(__dirname, '../../data/catalogues')
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()
const shipped = files.map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as { catalogue: SeedCatalogue & { version: string; source: string }; objects: SeedCatalogue['objects'] })
const catalogues: SeedCatalogue[] = shipped.map(s => ({ ...s.catalogue, objects: s.objects }))
const byDesignation = new Map(catalogues.flatMap(c => c.objects).map(o => [o.designation, o]))
const of = (designation: string) => byDesignation.get(designation)!
const apart = (a: string, b: string) => separationDeg(of(a).ra!, of(a).dec!, of(b).ra!, of(b).dec!)

describe('Shipped catalogues', () => {
  it('[CAT-002] Given the shipped catalogues, When every name and alias is checked, Then none points at objects a degree or more apart', () => {
    expect(nameClashes(catalogues)).toEqual([])
  })

  it('[CAT-001] Given the shipped catalogues, When they are counted, Then Messier and Caldwell are whole and every object has a place, a constellation and a type the app knows', () => {
    const count = Object.fromEntries(catalogues.map(c => [c.abbreviation, c.objects.length]))
    expect(count).toEqual({ C: 109, IC: 200, M: 110, NGC: 500, Sh2: 30 })
    for (const c of catalogues) expect(c.totalObjects).toBeGreaterThanOrEqual(c.objects.length)
    expect(catalogues.find(c => c.abbreviation === 'M')!.objects.map(o => o.designation)).toEqual(Array.from({ length: 110 }, (_, i) => `M${i + 1}`))
    expect(catalogues.find(c => c.abbreviation === 'C')!.objects.map(o => o.designation)).toEqual(Array.from({ length: 109 }, (_, i) => `C${i + 1}`))
    const kinds = new Set<string>([...OBJECT_KINDS, ...CATALOGUE_KINDS])
    for (const o of catalogues.flatMap(c => c.objects)) {
      expect(o.ra, o.designation).toBeGreaterThanOrEqual(0)
      expect(o.ra!, o.designation).toBeLessThan(24)
      expect(Math.abs(o.dec!), o.designation).toBeLessThanOrEqual(90)
      expect(o.constellation, o.designation).toMatch(/^[A-Z]/)
      expect(kinds.has(o.type), `${o.designation} ${o.type}`).toBe(true)
    }
  })

  it('[CAT-001] Given the shipped catalogues, When each says where it came from, Then all name one source and one version', () => {
    expect(new Set(shipped.map(s => s.catalogue.source)).size).toBe(1)
    expect(shipped[0].catalogue.source).toMatch(/Stellarium/)
    expect(new Set(shipped.map(s => s.catalogue.version)).size).toBe(1)
  })

  it('[CAT-001] Given the objects the old catalogues got wrong, When they are looked up, Then each sits where its other numbers do and carries only its own names', () => {
    expect(of('M33').aliases).not.toContain('Pinwheel Galaxy')
    expect(of('M101').name).toBe('Pinwheel Galaxy')
    expect(of('M101').aliases).toContain('NGC 5457')
    expect(apart('M38', 'NGC 1912')).toBeLessThan(0.1)
    expect(apart('M109', 'NGC 3992')).toBeLessThan(0.1)
    for (const [c, ngc] of [['C4', 'NGC 7023'], ['C5', 'IC 342'], ['C23', 'NGC 891'], ['C68', 'NGC 6729'], ['C72', 'NGC 55']]) {
      expect(of(c).aliases, c).toContain(ngc)
    }
    expect(of('C7').aliases).toContain('NGC 2403')
    expect(of('C31').aliases).toContain('IC 405')
    expect(of('IC 1805').aliases).not.toContain('C31')
    expect(of('NGC 1499').aliases).not.toContain('C31')
    expect(of('C83').aliases).toEqual(expect.arrayContaining(['NGC 4945']))
    expect(of('NGC 5236').aliases).not.toContain('C83')
    const holders = (name: string) => catalogues.flatMap(c => c.objects).filter(o => [o.name, ...o.aliases].map(nameKey).includes(nameKey(name))).map(o => o.designation)
    expect(holders('Spindle Galaxy').sort()).toEqual(['M102', 'NGC 5866'])
    expect(holders('Hamburger Galaxy')).toEqual(['NGC 3628'])
  })
})

describe('Building the catalogues', () => {
  // Rows of Stellarium's catalog.txt: id, RA°, Dec°, B, V, type, morphology, major axis, then the cross-index from column 17.
  const row = (id: number, ra: number, dec: number, v: number, type: string, ids: Partial<Record<'NGC' | 'IC' | 'M' | 'C' | 'Sh2', number>>) => {
    const c = Array.from({ length: 45 }, () => '0')
    Object.assign(c, { 0: String(id), 1: String(ra), 2: String(dec), 3: '99', 4: String(v), 5: type, 6: type === 'G' ? 'Sb' : '', 7: '10' })
    if (ids.NGC) c[16] = String(ids.NGC)
    if (ids.IC) c[17] = String(ids.IC)
    if (ids.M) c[18] = String(ids.M)
    if (ids.C) c[19] = String(ids.C)
    if (ids.Sh2) c[21] = String(ids.Sh2)
    return c.join('\t')
  }
  const name = (prefix: string, id: number, text: string, sources = '') => `${prefix.padEnd(5)}${String(id).padEnd(15)}_("${text}")${sources ? ` # ${sources}` : ''}`
  const messier = Array.from({ length: 110 }, (_, i) => row(1000 + i, (i * 3) % 360, -60 + i, 8, 'G', { M: i + 1, NGC: 1000 + i }))
  const caldwell = Array.from({ length: 109 }, (_, i) => row(2000 + i, (i * 3 + 1) % 360, -50 + i / 2, 9, 'OC', { C: i + 1, IC: 2000 + i }))
  const sharpless = [1, 9, 25, 30, 45, 49, 86, 101, 106, 112, 115, 119, 129, 132, 142, 155, 157, 171, 188, 190, 199, 216, 235, 240, 244, 261, 273, 275, 276, 281]
    .map((n, i) => row(3000 + i, (i * 7 + 2) % 360, 10, 99, 'HII', { Sh2: n }))
  const catalog = [...messier, ...caldwell, ...sharpless].join('\n')

  it('[CAT-002] Given a name Stellarium gives to objects far apart, When the catalogues are built, Then only the one most sources call it keeps it', () => {
    const names = [name('NGC', 1032, 'Pinwheel Galaxy', 'A, B'), name('NGC', 1100, 'Pinwheel Galaxy', 'A, B, C'), name('NGC', 1050, 'Twin', 'A'), name('NGC', 1080, 'Twin', 'B')].join('\n')
    const built = buildCatalogues(catalog, names, new Map())
    expect(built.messier[100].name).toBe('M101')
    expect(built.messier[100].aliases).toContain('Pinwheel Galaxy')
    expect(built.messier[32].aliases).not.toContain('Pinwheel Galaxy')
    // A tie between objects far apart goes to neither.
    expect(built.messier.filter(o => o.aliases.includes('Twin'))).toEqual([])
    expect(nameClashes([{ name: 'M', abbreviation: 'M', description: '', totalObjects: 110, objects: built.messier }])).toEqual([])
  })

  it('[CAT-001] Given names the catalogues shipped before, When the catalogues are built, Then each stays unless Stellarium gives it to another object, and numbers come only from Stellarium', () => {
    const shippedNames = new Map([['M31', ['Andromeda Galaxy', 'NGC 4000']], ['M33', ['Ptolemy Galaxy']], ['M34', ['Pinwheel Galaxy']]])
    const built = buildCatalogues(catalog, [name('M', 31, 'Andromeda Galaxy', 'WK'), name('NGC', 1100, 'Pinwheel Galaxy', 'A')].join('\n'), shippedNames)
    expect(built.messier[30].name).toBe('Andromeda Galaxy')
    expect(built.messier[30].aliases).toEqual(['NGC 1030'])
    // A name only the old catalogues knew stays; one Stellarium gives elsewhere goes there.
    expect(built.messier[32].name).toBe('Ptolemy Galaxy')
    expect(built.messier[33].name).toBe('M34')
    expect(built.messier[100].aliases).toContain('Pinwheel Galaxy')
  })

  it('[CAT-001] Given Stellarium\'s rows, When the catalogues are built, Then positions are hours and degrees, the constellation is worked out and galaxies get their kind', () => {
    const m1 = buildCatalogues(catalog, '', new Map()).messier[0]
    expect(m1).toMatchObject({ designation: 'M1', ra: 0, dec: -60, mag: 8, type: 'spiral_galaxy', constellation: 'Tucana', aliases: ['NGC 1000'] })
    const sh = buildCatalogues(catalog, '', new Map()).sharpless[0]
    expect(sh.type).toBe('emission_nebula')
  })
})

describe('Names in FITS headers', () => {
  it('[CAT-007] Given a designation spelled out, When frames are matched to targets, Then it matches the catalogues\' spelling', () => {
    expect(normalizeCatalogName('Caldwell 14')).toBe(normalizeCatalogName('C14'))
    expect(normalizeCatalogName('Messier 31')).toBe(normalizeCatalogName('M 31'))
    expect(normalizeCatalogName('NGC0224')).toBe(normalizeCatalogName('NGC 224'))
    expect(normalizeCatalogName('ngc 7000')).toBe('NGC7000')
    expect(normalizeCatalogName('Andromeda Galaxy')).toBe('ANDROMEDA GALAXY')
  })

  it('[CAT-005] Given the rule for a target being yours, When the repair and the target list read it, Then it is the same rule', () => {
    expect(YOURS).toBe(MINE)
  })
})
