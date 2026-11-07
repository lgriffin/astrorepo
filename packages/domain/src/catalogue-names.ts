/**
 * The built-in catalogues' names, and how an install's targets are repaired when the catalogues
 * change (specs/047-catalogue-names). A target is one object in the sky: every name and alias it
 * carries points at it. The seeder used to fold any object into the first target holding one of its
 * names, so a wrong alias ("Pinwheel Galaxy" on M33) folded M101 into the Triangulum Galaxy. These
 * rules say which names are the same object, find names that point at two places, and plan the repair
 * of an install made from wrong catalogues. Pure rules: reading the catalogues and the database are
 * adapters' jobs.
 */
import { asDesignation } from './object-names'
import { separationDeg } from './sky'

/** Objects whose positions are this far apart or more are different objects (CAT-002). */
export const SAME_OBJECT_DEG = 1

/** Where an alias came from, as stored: the catalogue's abbreviation for its own number, else this. */
export const CROSS_REFERENCE = 'cross-reference'

export interface SeedObject {
  designation: string
  name: string
  type: string
  ra: number | null
  dec: number | null
  mag: number | null
  size: number | null
  constellation: string
  aliases: string[]
}

export interface SeedCatalogue {
  name: string
  abbreviation: string
  description: string
  totalObjects: number
  objects: SeedObject[]
}

/**
 * How a name is compared: a catalogue number in any spelling as the catalogues write it ("NGC224",
 * "ngc 0224" and "NGC 224" are "NGC 224"; "Caldwell 14" is "C14"), anything else in lower case with
 * runs of punctuation and spaces as one space ("Bode's Galaxy" and "bodes galaxy" are the same).
 */
