/**
 * Builds the built-in catalogues in data/catalogues from Stellarium's deep-sky catalogue
 * (specs/047-catalogue-names, CAT-001 to CAT-004).
 *
 *   npx tsx scripts/catalogues/build-seed.ts            fetch Stellarium's files at the pinned commit
 *   npx tsx scripts/catalogues/build-seed.ts <folder>   read catalog.txt and names.dat from a folder
 *
 * Each Stellarium row is an object: its position, magnitudes, type and size, and the M, NGC, IC,
 * Caldwell and Sharpless numbers it carries. Rows close together that share a name, or that the old
 * catalogues listed as one, are one object, but never two numbers of the same catalogue and never
 * rows a degree or more apart. A common name goes to one object only: the one most of Stellarium's
 * sources call it (well-known names first), then a Messier object, then the one the old catalogues
 * gave it to; a tie between objects far apart drops the name. So no name or alias in the built-in
 * catalogues points at two places in the sky, which tests/unit/catalogue-seed.test.ts checks.
 *
 * Which objects each catalogue lists: all 110 Messier and 109 Caldwell objects; the Sharpless regions
 * listed before (SHARPLESS below); and for NGC and IC, every object Stellarium names, then the
 * brightest, up to 500 NGC and 200 IC objects, leaving out stars and types the app does not know.
 * The old catalogues' common names are read from data/catalogues before it is rewritten and kept
 * unless Stellarium gives them to another object, and an object's old main name stays its main
 * name, so targets on existing installs keep their names. Run it twice and nothing changes.
 */
import fs from 'fs'
import path from 'path'
import { Constellation } from 'astronomy-engine'

const STELLARIUM_COMMIT = '2716f1240a106e20a29ca25fd7035c265ba7271a'
const STELLARIUM = `https://raw.githubusercontent.com/Stellarium/stellarium/${STELLARIUM_COMMIT}/nebulae/default`
/** Bumped whenever the catalogues change, so existing installs repair themselves once (CAT-006). */
export const SEED_VERSION = '2026-11-07'
const SOURCE = `Stellarium deep-sky catalogue (nebulae/default, commit ${STELLARIUM_COMMIT.slice(0, 10)}), GPL-2.0-or-later`

const OUT = path.join(process.cwd(), 'data', 'catalogues')
/** Objects whose names point a degree or more apart are different objects (CAT-002). */


/** The Sharpless regions the app has listed since spec 001. */
const SHARPLESS = [1, 9, 25, 30, 45, 49, 86, 101, 106, 112, 115, 119, 129, 132, 142, 155, 157, 171, 188, 190, 199, 216, 235, 240, 244, 261, 273, 275, 276, 281]

/** Stellarium's cross-index columns (0-based) and the prefix names.dat writes for each. */
const COLUMNS: Array<[number, string]> = [
  [16, 'NGC'], [17, 'IC'], [18, 'M'], [19, 'C'], [20, 'B'], [21, 'SH2'], [22, 'VDB'], [23, 'RCW'], [24, 'LDN'], [25, 'LBN'],
  [26, 'CR'], [27, 'MEL'], [28, 'PGC'], [29, 'UGC'], [30, 'CED'], [31, 'ARP'], [32, 'VV'], [33, 'PK'], [34, 'PNG'], [35, 'SNRG'],
  [36, 'ACO'], [37, 'HCG'], [38, 'ESO'], [39, 'VDBH'], [40, 'DWB'], [41, 'TR'], [42, 'ST'], [43, 'RU'], [44, 'VDBHA']
]

/** How the app's catalogues write a designation. */
const WRITE: Record<string, (n: string) => string> = {
  M: n => `M${n}`,
  NGC: n => `NGC ${n}`,
  IC: n => `IC ${n}`,
  C: n => `C${n}`,
  SH2: n => `Sh2-${n}`
}

