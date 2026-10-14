import { beforeEach, describe, expect, it } from 'vitest'
import {
  apparentSize,
  asDesignation,
  CATALOGUE_SIZE,
  describeObject,
  designationsIn,
  fileStem,
  highestAltitudeDeg,
  midnightMonth,
  MONTH_NAMES,
  nameWords,
  objectNameIndex,
  objectTypeLabel,
  readImageName,
  readObjectName,
  referenceUrl,
  type NamedObject,
  type ObjectNameIndex
} from '@astro/domain'

const OBJECTS: NamedObject[] = [
  { id: 'm31', designations: ['M31', 'NGC 224'], names: ['Andromeda Galaxy', 'Great Andromeda Nebula'] },
  { id: 'm42', designations: ['M42', 'NGC 1976'], names: ['Orion Nebula', 'Sh2-281'] },
  { id: 'm43', designations: ['M43'], names: ["De Mairan's Nebula"] },
  { id: 'ngc7000', designations: ['NGC 7000', 'C20'], names: ['North America Nebula'] },
  { id: 'ic434', designations: ['IC 434'], names: ['Horsehead Nebula'] },
  { id: 'sh2-155', designations: ['Sh2-155'], names: ['Cave Nebula'] },
  { id: 'm45', designations: ['M45'], names: ['Pleiades', 'Seven Sisters'] },
  { id: 'm81', designations: ['M81'], names: ["Bode's Galaxy"] },
  { id: 'm82', designations: ['M82'], names: ['Cigar Galaxy', 'Ufo'] },
  { id: 'trap', designations: [], names: ['Orion'] }
]
let index: ObjectNameIndex
beforeEach(() => {
  index = objectNameIndex(OBJECTS)
})
const designations = (text: string) => designationsIn(text).map(d => d.designation)
const objectsIn = (text: string) => readObjectName(text, index).matches.map(m => m.objectId)

describe('designations in a name', () => {
  it.each([
    ['M31', ['M31']],
    ['m31', ['M31']],
    ['M 31', ['M31']],
    ['M_031', ['M31']],
    ['Messier 31', ['M31']],
    ['messier-031', ['M31']],
    ['NGC7000', ['NGC 7000']],
    ['ngc_7000_HOO', ['NGC 7000']],
    ['NGC7000HOO', ['NGC 7000']],
    ['IC434', ['IC 434']],
    ['ic-434', ['IC 434']],
    ['Sh2-155', ['Sh2-155']],
    ['sh2 155', ['Sh2-155']],
    ['Sharpless 155', ['Sh2-155']],
    ['Sharpless 2-155', ['Sh2-155']],
    ['Sharpless2-155', ['Sh2-155']],
    ['sharpless_2-155', ['Sh2-155']],
    ['Sharpless 2 Cave', ['Sh2-2']],
    ['Sharpless2_-6', ['Sh2-2']],
    ['C14', ['C14']],
    ['Caldwell 14', ['C14']],
    ['M81_M82', ['M81', 'M82']],
    ['M82 and M81 and M82', ['M82', 'M81']],
    ['NGC 7000 + IC 5070', ['NGC 7000', 'IC 5070']]
  ])('[GAL-003] Given the name %s, When read, Then it names %j', (name, expected) => {
    expect(designations(name)).toEqual(expected)
  })

  it.each([
    ['Stacked_210_10.0s_IRCUT_20241001-213045'],
    ['2026-10-01'],
    ['gain120_offset30'],
    ['M0'],
    ['M111'],
    ['C110'],
    ['C10s'],
    ['ICE'],
    ['NGC'],
    ['PIC12'],
    ['AM31'],
    ['M3150'],
    ['GM31'],
    ['Sh2-314']
  ])('[GAL-004] Given %s, which holds no designation, When read, Then nothing is counted as an object', name => {
    expect(designations(name)).toEqual([])
  })

  it('[GAL-003] Given a Seestar stack name, When read, Then only its target is named', () => {
    expect(designations('Stacked_210_M 31_10.0s_IRCUT_20241001-213045')).toEqual(['M31'])
  })

  it('[GAL-003] Given each catalogue at its last number, When read, Then it is named, and one past it is not counted', () => {
    expect(designations(`M${CATALOGUE_SIZE.M}`)).toEqual(['M110'])
    expect(designations(`NGC ${CATALOGUE_SIZE.NGC}`)).toEqual(['NGC 7840'])
    expect(designations(`NGC ${CATALOGUE_SIZE.NGC + 1}`)).toEqual([])
    expect(designations(`IC ${CATALOGUE_SIZE.IC}`)).toEqual(['IC 5386'])
    expect(designations(`IC ${CATALOGUE_SIZE.IC + 1}`)).toEqual([])
    expect(designations(`C${CATALOGUE_SIZE.C}`)).toEqual(['C109'])
    expect(designations(`Sh2-${CATALOGUE_SIZE.Sh2}`)).toEqual(['Sh2-313'])
  })

  it('[GAL-003] Given a designation, When read, Then its catalogue and number come back too', () => {
    expect(designationsIn('sh2-155')).toEqual([{ catalogue: 'Sh2', number: 155, designation: 'Sh2-155' }])
    expect(designationsIn('C 9')).toEqual([{ catalogue: 'C', number: 9, designation: 'C9' }])
  })

  it('[GAL-003] Given Caldwell followed by a separator or the end, When read, Then it is named', () => {
    expect(designations('C20_final')).toEqual(['C20'])
    expect(designations('C20')).toEqual(['C20'])
    expect(designations('C20-v2')).toEqual(['C20'])
  })
})

