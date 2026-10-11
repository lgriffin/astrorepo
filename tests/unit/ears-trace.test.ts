import { describe, it, expect } from 'vitest'
import {
  checkPattern, checkSpecFolders, extractTestTitles, formatMarkdown, formatReport, parseCitations, parseFeatureCitations,
  parseRequirements, passes, summariseBySpec, toJson, trace, type Citation, type Requirement
} from '../../scripts/ears/trace'

// Fixture IDs (ZZZ-...) sit in plain strings, which the tracer does not count, so this file does
// not cite them itself.
const req = (id: string, pattern: Requirement['pattern'], text: string, source = 'spec.md'): Requirement => ({ id, pattern, text, source })
const titled = (...ids: string[]) => ids.map(id => `it('[${id}] Given x, When y, Then z', () => {})`).join('\n')
const citing = (title: string, id = 'ZZZ-001'): Citation => ({ id, file: 'a.test.ts', title, kind: 'test' })

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

  it('[TRC-008] Given tables that are not requirement tables, When parsed, Then only ID | pattern | text rows are read', () => {
    const md = [
      '| Pattern | Shape |', '|---|---|', '| Ubiquitous | The system shall ... |',
      '| Use case | Rules | Ports |', '|---|---|---|', '| `listX` | `rule` | Port |',
      '| ZZZ-1 | Event | When x, the system shall y. |',
      '| ZZZ-003 | Event | When x, the system shall y. |'
    ].join('\n')
    expect(parseRequirements(md, 'spec.md').map(r => r.id)).toEqual(['ZZZ-003'])
  })

  it('[NFR-005] Given test names with single and grouped citations, When parsed, Then every ID is found', () => {
    const code = "it('[ZZZ-001] Given x', () => {}); it('[ZZZ-002, ZZZ-003] Given y', () => {})"
    expect(parseCitations(code, 'a.test.ts').map(c => c.id)).toEqual(['ZZZ-001', 'ZZZ-002', 'ZZZ-003'])
  })

  it('[NFR-005] Given every requirement cited, When traced, Then it passes', () => {
    const report = trace(parseRequirements(SPEC, 'spec.md'), parseCitations(titled('ZZZ-001', 'ZZZ-002'), 'a.test.ts'))
    expect(passes(report)).toBe(true)
  })

  it('[NFR-005] Given a requirement no test cites, When traced, Then it fails and names the ID', () => {
    const report = trace(parseRequirements(SPEC, 'spec.md'), parseCitations(titled('ZZZ-001'), 'a.test.ts'))
    expect(passes(report)).toBe(false)
    expect(report.uncited.map(r => r.id)).toEqual(['ZZZ-002'])
  })

  it('[NFR-005] Given a test citing an undefined ID, When traced, Then it fails and names the file', () => {
    const report = trace(parseRequirements(SPEC, 'spec.md'), parseCitations(titled('ZZZ-001', 'ZZZ-002', 'ZZZ-999'), 'b.test.ts'))
    expect(passes(report)).toBe(false)
    expect(report.unknown).toMatchObject([{ id: 'ZZZ-999', file: 'b.test.ts' }])
  })

  it('[NFR-005] Given the same ID defined twice, When traced, Then it fails as a duplicate', () => {
    const reqs = [...parseRequirements(SPEC, 'spec.md'), req('ZZZ-001', 'Ubiquitous', 'The system shall log.')]
    const report = trace(reqs, parseCitations(titled('ZZZ-001', 'ZZZ-002'), 'a.test.ts'))
    expect(report.duplicates).toEqual(['ZZZ-001'])
    expect(passes(report)).toBe(false)
  })

  describe('citations count only in test titles', () => {
    it.each([
      ['it', "it('[ZZZ-001] a', () => {})"],
      ['test', 'test("[ZZZ-001] a", () => {})'],
      ['describe', 'describe(`[ZZZ-001] a`, () => {})'],
      ['it.each with a table', "it.each([['x', 1], ['y', (2)]] as const)('[ZZZ-001] %s', (a, b) => {})"],
      ['describe.each', "describe.each([1, 2])('[ZZZ-001] %i', () => {})"],
      ['test.skip', "test.skip('[ZZZ-001] a', () => {})"],
      ['it.skipIf', "it.skipIf(process.platform === 'win32')('[ZZZ-001] a', () => {})"],
      ['it.each tagged template', 'it.each`\n a | b\n ${1} | ${2}\n`(\'[ZZZ-001] $a\', () => {})'],
      ['a title spread over lines', "it(\n  '[ZZZ-001] a',\n  async () => {}\n)"]
    ])('[TRC-001] Given a citation in a %s title, When parsed, Then it is counted', (_name, code) => {
      expect(parseCitations(code, 'a.test.ts').map(c => c.id)).toEqual(['ZZZ-001'])
    })

    it.each([
      ['a line comment', "// it('[ZZZ-001] a', () => {})\nit('b', () => {})"],
      ['a block comment', "/* covers [ZZZ-001]\n it('[ZZZ-001] a') */ it('b', () => {})"],
      ['an assertion string', "it('b', () => { expect(x).toBe('[ZZZ-001]') })"],
      ['a constant', "const ID = '[ZZZ-001]'; it(ID, () => {})"],
      ['a template inside a test body', "it('b', () => { const s = `it('[ZZZ-001]')` })"],
      ['a regex literal', "it('b', () => { expect(s).toMatch(/it\\('\\[ZZZ-001\\]/) })"],
      ['another object\'s test method', "expect(/x/.test('[ZZZ-001]')).toBe(true)"]
    ])('[TRC-002] Given a requirement ID only in %s, When parsed, Then it is not counted as cited', (_name, code) => {
      expect(parseCitations(code, 'a.test.ts')).toEqual([])
    })

    it('[TRC-001] Given a file mixing strings, regexes and division, When titles are extracted, Then every test title is found in order', () => {
      const code = [
        "const half = total / 2; const re = /['\"`]/g",
        "describe('outer \\'quoted\\'', () => {",
        '  it(`templ ${a + `nested ${b}`} end`, () => {})',
        "  it('it(\"not a title\")', () => {})",
        '})'
      ].join('\n')
      expect(extractTestTitles(code)).toEqual(["outer \\'quoted\\'", 'templ ${a + `nested ${b}`} end', 'it("not a title")'])
    })

    it('[TRC-001] Given a citing title, When parsed, Then the citation keeps the title so failure wording can be checked', () => {
      expect(parseCitations("it('[ZZZ-001] fails on bad input', () => {})", 'a.test.ts'))
        .toEqual([{ id: 'ZZZ-001', file: 'a.test.ts', title: '[ZZZ-001] fails on bad input', kind: 'test' }])
    })
  })

  describe('Gherkin tags', () => {
    const FEATURE = [
      '@ZZZ-001 @slow',
      'Feature: Keeping sources safe',
      '  # @ZZZ-008 in a comment',
      '  Background:',
      '    Given a folder',
      '',
      '  @ZZZ-002',
      '  Scenario: Index a folder',
      '    Given the step mentions @ZZZ-009',
      '    And a doc string',
      '      """',
      '      @ZZZ-010',
      '      Scenario: not real',
      '      """',
      '',
      '  @ZZZ-003 # trailing comment',
      '  Scenario Outline: Space for <n>',
      '    Given <n> lights',
      '    @ZZZ-004',
      '    Examples:',
      '      | n |',
      '      | 1 |'
    ].join('\n')

    it('[TRC-001] Given tags on a feature, scenarios and examples, When parsed, Then each requirement tag is a citation', () => {
      expect(parseFeatureCitations(FEATURE, 'f.feature').map(c => [c.id, c.kind, c.title])).toEqual([
        ['ZZZ-001', 'feature', 'Keeping sources safe'],
        ['ZZZ-002', 'scenario', 'Index a folder'],
        ['ZZZ-003', 'scenario', 'Space for <n>'],
        ['ZZZ-004', 'scenario', 'Space for <n>']
      ])
    })

    it('[TRC-002] Given requirement IDs in step text, comments and doc strings, When parsed, Then they are not counted', () => {
      const ids = parseFeatureCitations(FEATURE, 'f.feature').map(c => c.id)
      expect(ids).not.toContain('ZZZ-008')
      expect(ids).not.toContain('ZZZ-009')
      expect(ids).not.toContain('ZZZ-010')
    })

    it('[TRC-002] Given tags followed by a step instead of a scenario, When parsed, Then the tags are dropped', () => {
      expect(parseFeatureCitations('Feature: x\n  @ZZZ-001\n  Given a step\n  Scenario: y', 'f.feature')).toEqual([])
    })
  })

  describe('coverage report', () => {
    const reqs = [
      req('ZZZ-001', 'Ubiquitous', 'The system shall a.', 'specs/a.md'),
      req('ZZZ-002', 'Event', 'When x, the system shall b.', 'specs/a.md'),
      req('ZZZ-003', 'Ubiquitous', 'The system shall c.', 'specs/b.md')
    ]
    const cites = [
      citing('[ZZZ-001] one'), citing('[ZZZ-001] two'), { ...citing('three', 'ZZZ-001'), file: 'b.test.ts' },
      citing('[ZZZ-003] one', 'ZZZ-003')
    ]
    const report = trace(reqs, cites)

    it('[TRC-003] Given citations across specs, When summarised, Then each spec shows cited of total and each requirement its test count', () => {
      expect(summariseBySpec(report)).toEqual([
        {
          source: 'specs/a.md', cited: 1, total: 2, requirements: [
            { id: 'ZZZ-001', pattern: 'Ubiquitous', tests: 3, files: ['a.test.ts', 'b.test.ts'] },
            { id: 'ZZZ-002', pattern: 'Event', tests: 0, files: [] }
          ]
        },
        { source: 'specs/b.md', cited: 1, total: 1, requirements: [{ id: 'ZZZ-003', pattern: 'Ubiquitous', tests: 1, files: ['a.test.ts'] }] }
      ])
      expect(formatReport(report)).toContain('specs/a.md: 1/2 cited')
      expect(formatReport(report)).toContain('specs/b.md: 1/1 cited, 1 by a single test')
    })

    it('[TRC-004] Given a report, When written as JSON, Then it round-trips with the totals, failures and per-spec counts', () => {
      const json = JSON.parse(JSON.stringify(toJson(report)))
      expect(json).toMatchObject({ ok: false, requirements: 3, cited: 2, failures: { uncited: [{ id: 'ZZZ-002', source: 'specs/a.md' }] } })
      expect(json.specs[0].requirements[0]).toEqual({ id: 'ZZZ-001', pattern: 'Ubiquitous', tests: 3, files: ['a.test.ts', 'b.test.ts'] })
    })

    it('[TRC-005] Given a report, When summarised for GitHub, Then it is a markdown table per spec with the failures listed', () => {
      const md = formatMarkdown(report)
      expect(md).toMatch(/^## EARS traceability FAILED/)
      expect(md).toContain('| specs/a.md | 1/2 | 0 / 3 |')
      expect(md).toContain('| specs/b.md | 1/1 | 1 / 1 |')
      expect(md).toContain('- `UNCITED ZZZ-002 (specs/a.md) has no test naming [ZZZ-002]`')
      const ok = formatMarkdown(trace([reqs[2]], [cites[3]]))
      expect(ok).toMatch(/^## EARS traceability passed/)
      expect(ok).not.toContain('Failures')
    })
  })

  describe('spec folders', () => {
    it('[TRC-006] Given a spec folder from 009 on with no requirements.md, When checked, Then the check fails and names it', () => {
      const folders = [
        { name: '001-universal-observatory', hasRequirements: false },
        { name: '009-baseline', hasRequirements: true },
        { name: '031-later', hasRequirements: false },
        { name: '010-missing', hasRequirements: false },
        { name: 'notes', hasRequirements: false }
      ]
      expect(checkSpecFolders(folders)).toEqual(['010-missing', '031-later'])
      const report = trace([], [], folders)
      expect(passes(report)).toBe(false)
      expect(formatReport(report)).toContain('NOSPEC    specs/010-missing/ has no requirements.md')
    })
  })

  describe('Unwanted requirements need a failure test', () => {
    const unwanted = req('ZZZ-001', 'Unwanted', 'If a file cannot be parsed, then the system shall quarantine it.')

    it.each([
      'Given a corrupt file, When scanned, Then it is quarantined',
      'Given a bad header, When parsed, Then the scan does not stop',
      'Given an unreadable file, When parsed, Then it is rejected',
      'Given a file, When the read throws, Then the error is kept'
    ])('[TRC-007] Given an Unwanted requirement cited by "%s", When traced, Then it passes', title => {
      expect(trace([unwanted], [citing(title)]).unwantedUntested).toEqual([])
    })

    it('[TRC-007] Given an Unwanted requirement cited only by a happy-path title, When traced, Then it fails and names the requirement', () => {
      const report = trace([unwanted], [citing('[ZZZ-001] Given a good file, When parsed, Then its headers are read'), citing('notably fine')])
      expect(report.unwantedUntested.map(r => r.id)).toEqual(['ZZZ-001'])
      expect(passes(report)).toBe(false)
      expect(formatReport(report)).toMatch(/UNWANTED {2}ZZZ-001 .* no citing test title names the failure/)
    })

    it('[TRC-007] Given an Unwanted requirement cited by a Gherkin scenario, When traced, Then it passes; a feature tag alone is not enough', () => {
      const scenario: Citation = { id: 'ZZZ-001', file: 'f.feature', title: 'A good file', kind: 'scenario' }
      expect(trace([unwanted], [scenario]).unwantedUntested).toEqual([])
      expect(trace([unwanted], [{ ...scenario, kind: 'feature' }]).unwantedUntested).toHaveLength(1)
    })

    it('[TRC-007] Given other patterns cited by happy-path titles, When traced, Then the failure-word rule does not apply', () => {
      expect(trace([req('ZZZ-001', 'Ubiquitous', 'The system shall a.')], [citing('works')]).unwantedUntested).toEqual([])
    })
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
      const report = trace([req('ZZZ-001', 'Event', 'The system shall index folders.')], parseCitations(titled('ZZZ-001'), 'a.test.ts'))
      expect(report.patternErrors).toHaveLength(1)
      expect(passes(report)).toBe(false)
    })
  })
})