export function nameKey(name: string): string {
  const designation = asDesignation(name)
  if (designation) return designation.toUpperCase()
  return name
    .normalize('NFKC')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Every name an object goes by: its number, its main name and its aliases. */
export function namesOf(object: SeedObject): string[] {
  return [object.designation, object.name, ...object.aliases]
}

function apart(a: { ra: number | null; dec: number | null }, b: { ra: number | null; dec: number | null }): number {
  if (a.ra === null || a.dec === null || b.ra === null || b.dec === null) return 0
  return separationDeg(a.ra, a.dec, b.ra, b.dec)
}

export interface NameClash {
  /** The name as first written. */
  name: string
  /** The catalogue numbers of the objects carrying it. */
  designations: string[]
  /** The widest angle between two of them, in degrees. */
  spanDeg: number
}

/** Names (and aliases) that the catalogues give to objects a degree or more apart (CAT-002). */
export function nameClashes(catalogues: SeedCatalogue[]): NameClash[] {
  const holders = new Map<string, { name: string; objects: SeedObject[] }>()
  for (const object of catalogues.flatMap(c => c.objects)) {
    for (const name of new Set(namesOf(object).map(nameKey))) {
      const held = holders.get(name) ?? { name: namesOf(object).find(n => nameKey(n) === name)!, objects: [] }
      held.objects.push(object)
      holders.set(name, held)
    }
  }
  const clashes: NameClash[] = []
  for (const { name, objects } of holders.values()) {
    let span = 0
    for (const a of objects) for (const b of objects) span = Math.max(span, apart(a, b))
    if (span >= SAME_OBJECT_DEG) clashes.push({ name, designations: [...new Set(objects.map(o => o.designation))], spanDeg: span })
  }
  return clashes
}

export interface SeedFacts {
  type: string
  ra: number | null
  dec: number | null
  mag: number | null
  size: number | null
  constellation: string
}

export interface SeedAlias {
  alias: string
  /** A catalogue's abbreviation for its own number, else CROSS_REFERENCE. */
  source: string
}

/** One target the catalogues make: one object, under every catalogue that lists it. */
export interface SeedTarget {
  canonicalName: string
  facts: SeedFacts
  aliases: SeedAlias[]
  entries: Array<{ catalogue: string; designation: string }>
}

/**
 * The targets the catalogues make, in the order given (CAT-003). An object joins the target that
 * already goes by one of its names when that target is within SAME_OBJECT_DEG and has no number in
 * the object's catalogue yet (M31 joins NGC 224; the Rosette's NGC 2237 never joins NGC 2244);
 * otherwise it makes its own. The first object of a target gives its main name and facts.
 */
export function seedTargets(catalogues: SeedCatalogue[]): SeedTarget[] {
  const targets: Array<SeedTarget & { keys: Set<string>; at: SeedObject }> = []
  const byKey = new Map<string, number[]>()
  for (const catalogue of catalogues) {
    for (const object of catalogue.objects) {
      const keys = namesOf(object).map(nameKey)
      const candidates = [...new Set(keys.flatMap(k => byKey.get(k) ?? []))].sort((a, b) => a - b)
      const index = candidates.find(i =>
        apart(targets[i].at, object) < SAME_OBJECT_DEG && !targets[i].entries.some(e => e.catalogue === catalogue.abbreviation))
      let target = index === undefined ? undefined : targets[index]
      if (!target) {
        target = {
          canonicalName: object.name,
          facts: { type: object.type, ra: object.ra, dec: object.dec, mag: object.mag, size: object.size, constellation: object.constellation },
          aliases: [],
          entries: [],
          keys: new Set([nameKey(object.name)]),
          at: object
        }
        targets.push(target)
      }
      const at = targets.indexOf(target)
      target.entries.push({ catalogue: catalogue.abbreviation, designation: object.designation })
      const add = (alias: string, source: string): void => {
        const key = nameKey(alias)
        if (target.keys.has(key)) return
        target.keys.add(key)
        target.aliases.push({ alias, source })
      }
      add(object.designation, catalogue.abbreviation)
      for (const alias of [object.name, ...object.aliases]) add(alias, CROSS_REFERENCE)
      for (const key of keys) byKey.set(key, [...new Set([...(byKey.get(key) ?? []), at])])
    }
  }
  return targets.map(({ canonicalName, facts, aliases, entries }) => ({ canonicalName, facts, aliases, entries }))
}

/** A target as an install holds it, with what the repair needs to know about it. */
export interface InstalledTarget {
  id: string
  canonicalName: string
  isCustom: boolean
  /** Anything of the user's points at it (frames, folders, a stage, a night, their collection). */
  isYours: boolean
  aliases: SeedAlias[]
  entries: Array<{ catalogue: string; designation: string }>
}

/** A frame or library folder linked to a target, by the names it was linked through. */
export interface LinkedItem {
  id: string
  targetId: string
  /** FITS OBJECT for a frame, the folder's name for a library folder. */
  name: string | null
  /** The folder a frame sits in; unused for a library folder. */
  folderName?: string | null
}

export type TargetRef = { id: string } | { create: number }

export interface CatalogueRepairPlan {
  /** New targets, referred to by their place in this list. */
  create: Array<{ id: string; canonicalName: string; facts: SeedFacts }>
  /** New facts for installed targets the catalogues made; a target the user made keeps its own. */
  update: Array<{ id: string; facts: SeedFacts }>
  /** Every alias the catalogues give, on its target; aliases the user gave are not touched. */
  aliases: Array<{ targetId: string } & SeedAlias>
  /** Every catalogue entry, on its target. */
  entries: Array<{ targetId: string; catalogue: string; designation: string }>
  /** Frames to move to the target their FITS OBJECT (or folder) now names. */
  frames: Array<{ id: string; targetId: string }>
  /** Library folders to move to the target their name now names. */
  folders: Array<{ id: string; targetId: string }>
  /** Targets the catalogues made that no catalogue lists any more and that hold nothing of the user's. */
  remove: string[]
  /** For the report: installed targets that held more than one object and were split. */
  split: Array<{ id: string; canonicalName: string; into: string[] }>
}

/** Whether an alias is the catalogues' own (CAT-005); aliases the user gives carry no such source. */
export function isSeededSource(source: string | null, abbreviations: string[]): boolean {
  return source === CROSS_REFERENCE || (source !== null && abbreviations.includes(source))
}

/**
 * The repair of an install against the catalogues' targets (CAT-004, CAT-005). Each catalogue target
 * keeps the installed target with its main name, else the one holding its catalogue entries, else a
 * new one; so a target that held two objects keeps the one it is named for and the other gets its own
 * target. Then every catalogue alias and entry is put on its target, and the frames and library
 * folders of a split target go to the target their name now belongs to. `newId` names new targets.
 */
export function planCatalogueRepair(
  installed: InstalledTarget[],
  seeds: SeedTarget[],
  items: { frames: LinkedItem[]; folders: LinkedItem[] },
  newId: () => string
): CatalogueRepairPlan {
  const abbreviations = [...new Set(seeds.flatMap(s => s.entries.map(e => e.catalogue)))]
  const seedOf = new Map<string, number>()
  seeds.forEach((s, i) => {
    for (const name of [s.canonicalName, ...s.aliases.map(a => a.alias)]) if (!seedOf.has(nameKey(name))) seedOf.set(nameKey(name), i)
  })

  // Each seed target to one installed target: by main name first, then by the numbers it holds.
  const holder = new Map<number, InstalledTarget>()
  const taken = new Set<string>()
  for (const t of installed) {
    const i = seedOf.get(nameKey(t.canonicalName))
    if (i !== undefined && !holder.has(i)) {
      holder.set(i, t)
      taken.add(t.id)
    }
  }
  // Targets the catalogues made: they hold a catalogue entry or alias. A target a library scan made
  // for a name it found holds neither, and only takes a seed target by its main name above.
  const builtIn = installed.filter(t => !t.isCustom && (t.entries.length > 0 || t.aliases.some(a => isSeededSource(a.source, abbreviations))))
  seeds.forEach((s, i) => {
    if (holder.has(i)) return
    const numbers = new Set(s.entries.map(e => nameKey(e.designation)))
    const t = builtIn.find(t => !taken.has(t.id) && t.entries.some(e => numbers.has(nameKey(e.designation))))
    if (t) {
      holder.set(i, t)
      taken.add(t.id)
    }
  })

  const canonical = new Set(installed.map(t => nameKey(t.canonicalName)))
  const create: CatalogueRepairPlan['create'] = []
  const update: CatalogueRepairPlan['update'] = []
  const targetOf: string[] = seeds.map((s, i) => {
    const t = holder.get(i)
    if (t) {
      if (!t.isCustom) update.push({ id: t.id, facts: s.facts })
      return t.id
    }
    // A new target's main name must not be another target's; its first number is then used.
    const free = [s.canonicalName, ...s.entries.map(e => e.designation)].find(n => !canonical.has(nameKey(n))) ?? `${s.canonicalName} (${s.entries[0].designation})`
    canonical.add(nameKey(free))
    const id = newId()
    create.push({ id, canonicalName: free, facts: s.facts })
    return id
  })

  // A target keeps its own main name; the catalogue's main name, where that differs, becomes an alias.
  const mainName = new Map<string, string>([...installed.map(t => [t.id, t.canonicalName] as const), ...create.map(c => [c.id, c.canonicalName] as const)])
  const aliases = seeds.flatMap((s, i) =>
    [{ alias: s.canonicalName, source: CROSS_REFERENCE }, ...s.aliases]
      .filter(a => nameKey(a.alias) !== nameKey(mainName.get(targetOf[i])!))
      .map(a => ({ targetId: targetOf[i], ...a })))
  const entries = seeds.flatMap((s, i) => s.entries.map(e => ({ targetId: targetOf[i], ...e })))

  // A frame or folder moves when its name now belongs to another target than the one it is linked to,
  // and only off a target the catalogues made, so links the user made to their own targets stay.
  const ownerOf = (name: string | null | undefined): string | undefined => {
    if (!name) return undefined
    const i = seedOf.get(nameKey(name))
    return i === undefined ? undefined : targetOf[i]
  }
  // A library folder is named for its object first ("M101 Pinwheel", "NGC_5457-2024"), as the scan reads it.
  const ownerOfFolder = (name: string | null | undefined): string | undefined => {
    if (!name) return undefined
    const words = name.split(/[\s_-]+/)
    for (let n = words.length - 1; n > 0; n--) {
      const to = ownerOf(words.slice(0, n).join(' '))
      if (to) return to
    }
    return undefined
  }
  const builtInIds = new Set(builtIn.map(t => t.id))
  const moves = (list: LinkedItem[], folders: boolean): Array<{ id: string; targetId: string }> =>
    list.flatMap(item => {
      if (!builtInIds.has(item.targetId)) return []
      const to = folders ? ownerOf(item.name) ?? ownerOfFolder(item.name) : ownerOf(item.name) ?? ownerOf(item.folderName)
      return to && to !== item.targetId ? [{ id: item.id, targetId: to }] : []
    })

  const kept = new Set(targetOf)
  const remove = builtIn.filter(t => !kept.has(t.id) && !t.isYours).map(t => t.id)

  const split = builtIn.flatMap(t => {
    const named = new Set(
      [...t.aliases.filter(a => isSeededSource(a.source, abbreviations)).map(a => a.alias), ...t.entries.map(e => e.designation)]
        .map(n => seedOf.get(nameKey(n)))
        .filter((i): i is number => i !== undefined && targetOf[i] !== t.id)
        .map(i => seeds[i].entries[0].designation)
    )
    return named.size > 0 && kept.has(t.id) ? [{ id: t.id, canonicalName: t.canonicalName, into: [...named] }] : []
  })

  return { create, update, aliases, entries, frames: moves(items.frames, false), folders: moves(items.folders, true), remove, split }
}
