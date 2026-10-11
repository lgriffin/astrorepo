import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { describe, it, expect } from 'vitest'
import {
  compileFeature, DataTable, defineSteps, registerFeature, runFeature, runFeatureSource, runScenario, StepDefinitionError, type TestApi
} from '@astro/testkit/bdd'

interface Log {
  log: string[]
}

/** Records the suites and tests the runner registers, without running them. */
function recorder(): TestApi & { tree: string[] } {
  const tree: string[] = []
  let depth = 0
  return {
    tree,
    describe: (title, body) => {
      tree.push(`${'  '.repeat(depth)}describe ${title}`)
      depth++
      body()
      depth--
    },
    it: title => { tree.push(`${'  '.repeat(depth)}it ${title}`) }
  }
}

const logging = () => defineSteps<Log>(() => ({ log: [] }), ({ Given, When, Then }) => {
  Given('a folder {string}', (w, name: string) => { w.log.push(`folder ${name}`) })
  Given('{int} lights of {word}', (w, n: number, target: string) => { w.log.push(`${n} ${target}`) })
  When('it is scanned', async w => {
    await new Promise(r => setTimeout(r, 5))
    w.log.push('scanned')
  })
  When('the frames are:', (w, table: DataTable) => { w.log.push(JSON.stringify(table.hashes())) })
  When('the note says:', (w, doc: string) => { w.log.push(`note ${doc}`) })
  Then('it fails with {string}', (_w, message: string) => { throw new Error(message) })
  Then('nothing is moved', w => { w.log.push('checked') })
})

/** The error a scenario fails with; fails the test if it passes. */
const failure = (run: Promise<unknown>): Promise<Error> =>
  run.then(() => { throw new Error('expected the scenario to fail') }, (e: unknown) => e as Error)

const only = (source: string, i = 0) => {
  const f = compileFeature(source, 'inline.feature')
  return [...f.scenarios, ...f.rules.flatMap(r => r.scenarios)][i]
}

