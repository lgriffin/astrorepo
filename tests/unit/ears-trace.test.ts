import { describe, it, expect } from 'vitest'
import { checkPattern, parseCitations, parseRequirements, passes, trace, type Requirement } from '../../scripts/ears/trace'

// Fixture IDs are built at runtime so this file does not itself cite them.
const cite = (...ids: string[]) => `[${ids.join(', ')}]`
const req = (id: string, pattern: Requirement['pattern'], text: string): Requirement => ({ id, pattern, text, source: 'spec.md' })

const SPEC = `
| ID | Pattern | Requirement |
|----|---------|-------------|
| ZZZ-001 | Ubiquitous | The system shall keep sources read-only. |
| ZZZ-002 | Event | When a folder is registered, the system shall index it. |
`

describe('EARS traceability', () => {
  it('[NFR-005] Given a requirements table, When parsed, Then each row becomes a requirement and headers are ignored', () => {
    expect(parseRequirements(SPEC, 'spec.md').map(r => [r.id, r.pattern])).toEqual([
      ['ZZZ-001', 'Ubiquitous'],
      ['ZZZ-002', 'Event']
    ])
  })

  it('[NFR-005] Given test names with single and grouped citations, When parsed, Then every ID is found', () => {
    const code = `it('${cite('ZZZ-001')} Given x'); it('${cite('ZZZ-002', 'ZZZ-003')} Given y')`
    expect(parseCitations(code, 'a.test.ts').map(c => c.id)).toEqual(['ZZZ-001', 'ZZZ-002', 'ZZZ-003'])
  })

  it('[NFR-005] Given every requirement cited, When traced, Then it passes', () => {
    const report = trace(parseRequirements(SPEC, 'spec.md'), parseCitations(cite('ZZZ-001', 'ZZZ-002'), 'a.test.ts'))
    expect(passes(report)).toBe(true)
  })

  it('[NFR-005] Given a requirement no test cites, When traced, Then it fails and names the ID', () => {
    const report = trace(parseRequirements(SPEC, 'spec.md'), parseCitations(cite('ZZZ-001'), 'a.test.ts'))
    expect(passes(report)).toBe(false)
    expect(report.uncited.map(r => r.id)).toEqual(['ZZZ-002'])
  })

  it('[NFR-005] Given a test citing an undefined ID, When traced, Then it fails and names the file', () => {
    const report = trace(parseRequirements(SPEC, 'spec.md'), parseCitations(cite('ZZZ-001', 'ZZZ-002', 'ZZZ-999'), 'b.test.ts'))
    expect(passes(report)).toBe(false)
    expect(report.unknown).toEqual([{ id: 'ZZZ-999', file: 'b.test.ts' }])
  })

  it('[NFR-005] Given the same ID defined twice, When traced, Then it fails as a duplicate', () => {
    const reqs = [...parseRequirements(SPEC, 'spec.md'), req('ZZZ-001', 'Ubiquitous', 'The system shall log.')]
    const report = trace(reqs, parseCitations(cite('ZZZ-001', 'ZZZ-002'), 'a.test.ts'))
    expect(report.duplicates).toEqual(['ZZZ-001'])
    expect(passes(report)).toBe(false)
  })

  describe('EARS pattern wording', () => {
    it.each([
      ['Ubiquitous', 'The system shall keep sources read-only.'],
      ['Event', 'When a folder is registered, the system shall index it.'],
      ['State', 'While an import runs, the system shall publish counts.'],
      ['Unwanted', 'If a file cannot be parsed, then the system shall quarantine it.'],
      ['Optional', 'Where a weather adapter is enabled, the system shall use cloud cover.'],
      ['Complex', 'While a target has data, when the user opens the cockpit, the system shall suggest it.']
    ] as const)('[NFR-007] Given a well-formed %s requirement, When checked, Then it passes', (pattern, text) => {
      expect(checkPattern(req('ZZZ-001', pattern, text))).toBeNull()
    })

    it.each([
      ['Ubiquitous', 'When a folder is registered, the system shall index it.'],
      ['Event', 'The system shall index folders.'],
      ['State', 'When an import runs, the system shall publish counts.'],
      ['Unwanted', 'If a file cannot be parsed the system shall quarantine it.'],
      ['Optional', 'The system shall use cloud cover.'],
      ['Complex', 'When a folder is registered, the system shall index it.'],
      ['Event', 'When a folder is registered, the system indexes it.'],
      ['Sometimes' as never, 'The system shall index it.']
    ] as const)('[NFR-007] Given a %s requirement that does not read as its pattern, When checked, Then it is rejected', (pattern, text) => {
      expect(checkPattern(req('ZZZ-001', pattern, text))).not.toBeNull()
    })

    it('[NFR-007] Given a requirement with the wrong wording, When traced, Then the whole check fails', () => {
      const report = trace([req('ZZZ-001', 'Event', 'The system shall index folders.')], parseCitations(cite('ZZZ-001'), 'a.test.ts'))
      expect(report.patternErrors).toHaveLength(1)
      expect(passes(report)).toBe(false)
    })
  })
})