/** Stellarium's object types as the app's (src/shared/types.ts ObjectType); others are left out. */
const TYPES: Record<string, string> = {
  G: 'galaxy', GX: 'galaxy', AGX: 'galaxy', IG: 'galaxy', IG2: 'galaxy', IG3: 'galaxy', RG: 'galaxy', PoG: 'galaxy',
  GC: 'globular_cluster', OC: 'open_cluster', OPC: 'open_cluster', CL: 'star_cluster', SA: 'star_cluster', SC: 'star_cluster',
  'C+N': 'emission_nebula', HII: 'emission_nebula', EN: 'emission_nebula', HA: 'emission_nebula', NB: 'emission_nebula',
  GNE: 'emission_nebula', BN: 'emission_nebula', ISM: 'emission_nebula',
  RN: 'reflection_nebula', RNE: 'reflection_nebula', PN: 'planetary_nebula', 'PN?': 'planetary_nebula', PPN: 'planetary_nebula',
  DN: 'dark_nebula', DNE: 'dark_nebula', MOC: 'molecular_cloud', SNR: 'supernova_remnant', 'SR?': 'supernova_remnant',
  CLG: 'galaxy_cluster', GXCL: 'galaxy_cluster', '*': 'star', '**': 'star'
}

interface Row {
  ra: number
  dec: number
  mag: number | null
  type: string
  /** Stellarium's own type, as written in catalog.txt. */
  raw: string
  /** A galaxy's Hubble type ("SB(s)m", "E5", "IBm"); other objects' class. */
  morphology: string
  size: number | null
  ids: string[]
}

/** A name given to a row: by Stellarium (scored by its sources), by the catalogues shipped before, or both. */
interface Claim { row: Row; score: number; before: boolean; stellarium: boolean; name?: string }

export interface SeedObject {
  designation: string
  name: string
  type: string
  ra: number
  dec: number
  mag: number | null
  size: number | null
  constellation: string
  aliases: string[]
}

function num(text: string | undefined): number | null {
  const n = Number((text ?? '').trim())
  return Number.isFinite(n) && n !== 99 && n !== 0 ? n : null
}

function readRows(catalog: string): Row[] {
  const rows: Row[] = []
  for (const line of catalog.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue
    const c = line.split('\t')
    const ids: string[] = []
    for (const [col, prefix] of COLUMNS) {
      const id = (c[col] ?? '').trim()
      if (id && id !== '0') ids.push(`${prefix} ${id}`)
    }
    const v = num(c[4])
    rows.push({
      ra: Number(c[1]) / 15,
      dec: Number(c[2]),
      mag: v ?? num(c[3]),
      type: TYPES[c[5].trim().toUpperCase()] ?? TYPES[c[5].trim()] ?? '',
      raw: c[5].trim(),
      morphology: (c[6] ?? '').trim(),
      size: num(c[7]),
      ids
    })
  }
  return rows
}

function separation(a: { ra: number; dec: number }, b: { ra: number; dec: number }): number {
  const rad = Math.PI / 180
  const cos = Math.sin(a.dec * rad) * Math.sin(b.dec * rad) + Math.cos(a.dec * rad) * Math.cos(b.dec * rad) * Math.cos((a.ra - b.ra) * 15 * rad)
  return Math.acos(Math.max(-1, Math.min(1, cos))) / rad
}

/** "NGC 224", "M31", "C14", "Sh2-155" as Stellarium's ids ("NGC 224", "M 31", "C 14", "SH2 155"). */
function idOf(designation: string): string {
  const m = /^(M|NGC|IC|C|Sh2-)\s*(\d+)$/.exec(designation)
  return m ? `${m[1] === 'Sh2-' ? 'SH2' : m[1]} ${m[2]}` : ''
}

/** A catalogue number rather than a common name; numbers come from Stellarium's cross-index only. */
function isDesignation(name: string): boolean {
  return /^(M|Messier|NGC|IC|C|Caldwell|Sh2|Sh 2|Sharpless)[\s-]*\d+$/i.test(name)
}

const OBJECT_TYPES = new Set(Object.values(TYPES))