describe('a name that is only a designation', () => {
  it('[GAL-003] Given names that are a designation in any spelling, When read, Then the designation comes back as the catalogue writes it', () => {
    expect(asDesignation('NGC 224')).toBe('NGC 224')
    expect(asDesignation(' M 31 ')).toBe('M31')
    expect(asDesignation('Caldwell 23')).toBe('C23')
    expect(asDesignation('sh2-155')).toBe('Sh2-155')
  })

  it('[GAL-004] Given common names, names with more than a designation, and numbers past a catalogue, When read, Then none is counted as a designation', () => {
    expect(asDesignation('Andromeda Galaxy')).toBeNull()
    expect(asDesignation('NGC 7000 HOO')).toBeNull()
    expect(asDesignation('NGC7000HOO')).toBeNull()
    expect(asDesignation('The M31')).toBeNull()
    expect(asDesignation('M31 M32')).toBeNull()
    expect(asDesignation('M111')).toBeNull()
    expect(asDesignation('')).toBeNull()
  })
})

describe('names compared as words', () => {
  it('[GAL-003] Given camel case, apostrophes and separators, When compared, Then they read as plain lower-case words', () => {
    expect(nameWords('AndromedaGalaxy_final')).toBe('andromeda galaxy final')
    expect(nameWords("Bode's Galaxy")).toBe('bodes galaxy')
    expect(nameWords('Bode’s  Galaxy!!')).toBe('bodes galaxy')
    expect(nameWords('  --  ')).toBe('')
  })

  it('[GAL-003] Given file names with and without extensions, When stemmed, Then only the extension goes', () => {
    expect(fileStem('M31.png')).toBe('M31')
    expect(fileStem('M31.final.jpeg')).toBe('M31.final')
    expect(fileStem('M31')).toBe('M31')
    expect(fileStem('M31.toolongext')).toBe('M31.toolongext')
  })
})

describe('the name index', () => {
  it('[GAL-003] Given designations, aliases that are designations and common names, When indexed, Then each designation finds its object and names are compared longest first', () => {
    expect(index.byDesignation.get('M31')).toBe('m31')
    expect(index.byDesignation.get('NGC 224')).toBe('m31')
    expect(index.byDesignation.get('Sh2-281')).toBe('m42')
    expect(index.names.map(n => n.words)).not.toContain('sh2 281')
    for (let i = 1; i < index.names.length; i++) expect(index.names[i - 1].words.length).toBeGreaterThanOrEqual(index.names[i].words.length)
  })

  it('[GAL-003] Given a designation or name claimed by two objects, When indexed, Then the first keeps it and a catalogue designation wins over an alias', () => {
    const idx = objectNameIndex([
      { id: 'a', designations: ['NGC 1'], names: ['M 99', 'Same Name'] },
      { id: 'b', designations: ['M99', 'NGC 1'], names: ['Same Name'] }
    ])
    expect(idx.byDesignation.get('M99')).toBe('b')
    expect(idx.byDesignation.get('NGC 1')).toBe('a')
    expect(idx.names).toEqual([{ words: 'same name', objectId: 'a' }])
  })

  it('[GAL-004] Given a name shorter than four letters, When indexed, Then it is not counted', () => {
    expect(index.names.some(n => n.words === 'ufo')).toBe(false)
    expect(objectNameIndex([{ id: 'x', designations: [], names: ['Ab C', 'Ab Cd'] }]).names).toEqual([{ words: 'ab cd', objectId: 'x' }])
    expect(objectNameIndex([{ id: 'x', designations: [], names: ['Abcd'] }]).names).toEqual([{ words: 'abcd', objectId: 'x' }])
  })
})

