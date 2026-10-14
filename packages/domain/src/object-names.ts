/**
 * What an image's name says it shows (spec 031). A finished picture is usually named after its
 * object, "M31.png", "NGC7000_HOO.png", "Andromeda Galaxy final.jpg", or sits in a folder that
 * is. These rules read the catalogue designations and common names out of such a name and match
 * them to the app's catalogue; they also say what an object is and when it is best placed, for
 * the gallery's side panel. Pure rules: listing files and reading the catalogue are adapters' jobs.
 */

/** The catalogues a file name is read for, as the app's seeded catalogues abbreviate them. */
export type CatalogueKey = 'M' | 'NGC' | 'IC' | 'C' | 'Sh2'

export interface Designation {
  catalogue: CatalogueKey
  number: number
  /** As the app's catalogues write it: "M31", "NGC 7000", "IC 434", "C14", "Sh2-155". */
  designation: string
}

/** The highest number each catalogue goes to; a larger one is a date, a count or a gain, not an object. */
export const CATALOGUE_SIZE: Record<CatalogueKey, number> = { M: 110, NGC: 7840, IC: 5386, C: 109, Sh2: 313 }

const WRITE: Record<CatalogueKey, (n: number) => string> = {
  M: n => `M${n}`,
  NGC: n => `NGC ${n}`,
  IC: n => `IC ${n}`,
  C: n => `C${n}`,
  Sh2: n => `Sh2-${n}`
}

/**
 * A catalogue prefix that starts a word (no letter or digit just before it), then the number, with
 * or without a space, underscore, hyphen or dot between and with any leading zeros. Longer
 * spellings come first so "Messier" is not read as "M". The number must not run on into another
 * digit, and Caldwell's bare "C" must not run on into a letter either ("C10s" is no object).
 */
const DESIGNATION = /(?<![A-Za-z0-9])(?:(messier|m)|(ngc)|(ic)|(caldwell|c)|(sh\s*2|sharpless))[\s_.-]*0*([1-9]\d{0,4})(?!\d)/gi

/** Every catalogue designation in a piece of text, in the order written, each once. */
export function designationsIn(text: string): Designation[] {
  const found: Designation[] = []
  for (const m of text.matchAll(DESIGNATION)) {
    const catalogue: CatalogueKey = m[1] ? 'M' : m[2] ? 'NGC' : m[3] ? 'IC' : m[4] ? 'C' : 'Sh2'
    const number = Number(m[6])
    if (number > CATALOGUE_SIZE[catalogue]) continue
    if (catalogue === 'C' && /^[A-Za-z]/.test(text.slice(m.index + m[0].length))) continue
    const designation = WRITE[catalogue](number)
    if (!found.some(d => d.designation === designation)) found.push({ catalogue, number, designation })
  }
  return found
}

/**
 * The designation a name is, when it is nothing but one in any spelling ("NGC 224", "M 31",
 * "Caldwell 23"), as the catalogue writes it; null for a common name or a name with more in it.
 */
export function asDesignation(text: string): string | null {
  const t = text.trim()
  const all = [...t.matchAll(DESIGNATION)]
  if (all.length !== 1 || all[0][0].length !== t.length) return null
  return designationsIn(t)[0]?.designation ?? null
}

/**
 * Words as a name is compared: camel case split ("AndromedaGalaxy"), apostrophes dropped ("Bode's"),
 * everything else that is not a letter or digit a space, lower case.
 */
export function nameWords(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** A file's name without its extension. */
export function fileStem(fileName: string): string {
  return fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '')
}

/** An object of the app's catalogue with every way it is written. */
export interface NamedObject {
  id: string
  /** Its catalogue designations, the first the one it is best known by ("M31", then "NGC 224"). */
  designations: string[]
  /** Its common names and other aliases ("Andromeda Galaxy", "Great Andromeda Nebula"). */
  names: string[]
}

export interface ObjectNameIndex {
  byDesignation: Map<string, string>
  /** Names in compared words, longest first, so "Orion Nebula" wins over a shorter name inside it. */
  names: { words: string; objectId: string }[]
  objects: Map<string, NamedObject>
}

/** The shortest common name compared, so a stray short alias cannot match half the library. */
export const MIN_NAME_LETTERS = 4

/**
 * The lookup a file name is matched against. A designation or name claimed by two objects stays
 * with the first; catalogue designations are claimed before aliases.
 */
export function objectNameIndex(objects: NamedObject[]): ObjectNameIndex {
  const byDesignation = new Map<string, string>()
  const claim = (text: string, id: string) => {
    for (const d of designationsIn(text)) if (!byDesignation.has(d.designation)) byDesignation.set(d.designation, id)
  }
  for (const o of objects) for (const d of o.designations) claim(d, o.id)
  for (const o of objects) for (const n of o.names) claim(n, o.id)

  const names: { words: string; objectId: string }[] = []
  const seen = new Set<string>()
  for (const o of objects) {
    for (const n of o.names) {
      const words = nameWords(n)
      // A designation written as an alias ("NGC 224") is matched as a designation, not as words.
      if (words.replace(/ /g, '').length < MIN_NAME_LETTERS || designationsIn(n).length > 0 || seen.has(words)) continue
      seen.add(words)
      names.push({ words, objectId: o.id })
    }
  }
  names.sort((a, b) => b.words.length - a.words.length)
  return { byDesignation, names, objects: new Map(objects.map(o => [o.id, o])) }
}

export interface NameMatch {
  objectId: string
  /** What in the name matched: a designation as the catalogue writes it, or the common name. */
  text: string
  by: 'designation' | 'name'
}

export interface NameReading {
  /** Objects the name names, designations first in the order written, then common names; each once. */
  matches: NameMatch[]
  /** Designations in the name that the app's catalogues do not hold. */
  unknown: string[]
}

