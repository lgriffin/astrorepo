import { describe, expect, it } from 'vitest'
import {
  CONCEPTS,
  LEARNING_SOURCES,
  OBJECT_KINDS,
  PRIMERS,
  SHORT_MAX,
  conceptById,
  libraryProblems,
  primerFor,
  sourceUrl,
  type Concept,
  type LearningSource,
  type ObjectPrimer
} from '@astro/domain'

const source = (over: Partial<LearningSource> = {}): LearningSource => ({ id: 's1', title: 'S', publisher: 'P', url: 'https://example.org/s', ...over })
const concept = (over: Partial<Concept> = {}): Concept => ({
  id: 'c1',
  title: 'C',
  short: 'A short answer.',
  detail: 'More.',
  formula: null,
  related: [],
  sources: ['s1'],
  ...over
})
const primer = (over: Partial<ObjectPrimer> = {}): ObjectPrimer => ({
  kind: 'galaxy',
  title: 'Galaxy',
  summary: 's',
  shines: 's',
  life: 'l',
  inPicture: 'i',
  imaging: 'i',
  caution: null,
  concepts: ['c1'],
  sources: ['s1'],
  ...over
})
const check = (o: { concepts?: Concept[]; primers?: Record<string, ObjectPrimer>; sources?: LearningSource[]; kinds?: string[] }) =>
  libraryProblems(o.concepts ?? [concept()], o.primers ?? { galaxy: primer() }, o.sources ?? [source()], o.kinds ?? ['galaxy'])

describe('The knowledge base', () => {
  it('[LRN-002] Given the shipped knowledge base, When it is checked, Then every fact names a source and every link resolves', () => {
    expect(libraryProblems()).toEqual([])
    expect(CONCEPTS.length).toBeGreaterThanOrEqual(15)
    for (const c of CONCEPTS) expect(c.short.length).toBeLessThanOrEqual(SHORT_MAX)
  })

  it('[LRN-002] Given a sound small library, When it is checked, Then nothing is wrong', () => {
    expect(check({})).toEqual([])
  })

  it('[LRN-002] Given a concept or primer with no source, When it is checked, Then the missing source is named', () => {
    expect(check({ concepts: [concept({ sources: [] })] })).toEqual(['Concept c1 names no source.'])
    expect(check({ primers: { galaxy: primer({ sources: [] }) } })).toEqual(['Primer galaxy names no source.'])
  })

  it('[LRN-002] Given a citation or a link to nothing, When it is checked, Then the broken reference is named', () => {
    expect(check({ concepts: [concept({ sources: ['s1', 'nope'] })] })).toEqual(['Concept c1 cites nope, which is not a source.'])
    expect(check({ concepts: [concept({ related: ['ghost'] })] })).toEqual(['Concept c1 links to ghost, which is not a concept.'])
    expect(check({ primers: { galaxy: primer({ concepts: ['ghost'] }) } })).toEqual(['Primer galaxy links to ghost, which is not a concept.'])
    expect(check({ primers: { galaxy: primer({ sources: ['nope'] }) } })).toEqual(['Primer galaxy cites nope, which is not a source.'])
  })

  it('[LRN-002] Given repeated ids, a self link, an unsafe address or a long answer, When it is checked, Then each is named', () => {
    expect(check({ sources: [source(), source()] })).toEqual(['Source s1 is listed twice.'])
    expect(check({ sources: [source({ url: 'http://example.org' })] })).toEqual(['Source s1 is not an https address.'])
    expect(check({ concepts: [concept(), concept()] })).toEqual(['Concept c1 is listed twice.'])
    expect(check({ concepts: [concept({ related: ['c1'] })] })).toEqual(['Concept c1 links to itself.'])
    expect(check({ concepts: [concept({ short: 'x'.repeat(SHORT_MAX) })] })).toEqual([])
    expect(check({ concepts: [concept({ short: 'x'.repeat(SHORT_MAX + 1) })] })).toEqual([`Concept c1 has a one-line answer over ${SHORT_MAX} characters.`])
  })

  it('[LRN-003] Given a kind with no primer or one filed under another kind, When it is checked, Then the gap is named', () => {
    expect(check({ kinds: ['galaxy', 'comet'] })).toEqual(['The comet kind has no primer.'])
    expect(check({ primers: { galaxy: primer({ kind: 'comet' }) } })).toEqual(['Primer galaxy is filed as comet.'])
  })
})

describe('Primers', () => {
  it('[LRN-003] Given every kind a target can be, When its primer is asked for, Then it has one, filled in', () => {
    for (const kind of OBJECT_KINDS) {
      const p = primerFor(kind)
      expect(p.kind).toBe(kind)
      for (const part of [p.summary, p.shines, p.life, p.inPicture, p.imaging]) expect(part.length).toBeGreaterThan(0)
    }
  })

  it('[LRN-003] Given a kind the app does not know, or none, When its primer is asked for, Then the not yet known primer comes back', () => {
    expect(primerFor('quasar')).toBe(PRIMERS.unknown)
    expect(primerFor(null)).toBe(PRIMERS.unknown)
    expect(primerFor(undefined)).toBe(PRIMERS.unknown)
    expect(primerFor('')).toBe(PRIMERS.unknown)
    expect(primerFor('toString')).toBe(PRIMERS.unknown)
    expect(primerFor('emission_nebula').title).toBe('Emission nebula')
  })

  it('[LRN-007] Given the Sun, When its primer is read, Then it carries the solar safety warning', () => {
    expect(primerFor('solar_object').caution).toMatch(/certified solar filter/)
    expect(primerFor('galaxy').caution).toBeNull()
  })
})

describe('Looking things up', () => {
  it('[LRN-001] Given a concept id, When it is looked up, Then the concept or nothing comes back', () => {
    expect(conceptById('light-year')?.title).toBe('Light year')
    expect(conceptById('nope')).toBeNull()
    expect(conceptById('c1', [concept()])?.id).toBe('c1')
  })

  it('[LRN-005] Given a source id the knowledge base does not hold, When its address is asked for, Then there is none, so nothing opens', () => {
    expect(sourceUrl('nope')).toBeNull()
    expect(sourceUrl('wiki-light-year')).toBe('https://en.wikipedia.org/wiki/Light-year')
    expect(sourceUrl('s1', [source()])).toBe('https://example.org/s')
    expect(LEARNING_SOURCES.every(s => s.url.startsWith('https://'))).toBe(true)
  })
})