describe('reading a name', () => {
  it('[GAL-003] Given a designation and the same object’s common name, When read, Then the object is named once, by its designation', () => {
    expect(readObjectName('M31 Andromeda Galaxy', index).matches).toEqual([{ objectId: 'm31', text: 'M31', by: 'designation' }])
  })

  it('[GAL-003] Given common names written in different ways, When read, Then the object is found', () => {
    expect(objectsIn('Andromeda_Galaxy_final')).toEqual(['m31'])
    expect(objectsIn('AndromedaGalaxy')).toEqual(['m31'])
    expect(objectsIn('bodes galaxy 2026')).toEqual(['m81'])
    expect(objectsIn('pleiades')).toEqual(['m45'])
    expect(readObjectName('The Pleiades', index).matches).toEqual([{ objectId: 'm45', text: 'pleiades', by: 'name' }])
  })

  it('[GAL-003] Given a longer name that holds a shorter one, When read, Then only the longer counts', () => {
    expect(objectsIn('Orion Nebula HOO')).toEqual(['m42'])
    expect(objectsIn('My best ever image of the Orion Nebula')).toEqual(['m42'])
    expect(objectsIn('Orion Nebula and the Pleiades')).toEqual(['m42', 'm45'])
    expect(objectsIn('Pleiades then Orion Nebula then Cigar Galaxy')).toEqual(['m42', 'm82', 'm45'])
    expect(objectsIn('Orion widefield')).toEqual(['trap'])
  })

  it('[GAL-003] Given two objects, When read, Then both are named, designations in order before names', () => {
    expect(objectsIn('Cigar Galaxy and M81')).toEqual(['m81', 'm82'])
    expect(objectsIn('M42_M43')).toEqual(['m42', 'm43'])
  })

  it('[GAL-004] Given a common name inside another word, When read, Then it is not counted', () => {
    expect(objectsIn('Pleiadesque')).toEqual([])
    expect(objectsIn('XAndromeda Galaxy')).toEqual([])
  })

  it('[GAL-010] Given a designation the catalogue does not hold, When read, Then it is reported as unknown', () => {
    expect(readObjectName('NGC 891 and M31', index)).toEqual({ matches: [{ objectId: 'm31', text: 'M31', by: 'designation' }], unknown: ['NGC 891'] })
  })
})

describe('reading an image’s name', () => {
  it('[GAL-003] Given a file named for its object, When read, Then the objects come from the file name', () => {
    expect(readImageName('M31.png', ['Galaxies'], index)).toEqual({ matches: [{ objectId: 'm31', text: 'M31', by: 'designation' }], unknown: [], from: 'file' })
  })

  it('[GAL-003] Given a file named for nothing in a folder named for its object, When read, Then the nearest folder that names one is used', () => {
    expect(readImageName('final.png', ['M42', 'v1'], index)).toMatchObject({ matches: [{ objectId: 'm42' }], from: 'folder' })
    expect(readImageName('final.png', ['M42', 'Horsehead Nebula'], index)).toMatchObject({ matches: [{ objectId: 'ic434' }], from: 'folder' })
  })

  it('[GAL-009] Given neither file nor folders name an object, When read, Then nothing is named', () => {
    expect(readImageName('final.png', ['2026', 'best'], index)).toEqual({ matches: [], unknown: [], from: null })
  })

  it('[GAL-010] Given a file naming only an unknown designation in a folder naming a known one, When read, Then the folder’s object is named and the file’s designation reported unknown once', () => {
    expect(readImageName('NGC 891.png', ['M42 NGC 891'], index)).toEqual({ matches: [{ objectId: 'm42', text: 'M42', by: 'designation' }], unknown: ['NGC 891'], from: 'folder' })
    expect(readImageName('NGC 891.png', [], index)).toEqual({ matches: [], unknown: ['NGC 891'], from: null })
    expect(readImageName('NGC 891.png', ['M42 NGC 2'], index)).toMatchObject({ unknown: ['NGC 891', 'NGC 2'], from: 'folder' })
  })

  it('[GAL-003] Given the file name of a picture with its extension, When read, Then the extension is not read as a name', () => {
    const idx = objectNameIndex([{ id: 'x', designations: [], names: ['Jpeg Nebula'] }])
    expect(readImageName('nebula.jpeg', [], idx).matches).toEqual([])
  })
})

