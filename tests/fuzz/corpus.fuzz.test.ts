import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { BINARY_CONTRACTS, TEXT_CONTRACTS } from './contracts'
import { fuzzParams } from './fuzz-config'

/**
 * The regression corpus: every input that once broke a parser, in tests/fuzz/corpus/<target>/,
 * replayed against the same contract the fuzzer checks. A .txt file is text; anything else is bytes.
 */
const CORPUS = path.join(__dirname, 'corpus')
const ROOT = path.join(__dirname, '..', '..')

const cases = fs
  .readdirSync(CORPUS, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .flatMap(d => fs.readdirSync(path.join(CORPUS, d.name)).sort().map(file => ({ target: d.name, file })))

describe('the fuzz corpus', () => {
  it('[FUZ-007] Given the corpus folders, When they are listed, Then each names a fuzzed parser and holds at least one input', () => {
    const targets = new Set(cases.map(c => c.target))
    expect(targets.size).toBeGreaterThan(0)
    for (const target of targets) expect(target in TEXT_CONTRACTS || target in BINARY_CONTRACTS, target).toBe(true)
  })

  for (const { target, file } of cases) {
    it(`[FUZ-007, FUZ-001, FUZ-002] Given the corpus input ${target}/${file}, When ${target} reads it again, Then it keeps its contract`, async () => {
      const bytes = fs.readFileSync(path.join(CORPUS, target, file))
      const text = TEXT_CONTRACTS[target]
      if (text) text(bytes.toString('utf8'))
      else await BINARY_CONTRACTS[target](new Uint8Array(bytes))
    })
  }
})

describe('replaying a failure', () => {
  it('[FUZ-007] Given a property that fails, When fast-check reports it, Then the report carries the seed and path that replay it and the shrunk input', () => {
    let report = ''
    try {
      fc.assert(fc.property(fc.integer(), n => n < 1000), { ...fuzzParams(), seed: 42 })
    } catch (err) {
      report = (err as Error).message
    }
    expect(report).toMatch(/seed: 42, path: "[\d:]+"/)
    expect(report).toContain('Counterexample: [1000]')
  })

  it('[FUZ-007] Given a seed and path from a report, When the property runs again with them, Then the same input comes back first', () => {
    const first = (seed: number, pathText?: string) => {
      let seen: number[] = []
      fc.assert(fc.property(fc.array(fc.integer()), a => { seen = a; return true }), { seed, numRuns: 1, ...(pathText ? { path: pathText } : {}) })
      return seen
    }
    expect(first(1234)).toEqual(first(1234))
    expect(first(1234, '3')).toEqual(first(1234, '3'))
  })
})

describe('the nightly fuzz run', () => {
  it('[FUZ-008] Given the nightly workflow, When it is read, Then it runs on a schedule and on demand with Node 20, runs the fuzz tests and keeps the log and seeds of a failure', () => {
    const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'fuzz.yml'), 'utf8')
    expect(workflow).toMatch(/schedule:\s*\n\s*- cron: '[^']+'/)
    expect(workflow).toContain('workflow_dispatch')
    expect(workflow).toMatch(/node-version: 20/)
    expect(workflow).toContain('npm ci')
    expect(workflow).toContain('npm run test:fuzz')
    expect(workflow).toMatch(/if: failure\(\)[\s\S]*actions\/upload-artifact/)
  })

  it('[FUZ-008] Given the package scripts, When test:fuzz runs, Then it runs only the fuzz tests with at least 20,000 runs each', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    expect(pkg.scripts['test:fuzz']).toBe('tsx scripts/fuzz.ts')
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'fuzz.ts'), 'utf8')
    const runs = Number(/DEFAULT_RUNS = (\d[\d_]*)/.exec(script)?.[1].replace(/_/g, ''))
    expect(runs).toBeGreaterThanOrEqual(20_000)
    expect(script).toContain("'tests/fuzz'")
  })
})
