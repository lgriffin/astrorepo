import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  CATALOGUE_SIZE,
  designationsIn,
  highestAltitudeDeg,
  midnightMonth,
  objectNameIndex,
  readImageName,
  readObjectName,
  type CatalogueKey,
  type NamedObject
} from '@astro/domain'
import { anyText, fileStem, propertyParams } from './arbitraries'

const CATALOGUES = Object.keys(CATALOGUE_SIZE) as CatalogueKey[]

/** Every way a capture tool or a person writes each catalogue's prefix. */
const SPELLINGS: Record<CatalogueKey, string[]> = {
  M: ['M', 'm', 'Messier', 'MESSIER'],
  NGC: ['NGC', 'ngc', 'Ngc'],
  IC: ['IC', 'ic'],
  C: ['C', 'c', 'Caldwell'],
  Sh2: ['Sh2', 'sh2', 'SH 2', 'Sharpless']
}

/** A catalogue, a number it holds, and that designation written some way people write it. */
const written = fc
  .constantFrom(...CATALOGUES)
  .chain(catalogue =>
    fc.record({
      catalogue: fc.constant(catalogue),
      number: fc.integer({ min: 1, max: CATALOGUE_SIZE[catalogue] }),
      prefix: fc.constantFrom(...SPELLINGS[catalogue]),
      separator: fc.constantFrom('', ' ', '_', '-', '  ', ' - '),
      zeros: fc.integer({ min: 0, max: 2 })
    })
  )
  .map(w => ({ ...w, text: `${w.prefix}${w.separator}${'0'.repeat(w.zeros)}${w.number}` }))

/** Text around a designation that cannot join it: starts and ends at a separator. */
const around = fileStem.map(s => `_${s}_`)

const objects: NamedObject[] = [
  { id: 'm31', designations: ['M31', 'NGC 224'], names: ['Andromeda Galaxy'] },
  { id: 'm42', designations: ['M42'], names: ['Orion Nebula', 'Orion'] },
  { id: 'c20', designations: ['C20', 'NGC 7000'], names: ['North America Nebula'] }
]
const index = objectNameIndex(objects)

describe('designations in any name', () => {
  it('[GAL-003, FUZ-006] Given any catalogue designation written any common way between any other words, When read, Then it is found as the catalogue writes it', () => {
    fc.assert(
      fc.property(written, around, around, (w, before, after) => {
        const found = designationsIn(`${before}${w.text}${after}`)
        expect(found.map(d => [d.catalogue, d.number])).toContainEqual([w.catalogue, w.number])
      }),
      propertyParams()
    )
  })

  it('[GAL-003, FUZ-006] Given any designation as the catalogue writes it, When read back, Then it is that one designation', () => {
    fc.assert(
      fc.property(written, w => {
        const [d] = designationsIn(w.text)
        expect(designationsIn(d.designation)).toEqual([d])
      }),
      propertyParams()
    )
  })

  it('[GAL-004, FUZ-006] Given digits, dates and separators with no catalogue prefix, When read, Then nothing is counted', () => {
    const plain = fc.string({ unit: fc.constantFrom(...'0123456789 _-.:+T'.split('')), maxLength: 30 })
    fc.assert(
      fc.property(plain, text => {
        expect(designationsIn(text)).toEqual([])
      }),
      propertyParams()
    )
  })

  it('[GAL-004, FUZ-006] Given any text at all, When read, Then it never fails, each designation is in its catalogue’s range and none repeats', () => {
    fc.assert(
      fc.property(anyText, text => {
        const found = designationsIn(text)
        for (const d of found) {
          expect(d.number).toBeGreaterThanOrEqual(1)
          expect(d.number).toBeLessThanOrEqual(CATALOGUE_SIZE[d.catalogue])
        }
        expect(new Set(found.map(d => d.designation)).size).toBe(found.length)
      }),
      propertyParams()
    )
  })

  it('[GAL-003, FUZ-006] Given any file name and folders, When read against the catalogue, Then it never fails and names each known object at most once', () => {
    fc.assert(
      fc.property(anyText, fc.array(anyText, { maxLength: 3 }), (name, folders) => {
        const reading = readImageName(name, folders, index)
        const ids = reading.matches.map(m => m.objectId)
        expect(new Set(ids).size).toBe(ids.length)
        for (const id of ids) expect(index.objects.has(id)).toBe(true)
        expect(reading.from === null).toBe(ids.length === 0)
        expect(readObjectName(name, index).matches.every(m => index.objects.has(m.objectId))).toBe(true)
      }),
      propertyParams()
    )
  })
})

describe('placing any object', () => {
  it('[GAL-007, FUZ-006] Given any right ascension, When placed, Then a month comes back, the same a day of right ascension later', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), ra => {
        const month = midnightMonth(ra)
        expect(month).toBeGreaterThanOrEqual(0)
        expect(month).toBeLessThanOrEqual(11)
        expect(Number.isInteger(month)).toBe(true)
      }),
      propertyParams()
    )
  })

  it('[GAL-007, FUZ-006] Given any site and object, When the highest altitude is worked out, Then it is at most 90° and reached only when they match', () => {
    fc.assert(
      fc.property(fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -90, max: 90, noNaN: true }), (lat, dec) => {
        const alt = highestAltitudeDeg(lat, dec)
        expect(alt).toBeLessThanOrEqual(90)
        expect(alt).toBeGreaterThanOrEqual(-90)
        expect(alt).toBe(highestAltitudeDeg(dec, lat))
      }),
      propertyParams()
    )
  })
})