describe('what an object is', () => {
  it('[GAL-005] Given object types, When labelled, Then they read in sentence case, and none is an object', () => {
    expect(objectTypeLabel('emission_nebula')).toBe('Emission nebula')
    expect(objectTypeLabel('GALAXY')).toBe('Galaxy')
    expect(objectTypeLabel(' ')).toBe('Object')
    expect(objectTypeLabel(null)).toBe('Object')
    expect(objectTypeLabel(undefined)).toBe('Object')
  })

  it('[GAL-005] Given sizes on the sky, When shown, Then arc minutes under a degree, degrees above, and full moons when that large', () => {
    expect(apparentSize(8)).toBe('8′')
    expect(apparentSize(15.25)).toBe('15.3′')
    expect(apparentSize(31)).toBe("31′, about the full moon's width")
    expect(apparentSize(60)).toBe("1°, about 2 full moons across")
    expect(apparentSize(178)).toBe('3°, about 6 full moons across')
    expect(apparentSize(46)).toBe("46′, about the full moon's width")
    expect(apparentSize(47)).toBe('47′, about 2 full moons across')
  })

  it('[GAL-005] Given an object’s facts, When described, Then one sentence says what and where it is, how bright and how large', () => {
    expect(describeObject({ objectType: 'galaxy', constellation: 'Andromeda', magnitude: 3.44, sizeArcmin: 178 })).toBe(
      'A galaxy in Andromeda, magnitude 3.4, 3°, about 6 full moons across.'
    )
    expect(describeObject({ objectType: 'emission_nebula', constellation: null, magnitude: null, sizeArcmin: null })).toBe('An emission nebula.')
    expect(describeObject({ objectType: 'open_cluster', constellation: 'Taurus', magnitude: Number.NaN, sizeArcmin: 0 })).toBe('An open cluster in Taurus.')
    expect(describeObject({ objectType: null, constellation: 'Lyra', magnitude: 8.8, sizeArcmin: 1.4 })).toBe('An object in Lyra, magnitude 8.8, 1.4′.')
  })
})

describe('when an object is best placed', () => {
  it.each([
    [0.7122, 'September'], // M31: due south at midnight at the end of September
    [5.5908, 'December'], // M42
    [12.0, 'March'],
    [18.0, 'June'],
    [20.98, 'August'], // NGC 7000
    [3.7833, 'November'], // M45
    [8.892, 'February'] // due south at midnight on the first of February itself
  ])('[GAL-007] Given right ascension %f h, When placed, Then it is highest at midnight in %s', (ra, month) => {
    expect(MONTH_NAMES[midnightMonth(ra)]).toBe(month)
  })

  it('[GAL-007] Given right ascensions outside 0 to 24 hours, When placed, Then they wrap', () => {
    expect(midnightMonth(24.7122)).toBe(midnightMonth(0.7122))
    expect(midnightMonth(-23.2878)).toBe(midnightMonth(0.7122))
  })

  it('[GAL-007] Given the last right ascension before the equinox wraps, When placed, Then a month still comes back', () => {
    for (let ra = 11.9; ra < 12.1; ra += 0.001) expect(midnightMonth(ra)).toBeGreaterThanOrEqual(0)
  })

  it('[GAL-007] Given a latitude and declination, When the highest altitude is asked, Then it is 90 less their difference, below zero when it never rises', () => {
    expect(highestAltitudeDeg(53.3, 41.27)).toBeCloseTo(77.97, 2)
    expect(highestAltitudeDeg(53.3, -5.39)).toBeCloseTo(31.31, 2)
    expect(highestAltitudeDeg(53.3, -60)).toBeCloseTo(-23.3, 6)
    expect(highestAltitudeDeg(53.3, 89)).toBeCloseTo(54.3, 6)
  })
})

describe('where to read more', () => {
  it('[GAL-008] Given an object, When its SIMBAD page is asked for, Then it is looked up by designation', () => {
    expect(referenceUrl('simbad', 'NGC 7000', 'North America Nebula')).toBe('https://simbad.cds.unistra.fr/simbad/sim-id?Ident=NGC%207000')
  })

  it('[GAL-008] Given objects, When their Wikipedia page is asked for, Then Messier objects go by "Messier n", others by common name, else designation', () => {
    expect(referenceUrl('wikipedia', 'M31', 'Andromeda Galaxy')).toBe('https://en.wikipedia.org/wiki/Special:Search?search=Messier%2031')
    expect(referenceUrl('wikipedia', 'NGC 7000', 'North America Nebula')).toBe('https://en.wikipedia.org/wiki/Special:Search?search=North%20America%20Nebula')
    expect(referenceUrl('wikipedia', 'NGC 9', null)).toBe('https://en.wikipedia.org/wiki/Special:Search?search=NGC%209')
    expect(referenceUrl('wikipedia', 'NGC 9', 'NGC 9')).toBe('https://en.wikipedia.org/wiki/Special:Search?search=NGC%209')
    expect(referenceUrl('wikipedia', 'SM31', null)).toBe('https://en.wikipedia.org/wiki/Special:Search?search=SM31')
    expect(referenceUrl('wikipedia', 'M31A', null)).toBe('https://en.wikipedia.org/wiki/Special:Search?search=M31A')
  })
})
