import { describe, expect, it } from 'vitest'
import {
  CROSS_REFERENCE,
  SAME_OBJECT_DEG,
  isSeededSource,
  nameClashes,
  nameKey,
  planCatalogueRepair,
  seedTargets,
  type InstalledTarget,
  type SeedCatalogue,
  type SeedObject
} from '../src'

const object = (designation: string, ra: number, dec: number, extra: Partial<SeedObject> = {}): SeedObject => ({
  designation,
  name: designation,
  type: 'galaxy',
  ra,
  dec,
  mag: 8,
  size: 10,
  constellation: 'Ursa Major',
  aliases: [],
  ...extra
})

const catalogue = (abbreviation: string, objects: SeedObject[]): SeedCatalogue => ({ name: abbreviation, abbreviation, description: '', totalObjects: objects.length, objects })

const M33 = object('M33', 1.5641, 30.6599, { name: 'Triangulum Galaxy', aliases: ['NGC 598'] })
const M101 = object('M101', 14.0535, 54.3488, { name: 'Pinwheel Galaxy', aliases: ['NGC 5457'] })
const NGC598 = object('NGC 598', 1.5641, 30.6599, { aliases: ['M33', 'Triangulum Galaxy'] })
const NGC5457 = object('NGC 5457', 14.0535, 54.3488, { aliases: ['M101', 'Pinwheel Galaxy'] })
const SEEDS = [catalogue('M', [M33, M101]), catalogue('NGC', [NGC598, NGC5457])]

let n = 0
const newId = () => `new-${++n}`

const installed = (t: Partial<InstalledTarget> & { id: string; canonicalName: string }): InstalledTarget => ({
  isCustom: false,
  isYours: false,
  aliases: [],
  entries: [],
  ...t
})