/**
 * A galaxy's kind from its Hubble type, as the learning primers know them: spiral (S, SA, SB, SAB but
 * not the lenticular S0), elliptical (E, cD) or irregular (I, Irr, IB, dIrr); otherwise just a galaxy.
 */
function galaxyKind(morphology: string): string {
  const m = morphology.replace(/^\(?[RrdP']*\)?\s*/, '')
  if (/^(E|cD)/.test(m)) return 'elliptical_galaxy'
  if (/^(I|dI)/.test(m)) return 'irregular_galaxy'
  if (/^S(A|B|AB)?0/.test(m)) return 'galaxy'
  if (/^S/.test(m)) return 'spiral_galaxy'
  return 'galaxy'
}

/**
 * The app's type: Stellarium's, except that a cluster in nebulosity (C+N, such as the Pleiades) keeps
 * the type shipped before, and a Sharpless region is an emission nebula unless Stellarium calls it a
 * remnant, planetary or reflection nebula (its number can sit on the row of the cluster inside it).
 */
function typeOf(prefix: string, row: Row, before: string | undefined): string {
  if (prefix === 'SH2' && !['supernova_remnant', 'planetary_nebula', 'reflection_nebula'].includes(row.type)) return 'emission_nebula'
  if (row.raw === 'C+N' && before && OBJECT_TYPES.has(before)) return before
  if (row.type === 'galaxy') return galaxyKind(row.morphology)
  return row.type || 'unknown'
}

function round(n: number | null, places: number): number | null {
  return n === null ? null : Number(n.toFixed(places))
}

/** The catalogues the app lists, as Stellarium's id prefixes. */
const LISTED = ['M', 'NGC', 'IC', 'C', 'SH2']

export function buildCatalogues(
  catalog: string,
  namesDat: string,
  shipped: Map<string, string[]>,
  shippedTypes: Map<string, string> = new Map()
): Record<string, SeedObject[]> {
  const rows = readRows(catalog)
  const order = new Map(rows.map((row, i) => [row, i]))

  // Each designation's row: where a number is on two rows (C14 on NGC 869 and NGC 884), the brighter.
  const rowOf = new Map<string, Row>()
  for (const row of rows) {
    for (const id of row.ids) {
      const held = rowOf.get(id)
      if (!held || (row.mag ?? 99) < (held.mag ?? 99)) rowOf.set(id, row)
    }
  }
  const listedIds = (row: Row): string[] => row.ids.filter(id => LISTED.includes(id.split(' ')[0]) && rowOf.get(id) === row)

  // Every name each row is given: Stellarium's, scored by how many sources use it (well-known first),
  // and the common names the catalogues shipped before, which Stellarium may not list ("Ptolemy Cluster").
  const claims = new Map<string, Claim[]>()
  const claim = (name: string, row: Row, score: number, before: boolean): void => {
    const list = claims.get(name) ?? []
    const same = list.find(c => c.row === row)
    if (same) {
      same.score = Math.max(same.score, score)
      same.before ||= before
      same.stellarium ||= !before
    } else list.push({ row, score, before, stellarium: !before })
    claims.set(name, list)
  }
  for (const line of namesDat.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue
    const id = `${line.slice(0, 5).trim()} ${line.slice(5, 20).trim()}`
    const name = /_\("(.*?)"\)/.exec(line)?.[1]
    const row = rowOf.get(id)
    if (!name || !row) continue
    const sources = (line.split('#')[1] ?? '').split(',').map(s => s.trim()).filter(Boolean)
    claim(name, row, sources.length + (sources.some(s => s.startsWith('WK')) ? 100 : 0), false)
  }
  for (const [designation, names] of shipped) {
    const row = rowOf.get(idOf(designation))
    for (const name of names) if (row && !isDesignation(name)) claim(name, row, 0.5, true)
  }

  // Rows that are one object: the same number on both (M31 is NGC 224), and rows close together that
  // were shipped as one or share a name (M8 and NGC 6523, the Lagoon). Never two numbers of the same
  // catalogue in one object, since a target has one entry in each, and never rows a degree or more apart.
  const group = new Map<Row, Row[]>(rows.map(row => [row, [row]]))
  const join = (a: Row, b: Row): void => {
    const ga = group.get(a)!
    const gb = group.get(b)!
    if (ga === gb) return
    const both = [...ga, ...gb]
    const prefixes = both.flatMap(listedIds).map(id => id.split(' ')[0])
    if (new Set(prefixes).size !== prefixes.length) return
    if (ga.some(x => gb.some(y => separation(x, y) >= 1))) return
    for (const row of both) group.set(row, both)
  }
  for (const [designation, names] of shipped) {
    const row = rowOf.get(idOf(designation))
    for (const other of names.filter(isDesignation).map(n => rowOf.get(idOf(n)))) if (row && other) join(row, other)
  }
  for (const [, list] of [...claims].sort((a, b) => Math.max(...b[1].map(c => c.score)) - Math.max(...a[1].map(c => c.score)))) {
    const real = list.filter(c => c.stellarium)
    for (const c of real.slice(1)) join(real[0].row, c.row)
  }

  // Each name to one object only (CAT-002): the one most sources call it, then a Messier object, then
  // the one it was shipped on, then (only when all are within a degree) the first; a name left tied
  // between objects far apart goes to none.
  const namesOf = new Map<Row[], Claim[]>()
  const hasM = (g: Row[]): number => (g.flatMap(listedIds).some(id => id.startsWith('M ')) ? 1 : 0)
  const first = (g: Row[]): number => Math.min(...g.map(r => order.get(r)!))
  for (const [name, list] of claims) {
    const byGroup = new Map<Row[], Claim>()
    for (const c of list) {
      const g = group.get(c.row)!
      const held = byGroup.get(g)
      byGroup.set(g, held ? { ...held, score: Math.max(held.score, c.score), before: held.before || c.before, stellarium: held.stellarium || c.stellarium } : c)
    }
    // A name shipped on an object that Stellarium also gives it stays there (the Seagull is IC 2177's).
    const kept = (c: Claim): number => Number(c.before && c.stellarium)
    const best = [...byGroup].sort(([ga, a], [gb, b]) =>
      kept(b) - kept(a) || b.score - a.score || hasM(gb) - hasM(ga) || Number(b.before) - Number(a.before) || first(ga) - first(gb))
    const [[owner, top], next] = best
    const tied = next && kept(top) === kept(next[1]) && top.score === next[1].score && hasM(owner) === hasM(next[0]) && top.before === next[1].before
    if (tied && best.some(([g]) => g.some(r => owner.some(o => separation(r, o) >= 1)))) continue
    namesOf.set(owner, [...(namesOf.get(owner) ?? []), { ...top, name }])
  }

  const write = (id: string): string => WRITE[id.split(' ')[0]](id.split(' ')[1])

  const objectFor = (prefix: string, n: string): SeedObject => {
    const id = `${prefix} ${n}`
    const row = rowOf.get(id)
    if (!row) throw new Error(`${id} is not in Stellarium's catalogue`)
    const g = group.get(row)!
    const designation = write(id)
    const common = (namesOf.get(g) ?? []).sort((a, b) => b.score - a.score).map(c => c.name!)
    const before = shipped.get(designation)?.[0]
    const name = before && common.includes(before) ? before : designation
    const aliases = [...g.flatMap(listedIds).map(write), ...common].filter(a => a !== name && a !== designation)
    return {
      designation,
      name,
      type: typeOf(prefix, row, shippedTypes.get(designation)),
      ra: round(row.ra, 4)!,
      dec: round(row.dec, 4)!,
      mag: round(row.mag, 1),
      size: round(row.size, 1),
      constellation: Constellation(row.ra, row.dec).name,
      aliases: [...new Set(aliases)]
    }
  }

  const pick = (prefix: string, cap: number): string[] => {
    const brightest = (a: { row: Row }, b: { row: Row }): number => (a.row.mag ?? 99) - (b.row.mag ?? 99)
    const deepSky = [...rowOf]
      .filter(([id, row]) => id.startsWith(`${prefix} `) && /^\d+$/.test(id.split(' ')[1]) && listedIds(row).includes(id))
      .map(([id, row]) => ({ n: Number(id.split(' ')[1]), row }))
      .filter(({ row }) => row.type && row.type !== 'star')
    const named = deepSky.filter(o => namesOf.has(group.get(o.row)!)).sort(brightest)
    const bright = deepSky.filter(o => !namesOf.has(group.get(o.row)!) && o.row.mag !== null).sort(brightest)
    return [...named, ...bright].slice(0, cap).map(o => o.n).sort((a, b) => a - b).map(String)
  }

  return {
    messier: Array.from({ length: 110 }, (_, i) => objectFor('M', String(i + 1))),
    caldwell: Array.from({ length: 109 }, (_, i) => objectFor('C', String(i + 1))),
    sharpless: SHARPLESS.map(n => objectFor('SH2', String(n))),
    ngc: pick('NGC', 500).map(n => objectFor('NGC', n)),
    ic: pick('IC', 200).map(n => objectFor('IC', n))
  }
}

const HEADERS: Record<string, { name: string; abbreviation: string; description: string; totalObjects: number }> = {
  messier: { name: 'Messier', abbreviation: 'M', description: "Charles Messier's catalogue of 110 deep-sky objects, compiled 1771-1966", totalObjects: 110 },
  caldwell: { name: 'Caldwell', abbreviation: 'C', description: "Sir Patrick Caldwell-Moore's catalogue of 109 deep-sky objects not in the Messier catalogue", totalObjects: 109 },
  sharpless: { name: 'Sharpless', abbreviation: 'Sh2', description: 'Stewart Sharpless catalogue of 313 HII regions in the Milky Way', totalObjects: 313 },
  ngc: {
    name: 'NGC',
    abbreviation: 'NGC',
    description: 'New General Catalogue of Nebulae and Clusters of Stars, compiled by J.L.E. Dreyer in 1888. Selection: every named object, then the brightest.',
    totalObjects: 500
  },
  ic: {
    name: 'IC',
    abbreviation: 'IC',
    description: 'Index Catalogue of Nebulae and Clusters of Stars, two supplements to the NGC compiled by J.L.E. Dreyer in 1895 and 1908. Selection: every named object, then the brightest.',
    totalObjects: 200
  }
}

function write(file: string, objects: SeedObject[]): void {
  const header = { ...HEADERS[file], version: SEED_VERSION, source: SOURCE }
  const body = objects.map(o => `    ${JSON.stringify(o)}`).join(',\n')
  fs.writeFileSync(path.join(OUT, `${file}.json`), `{\n  "catalogue": ${JSON.stringify(header, null, 2).replace(/\n/g, '\n  ')},\n  "objects": [\n${body}\n  ]\n}\n`)
}

async function read(folder: string | undefined, file: string): Promise<string> {
  if (folder) return fs.readFileSync(path.join(folder, file), 'utf-8')
  const res = await fetch(`${STELLARIUM}/${file}`)
  if (!res.ok) throw new Error(`${file}: ${res.status}`)
  return res.text()
}

async function main(): Promise<void> {
  const folder = process.argv[2]
  // The names and types shipped before: the object's main name first, then its other common names.
  const shipped = new Map<string, string[]>()
  const shippedTypes = new Map<string, string>()
  for (const file of Object.keys(HEADERS)) {
    const at = path.join(OUT, `${file}.json`)
    if (!fs.existsSync(at)) continue
    for (const o of (JSON.parse(fs.readFileSync(at, 'utf-8')) as { objects: SeedObject[] }).objects) {
      shipped.set(o.designation, [o.name, ...o.aliases])
      shippedTypes.set(o.designation, o.type)
    }
  }
  const built = buildCatalogues(await read(folder, 'catalog.txt'), await read(folder, 'names.dat'), shipped, shippedTypes)
  for (const [file, objects] of Object.entries(built)) {
    write(file, objects)
    console.log(`${file}: ${objects.length} objects`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) void main()