/** The catalogue objects a name (a file's stem or a folder's name) names. */
export function readObjectName(text: string, index: ObjectNameIndex): NameReading {
  const matches: NameMatch[] = []
  const unknown: string[] = []
  const add = (m: NameMatch) => {
    if (!matches.some(x => x.objectId === m.objectId)) matches.push(m)
  }
  for (const d of designationsIn(text)) {
    const id = index.byDesignation.get(d.designation)
    if (id) add({ objectId: id, text: d.designation, by: 'designation' })
    else unknown.push(d.designation)
  }
  let words = ` ${nameWords(text)} `
  for (const n of index.names) {
    const at = words.indexOf(` ${n.words} `)
    if (at < 0) continue
    add({ objectId: n.objectId, text: n.words, by: 'name' })
    // Blanked out so a shorter name inside this one does not match as well.
    words = `${words.slice(0, at)} ${' '.repeat(n.words.length)} ${words.slice(at + n.words.length + 2)}`
  }
  return { matches, unknown }
}

export interface ImageNameReading extends NameReading {
  /** Where the objects were read from: the file's own name, or the nearest folder that names one. */
  from: 'file' | 'folder' | null
}

/**
 * The objects an image shows by its name: its file name first, else the folders it sits in under
 * the gallery's root, nearest first. Designations no catalogue holds are reported from wherever
 * they were read.
 */
export function readImageName(fileName: string, folders: string[], index: ObjectNameIndex): ImageNameReading {
  const own = readObjectName(fileStem(fileName), index)
  if (own.matches.length > 0) return { ...own, from: 'file' }
  for (const folder of [...folders].reverse()) {
    const reading = readObjectName(folder, index)
    if (reading.matches.length > 0) return { ...reading, unknown: [...own.unknown, ...reading.unknown.filter(u => !own.unknown.includes(u))], from: 'folder' }
  }
  return { matches: [], unknown: own.unknown, from: null }
}

// ── What an object is ──────────────────────────────────────────────────────────────────────────

/** "emission_nebula" as people read it: "Emission nebula"; an empty type is just an object. */
export function objectTypeLabel(objectType: string | null | undefined): string {
  const words = (objectType ?? '').replace(/_/g, ' ').trim().toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Object'
}

/** The full moon's width, in arc minutes, to give a size a feel. */
export const FULL_MOON_ARCMIN = 31

/** A size on the sky: "8′" under a degree, "1.5°" above, with how many full moons across when it is that large. */
export function apparentSize(sizeArcmin: number): string {
  const size = sizeArcmin >= 60 ? `${Number((sizeArcmin / 60).toFixed(1))}°` : `${Number(sizeArcmin.toFixed(1))}′`
  const moons = Math.round(sizeArcmin / FULL_MOON_ARCMIN)
  if (moons >= 2) return `${size}, about ${moons} full moons across`
  if (moons === 1) return `${size}, about the full moon's width`
  return size
}

export interface ObjectSummary {
  objectType: string | null
  constellation: string | null
  magnitude: number | null
  sizeArcmin: number | null
}

/** One sentence on what the object is: "A galaxy in Andromeda, magnitude 3.4, 3° across, about 6 full moons across." */
export function describeObject(o: ObjectSummary): string {
  const type = objectTypeLabel(o.objectType).toLowerCase()
  const article = /^[aeiou]/.test(type) ? 'An' : 'A'
  const parts = [`${article} ${type}${o.constellation ? ` in ${o.constellation}` : ''}`]
  if (o.magnitude !== null && Number.isFinite(o.magnitude)) parts.push(`magnitude ${Number(o.magnitude.toFixed(1))}`)
  if (o.sizeArcmin !== null && o.sizeArcmin > 0) parts.push(`${apparentSize(o.sizeArcmin)}`)
  return `${parts.join(', ')}.`
}

// ── When it is best placed ─────────────────────────────────────────────────────────────────────

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const

/** Day of the year (0 = 1 January) the sun crosses the March equinox, and the days in a year. */
const EQUINOX_DAY = 78.8
const YEAR_DAYS = 365.2422

/**
 * The month an object is due south (or north) at local midnight, so highest in the darkest part of
 * the night: when the sun stands 12 hours of right ascension from it. 0 is January.
 */
export function midnightMonth(raHours: number): number {
  const ra = ((raHours % 24) + 24) % 24
  const day = (EQUINOX_DAY + (((ra + 12) % 24) / 24) * YEAR_DAYS) % YEAR_DAYS
  // Month lengths of a common year; the equinox moves by less than a day between years.
  const ends = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]
  const whole = Math.floor(day) % 365
  return ends.findIndex(end => whole < end)
}

/** How high an object gets at best from a latitude, in degrees; below zero it never rises there. */
export function highestAltitudeDeg(latitudeDeg: number, decDeg: number): number {
  return 90 - Math.abs(latitudeDeg - decDeg)
}

// ── Where to read more ─────────────────────────────────────────────────────────────────────────

export const REFERENCE_SITES = ['simbad', 'wikipedia'] as const

export type ReferenceSite = (typeof REFERENCE_SITES)[number]

/**
 * The page about an object on SIMBAD (by designation) or Wikipedia (Messier objects as "Messier 31",
 * which is how its articles are named, else the common name, else the designation). Built here from
 * the catalogue, never taken from the window, so only these two sites are ever opened.
 */
export function referenceUrl(site: ReferenceSite, designation: string, commonName: string | null): string {
  if (site === 'simbad') return `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(designation)}`
  const messier = /^M(\d+)$/.exec(designation)
  const query = messier ? `Messier ${messier[1]}` : commonName && designationsIn(commonName).length === 0 ? commonName : designation
  return `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`
}