describe('Catalogue names', () => {
  it('[CAT-001] Given names in any spelling, When they are compared, Then catalogue numbers read as the catalogues write them and common names ignore case and punctuation', () => {
    expect(nameKey('NGC598')).toBe('NGC 598')
    expect(nameKey('ngc 0598')).toBe('NGC 598')
    expect(nameKey('Messier 33')).toBe('M33')
    expect(nameKey('Caldwell 14')).toBe('C14')
    expect(nameKey('Sh 2-155')).toBe('SH2-155')
    expect(nameKey("Bode's  Galaxy")).toBe('bodes galaxy')
    expect(nameKey('Ｐｉｎｗｈｅｅｌ Galaxy')).toBe('pinwheel galaxy')
    expect(nameKey('χ Persei')).not.toBe(nameKey('Persei'))
  })

  it('[CAT-002] Given a name two objects far apart carry, When the catalogues are checked, Then the clash is named with both objects and how far apart they are', () => {
    const wrong = catalogue('M', [{ ...M33, aliases: ['NGC 598', 'Pinwheel Galaxy'] }, M101])
    const [clash, ...more] = nameClashes([wrong])
    expect(more).toEqual([])
    expect(clash.name).toBe('Pinwheel Galaxy')
    expect(clash.designations).toEqual(['M33', 'M101'])
    expect(clash.spanDeg).toBeGreaterThan(30)
  })

  it('[CAT-002] Given names shared only by objects close together, When the catalogues are checked, Then there is no clash', () => {
    expect(nameClashes(SEEDS)).toEqual([])
    const near = object('NGC 6523', 18.06, -24.38 + SAME_OBJECT_DEG / 2, { aliases: ['M8'] })
    expect(nameClashes([catalogue('NGC', [near]), catalogue('M', [object('M8', 18.06, -24.38)])])).toEqual([])
  })

  it('[CAT-003] Given the same object in two catalogues, When targets are made, Then it is one target with both entries, named by the first catalogue', () => {
    const targets = seedTargets(SEEDS)
    expect(targets.map(t => t.canonicalName)).toEqual(['Triangulum Galaxy', 'Pinwheel Galaxy'])
    expect(targets[0].entries).toEqual([{ catalogue: 'M', designation: 'M33' }, { catalogue: 'NGC', designation: 'NGC 598' }])
    expect(targets[0].aliases).toEqual([
      { alias: 'M33', source: 'M' },
      { alias: 'NGC 598', source: CROSS_REFERENCE }
    ])
    expect(targets[0].facts).toMatchObject({ ra: 1.5641, dec: 30.6599 })
  })

  it('[CAT-003] Given a wrong alias on an object far away, When targets are made, Then the other object is never folded into it', () => {
    const wrong = [catalogue('M', [{ ...M33, aliases: ['NGC 598', 'Pinwheel Galaxy'] }, M101])]
    expect(seedTargets(wrong).map(t => t.entries.map(e => e.designation))).toEqual([['M33'], ['M101']])
  })

  it('[CAT-003] Given an object of another catalogue named like a target far away, When targets are made, Then it is not folded into it', () => {
    const wrong = [catalogue('M', [{ ...M33, aliases: ['Pinwheel Galaxy'] }]), catalogue('NGC', [{ ...NGC5457, name: 'Pinwheel Galaxy', aliases: [] }])]
    expect(seedTargets(wrong).map(t => t.entries.map(e => e.designation))).toEqual([['M33'], ['NGC 5457']])
  })

  it('[CAT-003] Given a target that already has a number in a catalogue, When a second number of that catalogue shares its name, Then the second gets its own target', () => {
    const lagoon = [
      catalogue('M', [object('M8', 18.06, -24.38, { name: 'Lagoon Nebula' })]),
      catalogue('NGC', [object('NGC 6523', 18.06, -24.38, { aliases: ['M8'] }), object('NGC 6530', 18.08, -24.36, { aliases: ['Lagoon Nebula'] })])
    ]
    expect(seedTargets(lagoon).map(t => t.entries.map(e => e.designation))).toEqual([['M8', 'NGC 6523'], ['NGC 6530']])
  })

  it('[CAT-003] Given two numbers of one catalogue that share a name, When targets are made, Then each keeps its own target', () => {
    const rosette = [catalogue('NGC', [object('NGC 2237', 6.51, 4.98, { name: 'Rosette Nebula' }), object('NGC 2244', 6.53, 4.94, { aliases: ['Rosette Nebula'] })])]
    expect(seedTargets(rosette)).toHaveLength(2)
  })

  it('[CAT-004] Given a target that held M33 and M101, When the repair is planned, Then M33 keeps the target and M101 gets its own with its frames and folder', () => {
    const merged = installed({
      id: 't-33',
      canonicalName: 'Triangulum Galaxy',
      isYours: true,
      aliases: [{ alias: 'M33', source: 'M' }, { alias: 'Pinwheel Galaxy', source: CROSS_REFERENCE }, { alias: 'M101', source: 'M' }],
      entries: [{ catalogue: 'M', designation: 'M33' }]
    })
    const plan = planCatalogueRepair([merged], seedTargets(SEEDS), {
      frames: [
        { id: 'f1', targetId: 't-33', name: 'M33', folderName: 'M33' },
        { id: 'f2', targetId: 't-33', name: 'M 101', folderName: 'whatever' },
        { id: 'f3', targetId: 't-33', name: 'Light', folderName: 'NGC5457' },
        { id: 'f4', targetId: 't-33', name: null, folderName: null }
      ],
      folders: [{ id: 'h1', targetId: 't-33', name: 'M101 Pinwheel 2026' }, { id: 'h2', targetId: 't-33', name: 'Triangulum' }]
    }, newId)
    expect(plan.create).toHaveLength(1)
    const m101 = plan.create[0]
    expect(m101.canonicalName).toBe('Pinwheel Galaxy')
    expect(m101.facts).toMatchObject({ ra: 14.0535, dec: 54.3488 })
    expect(plan.update).toEqual([{ id: 't-33', facts: expect.objectContaining({ ra: 1.5641 }) }])
    expect(plan.frames).toEqual([{ id: 'f2', targetId: m101.id }, { id: 'f3', targetId: m101.id }])
    expect(plan.folders).toEqual([{ id: 'h1', targetId: m101.id }])
    expect(plan.aliases.filter(a => a.targetId === 't-33').map(a => a.alias)).toEqual(['M33', 'NGC 598'])
    expect(plan.aliases.filter(a => a.targetId === m101.id).map(a => a.alias)).toEqual(['M101', 'NGC 5457'])
    expect(plan.entries).toEqual([
      { targetId: 't-33', catalogue: 'M', designation: 'M33' },
      { targetId: 't-33', catalogue: 'NGC', designation: 'NGC 598' },
      { targetId: m101.id, catalogue: 'M', designation: 'M101' },
      { targetId: m101.id, catalogue: 'NGC', designation: 'NGC 5457' }
    ])
    expect(plan.split).toEqual([{ id: 't-33', canonicalName: 'Triangulum Galaxy', into: ['M101'] }])
  })

  it('[CAT-004] Given a target named for an object it does not hold the entry of, When the repair is planned, Then the target goes with its name and the entry\'s object gets a target', () => {
    // The old seeder named the Rosette's target for C49; the name is NGC 2237's now.
    const seeds = seedTargets([
      catalogue('C', [object('C49', 6.508, 5.05, { aliases: ['NGC 2238'] })]),
      catalogue('NGC', [object('NGC 2237', 6.51, 4.98, { name: 'Rosette Nebula' })])
    ])
    const rosette = installed({ id: 't-r', canonicalName: 'Rosette Nebula', entries: [{ catalogue: 'C', designation: 'C49' }], isYours: true })
    const plan = planCatalogueRepair([rosette], seeds, { frames: [{ id: 'f', targetId: 't-r', name: 'Rosette Nebula', folderName: null }], folders: [] }, newId)
    expect(plan.entries.find(e => e.designation === 'NGC 2237')!.targetId).toBe('t-r')
    const c49 = plan.create.find(c => c.canonicalName === 'C49')!
    expect(plan.entries.find(e => e.designation === 'C49')!.targetId).toBe(c49.id)
    expect(plan.frames).toEqual([])
  })

  it('[CAT-004] Given a target the user made with an object\'s main name, When the repair is planned, Then it takes the object\'s entry and keeps its own facts', () => {
    const custom = installed({ id: 'mine', canonicalName: 'Pinwheel Galaxy', isCustom: true, isYours: true })
    const otherSeeds = seedTargets([catalogue('M', [M101])])
    // The user's own "Pinwheel Galaxy" takes the catalogue's M101 by name and keeps its own facts.
    const plan = planCatalogueRepair([custom], otherSeeds, { frames: [], folders: [] }, newId)
    expect(plan.create).toEqual([])
    expect(plan.update).toEqual([])
    expect(plan.entries).toEqual([{ targetId: 'mine', catalogue: 'M', designation: 'M101' }])
  })

  it('[CAT-004] Given two new targets the catalogues give one main name, When the repair is planned, Then the second is named by its catalogue number', () => {
    const twins = seedTargets([catalogue('NGC', [object('NGC 1', 0, 0, { name: 'Twin' }), object('NGC 2', 12, 40, { name: 'Twin' })])])
    expect(planCatalogueRepair([], twins, { frames: [], folders: [] }, newId).create.map(c => c.canonicalName)).toEqual(['Twin', 'NGC 2'])
    // An installed target named Twin is the first one's.
    const held = planCatalogueRepair([installed({ id: 'twin', canonicalName: 'Twin', isYours: true })], twins, { frames: [], folders: [] }, newId)
    expect(held.entries.find(e => e.targetId === 'twin')!.designation).toBe('NGC 1')
  })

  it('[CAT-004] Given a catalogue target under a name no catalogue uses now, When the repair is planned, Then it keeps the object whose entry it holds', () => {
    const renamed = installed({ id: 'old', canonicalName: 'Old M101 name', entries: [{ catalogue: 'M', designation: 'M101' }], isYours: true })
    const plan = planCatalogueRepair([renamed], seedTargets(SEEDS), { frames: [], folders: [] }, newId)
    expect(plan.create.map(c => c.canonicalName)).toEqual(['Triangulum Galaxy'])
    expect(plan.entries.filter(e => e.targetId === 'old').map(e => e.designation)).toEqual(['M101', 'NGC 5457'])
    expect(plan.aliases.filter(a => a.targetId === 'old').map(a => a.alias)).toEqual(['Pinwheel Galaxy', 'M101', 'NGC 5457'])
    expect(plan.update.map(u => u.id)).toEqual(['old'])
  })

  it('[CAT-004] Given a target holding another object only by a catalogue alias, When the repair is planned, Then the object is split off with its frames and folders named in any spelling', () => {
    const merged = installed({ id: 'm', canonicalName: 'Triangulum Galaxy', aliases: [{ alias: 'M101', source: 'M' }], isYours: true })
    const plan = planCatalogueRepair([merged], seedTargets(SEEDS), {
      frames: [{ id: 'f', targetId: 'm', name: 'Pinwheel  galaxy', folderName: null }],
      folders: [{ id: 'h1', targetId: 'm', name: 'NGC_5457_2026' }, { id: 'h2', targetId: 'm', name: 'M101' }, { id: 'h3', targetId: 'm', name: '2026-01 M101' }]
    }, newId)
    const m101 = plan.create[0].id
    expect(plan.split).toEqual([{ id: 'm', canonicalName: 'Triangulum Galaxy', into: ['M101'] }])
    expect(plan.frames).toEqual([{ id: 'f', targetId: m101 }])
    expect(plan.folders).toEqual([{ id: 'h1', targetId: m101 }, { id: 'h2', targetId: m101 }])
  })

  it('[CAT-005] Given a target a library scan made, When the repair is planned, Then its frames stay whatever their names and it is never removed', () => {
    const scanned = installed({ id: 'scan', canonicalName: 'Light frames' })
    const plan = planCatalogueRepair([scanned], seedTargets(SEEDS), { frames: [{ id: 'f', targetId: 'scan', name: 'M101', folderName: 'M101' }], folders: [] }, newId)
    expect(plan.frames).toEqual([])
    expect(plan.remove).toEqual([])
    expect(plan.split).toEqual([])
  })

  it('[CAT-005] Given an alias the catalogues gave that no object carries now, When the repair is planned, Then it is not given again, and an old catalogue target nothing of yours points at goes', () => {
    const old = installed({ id: 'old', canonicalName: 'NGC 18', aliases: [{ alias: 'old', source: CROSS_REFERENCE }], entries: [{ catalogue: 'NGC', designation: 'NGC 18' }] })
    const kept = installed({ ...old, id: 'kept', canonicalName: 'NGC 19', isYours: true, entries: [{ catalogue: 'NGC', designation: 'NGC 19' }] })
    const scanned = installed({ id: 'scan', canonicalName: 'NGC 7000' })
    const plan = planCatalogueRepair([old, kept, scanned], seedTargets(SEEDS), { frames: [], folders: [] }, newId)
    expect(plan.aliases.map(a => a.alias)).not.toContain('old')
    expect(plan.remove).toEqual(['old'])
  })

  it('[CAT-005] Given a frame linked to a target the user made, When the repair is planned, Then it stays, whatever its name', () => {
    const mine = installed({ id: 'mine', canonicalName: 'My M101 project', isCustom: true, isYours: true })
    const plan = planCatalogueRepair([mine], seedTargets(SEEDS), { frames: [{ id: 'f', targetId: 'mine', name: 'M101', folderName: null }], folders: [] }, newId)
    expect(plan.frames).toEqual([])
  })

  it('[CAT-005] Given aliases and their sources, When each is judged, Then only a catalogue\'s own number or a cross-reference is the catalogues\'', () => {
    expect(isSeededSource('M', ['M', 'NGC'])).toBe(true)
    expect(isSeededSource(CROSS_REFERENCE, [])).toBe(true)
    expect(isSeededSource('user', ['M'])).toBe(false)
    expect(isSeededSource(null, ['M'])).toBe(false)
  })

  it('[CAT-006] Given an install already made from these catalogues, When the repair is planned, Then nothing is created, moved or removed', () => {
    const seeds = seedTargets(SEEDS)
    const fresh = planCatalogueRepair([], seeds, { frames: [], folders: [] }, newId)
    const install = fresh.create.map(c =>
      installed({
        id: c.id,
        canonicalName: c.canonicalName,
        aliases: fresh.aliases.filter(a => a.targetId === c.id).map(({ alias, source }) => ({ alias, source })),
        entries: fresh.entries.filter(e => e.targetId === c.id).map(({ catalogue, designation }) => ({ catalogue, designation }))
      }))
    const again = planCatalogueRepair(install, seeds, { frames: [{ id: 'f', targetId: install[1].id, name: 'NGC 5457', folderName: null }], folders: [] }, newId)
    expect(again.create).toEqual([])
    expect(again.remove).toEqual([])
    expect(again.frames).toEqual([])
    expect(again.split).toEqual([])
    expect(again.aliases).toEqual(fresh.aliases)
  })
})