describe('BDD runner', () => {
  it('[TRC-010] Given a feature with tags, a rule and an outline, When registered, Then there is one suite per feature and rule and one test per scenario and example row', () => {
    const api = recorder()
    registerFeature(compileFeature([
      '@ZZZ-001 @slow',
      'Feature: Ingest',
      '  @ZZZ-002 @wip',
      '  Scenario: Index a folder',
      '    Given a folder "M31"',
      '  @ZZZ-004',
      '  Rule: Duplicates',
      '    @ZZZ-003',
      '    Scenario Outline: <n> copies',
      '      Given <n> lights of M31',
      '      @ZZZ-005',
      '      Examples:',
      '        | n |',
      '        | 2 |',
      '        | 3 |'
    ].join('\n'), 'inline.feature'), logging(), api)
    expect(api.tree).toEqual([
      'describe [ZZZ-001] Ingest',
      '  it [ZZZ-002] Index a folder',
      '  describe [ZZZ-004] Duplicates',
      '    it [ZZZ-003] [ZZZ-005] 2 copies (n: 2)',
      '    it [ZZZ-003] [ZZZ-005] 3 copies (n: 3)'
    ])
  })

  it('[TRC-010] Given a .feature file path or URL, When run, Then its scenarios are registered under its relative path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdd-'))
    const file = path.join(dir, 'x.feature')
    fs.writeFileSync(file, 'Feature: From disk\n  Scenario: One\n    Given a folder "A"\n')
    try {
      for (const ref of [file, pathToFileURL(file)]) {
        const api = recorder()
        const feature = runFeature(ref, logging(), api)
        expect(feature.uri).toBe(path.relative(process.cwd(), file).split(path.sep).join('/'))
        expect(api.tree).toEqual(['describe From disk', '  it One'])
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('[TRC-011] Given a Background, When each scenario runs, Then the background steps run first in a fresh world', async () => {
    const f = compileFeature([
      'Feature: x',
      '  Background:',
      '    Given a folder "D:/Seestar"',
      '  Scenario: one',
      '    When it is scanned',
      '  Scenario: two',
      '    Then nothing is moved'
    ].join('\n'), 'inline.feature')
    const steps = logging()
    expect((await runScenario(f.scenarios[0], steps)).log).toEqual(['folder D:/Seestar', 'scanned'])
    expect((await runScenario(f.scenarios[1], steps)).log).toEqual(['folder D:/Seestar', 'checked'])
  })

  it('[TRC-012] Given a Scenario Outline, When each row runs, Then its values fill the name, steps, tables and doc strings', async () => {
    const f = compileFeature([
      'Feature: x',
      '  Scenario Outline: <count> of <target>',
      '    Given <count> lights of <target>',
      '    When the frames are:',
      '      | target   | subs    |',
      '      | <target> | <count> |',
      '    And the note says:',
      '      """',
      '      shoot <target> again',
      '      """',
      '    Examples:',
      '      | count | target |',
      '      | 120   | M81    |',
      '      | 40    | NGC891 |'
    ].join('\n'), 'inline.feature')
    expect(f.scenarios.map(s => s.name)).toEqual(['120 of M81 (count: 120, target: M81)', '40 of NGC891 (count: 40, target: NGC891)'])
    expect((await runScenario(f.scenarios[1], logging())).log).toEqual([
      '40 NGC891', '[{"target":"NGC891","subs":"40"}]', 'note shoot NGC891 again'
    ])
  })

  it('[TRC-013] Given data tables and doc strings, When passed to a step, Then they come after the parameters and read as rows, hashes and pairs', async () => {
    const seen: unknown[] = []
    const steps = defineSteps(() => ({}), ({ Given, defineParameterType }) => {
      defineParameterType({ name: 'filter', regexp: /Ha|OIII|SII/, transform: s => s.toLowerCase() })
      Given('{filter} subs of {word}:', (_w, filter: string, target: string, table: DataTable) => {
        seen.push(filter, target, table.raw(), table.rows(), table.rowsHash())
      })
      Given('a script for {word}:', (_w, target: string, doc: string) => { seen.push(target, doc) })
    })
    await runScenario(only([
      'Feature: x',
      '  Scenario: y',
      '    Given OIII subs of M31:',
      '      | night | 2026-09-01 |',
      '      | hours | 2.5        |',
      '    And a script for M31:',
      '      """',
      '      requires 1.2.0',
      '      stack r_pp_light',
      '      """'
    ].join('\n')), steps)
    expect(seen).toEqual([
      'oiii', 'M31', [['night', '2026-09-01'], ['hours', '2.5']], [['hours', '2.5']], { night: '2026-09-01', hours: '2.5' },
      'M31', 'requires 1.2.0\nstack r_pp_light'
    ])
    expect(new DataTable([]).hashes()).toEqual([])
    expect(() => new DataTable([['a', 'b', 'c']]).rowsHash()).toThrow(/exactly two columns/)
  })

  it('[TRC-014] Given two scenarios and async steps, When run, Then each gets its own World and the steps finish in order', async () => {
    let made = 0
    const steps = defineSteps(() => { made++; return { n: 0, order: [] as string[] } }, ({ Given, When }) => {
      Given('a slow step', async w => { await new Promise(r => setTimeout(r, 10)); w.order.push('slow'); w.n++ })
      When('a quick step', w => { w.order.push('quick'); w.n++ })
    })
    const scenario = only('Feature: x\n  Scenario: y\n    Given a slow step\n    When a quick step')
    const a = await runScenario(scenario, steps)
    const b = await runScenario(scenario, steps)
    expect(made).toBe(2)
    expect(a).not.toBe(b)
    expect(a).toEqual({ n: 2, order: ['slow', 'quick'] })
    expect(b.n).toBe(2)
  })

  it('[TRC-014] Given an async World factory, When a scenario runs, Then the steps see the resolved World', async () => {
    const steps = defineSteps(async () => ({ ready: true }), ({ Then }) => {
      Then('the world is ready', w => { expect(w.ready).toBe(true) })
    })
    expect(await runScenario(only('Feature: x\n  Scenario: y\n    Then the world is ready'), steps)).toEqual({ ready: true })
  })

  it('[TRC-015] Given a step with no definition, When the scenario runs, Then it fails before any step with the step and a snippet to add', async () => {
    let made = 0
    const steps = defineSteps(() => { made++; return { log: [] as string[] } }, ({ Given }) => {
      Given('a folder {string}', w => { w.log.push('ran') })
    })
    const scenario = only([
      'Feature: x',
      '  Scenario: y',
      '    Given a folder "A"',
      '    When I stack 120 lights of "M31" in it',
      '    Then the archive holds:',
      '      | a |'
    ].join('\n'))
    const error = await failure(runScenario(scenario, steps))
    expect(error).toBeInstanceOf(StepDefinitionError)
    expect(made).toBe(0)
    expect(error.message).toContain('Undefined step at inline.feature:4: When I stack 120 lights of "M31" in it')
    expect(error.message).toContain("When('I stack {int} lights of {string} in it', (world, int, string) => {")
    expect(error.message).toContain("Then('the archive holds:', (world, table) => {")
  })

  it('[TRC-015] Given a step with an apostrophe and a doc string, When it is undefined, Then the snippet escapes the quote and takes the doc string', async () => {
    const error = await failure(runScenario(only('Feature: x\n  Scenario: y\n    Given Leigh\'s notes:\n      """\n      hi\n      """'), logging()))
    expect(error.message).toContain("Given('Leigh\\'s notes:', (world, docString) => {")
  })

  it('[TRC-016] Given a step two definitions match, When the scenario runs, Then it fails and lists both definitions with where they are', async () => {
    const steps = defineSteps(() => ({}), ({ Given }) => {
      Given('{int} lights', () => {})
      Given(/^(\d+) lights$/, () => {})
    })
    const error = await failure(runScenario(only('Feature: x\n  Scenario: y\n    Given 3 lights'), steps))
    expect(error).toBeInstanceOf(StepDefinitionError)
    expect(error.message).toContain('Ambiguous step at inline.feature:3: Given 3 lights')
    expect(error.message).toContain("Given('{int} lights') at ")
    expect(error.message).toContain("Given('^(\\d+) lights$') at ")
    expect(error.message.match(/bdd\.test\.ts:\d+/g)).toHaveLength(2)
  })

  it('[TRC-017] Given And and But steps, When compiled and matched, Then they take the keyword before them and match any definition', async () => {
    const scenario = only([
      'Feature: x',
      '  Scenario: y',
      '    Given a folder "A"',
      '    And 3 lights of M31',
      '    When it is scanned',
      '    But it is scanned',
      '    Then nothing is moved',
      '    And nothing is moved',
      '    * nothing is moved'
    ].join('\n'))
    expect(scenario.steps.map(s => `${s.written}/${s.keyword}`)).toEqual([
      'Given/Given', 'And/Given', 'When/When', 'But/When', 'Then/Then', 'And/Then', '*/Then'
    ])
    expect((await runScenario(scenario, logging())).log).toEqual(['folder A', '3 M31', 'scanned', 'scanned', 'checked', 'checked', 'checked'])
    const missing = await failure(runScenario(only('Feature: x\n  Scenario: y\n    Then nothing is moved\n    But nothing is lost'), logging()))
    expect(missing.message).toContain("Then('nothing is lost', (world) => {")
  })

  it('[TRC-018] Given a failing step, When the scenario runs, Then it stops there, names the step and line, and lists the skipped steps', async () => {
    const steps = logging()
    let world: Log | undefined
    const tracking = defineSteps<Log>(() => (world = { log: [] }), api => {
      for (const d of steps.definitions) api.Given(d.expression.source, d.fn)
    })
    const scenario = only([
      'Feature: x',
      '  Scenario: y',
      '    Given a folder "A"',
      '    Then it fails with "disk full"',
      '    And nothing is moved'
    ].join('\n'))
    const error = await failure(runScenario(scenario, tracking))
    expect(error.message).toBe('Step failed at inline.feature:4: Then it fails with "disk full"\n  skipped: And nothing is moved\n\ndisk full')
    expect(world?.log).toEqual(['folder A'])
  })

  it('[TRC-018] Given a step that throws a non-Error, When the scenario runs, Then the failure still names the step', async () => {
    const steps = defineSteps(() => ({}), ({ Given }) => { Given('a bad step', () => { throw 'nope' }) })
    await expect(runScenario(only('Feature: x\n  Scenario: y\n    Given a bad step'), steps))
      .rejects.toThrow('Step failed at inline.feature:3: Given a bad step\n\nnope')
  })

  it('[TRC-019] Given a feature file that cannot be parsed, When compiled, Then it fails with the file, line and parse error', () => {
    expect(() => compileFeature('Feature: x\n  Scenario: y\n    Given a\n  Nonsense here\n', 'bad.feature'))
      .toThrow(/Cannot parse feature file bad\.feature:\n {2}bad\.feature:4: .*Nonsense here/)
    expect(() => compileFeature('# only a comment\n', 'empty.feature')).toThrow('Feature file empty.feature has no Feature')
  })
})

// The runner registering real vitest tests: these run as tests of their own.
runFeatureSource([
  'Feature: The runner inside vitest',
  '  Background:',
  '    Given a folder "D:/Seestar/M31"',
  '  Scenario: a scan is logged',
  '    When it is scanned',
  '    Then nothing is moved',
  '    And the log reads "folder D:/Seestar/M31, scanned, checked"'
].join('\n'), 'inline/runner.feature', defineSteps<Log>(() => ({ log: [] }), api => {
  for (const d of logging().definitions) api.Given(d.expression.source, d.fn)
  api.Then('the log reads {string}', (w, s: string) => { expect(w.log.join(', ')).toBe(s) })
}))
