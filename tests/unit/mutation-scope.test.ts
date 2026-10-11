import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { score, summarise } from '../../scripts/mutation/summary.mjs'
import { DEFAULT_BREAK, breakThreshold, changedTargets, isMutable, listMutable } from '../../scripts/mutation/scope.mjs'

const root = path.resolve(__dirname, '../..')

describe('mutation gate scope', () => {
  it('[MUT-001] Given core source files, When checked, Then domain and application rules are mutable', () => {
    expect(isMutable('packages/domain/src/stacking-readiness.ts')).toBe(true)
    expect(isMutable('packages/application/src/use-cases/queue-jobs.ts')).toBe(true)
    expect(isMutable('packages\\domain\\src\\ingest.ts')).toBe(true)
  })

  it('[MUT-001] Given barrels, interface-only ports, tests and non-core files, When checked, Then none is mutable', () => {
    expect(isMutable('packages/domain/src/index.ts')).toBe(false)
    expect(isMutable('packages/application/src/index.ts')).toBe(false)
    expect(isMutable('packages/application/src/ports/clock.ts')).toBe(false)
    expect(isMutable('packages/domain/test/ingest.test.ts')).toBe(false)
    expect(isMutable('packages/testkit/src/frames.ts')).toBe(false)
    expect(isMutable('src/main/composition.ts')).toBe(false)
    expect(isMutable('packages/domain/src/types.d.ts')).toBe(false)
    expect(isMutable('packages/domain/src/notes.md')).toBe(false)
  })

  it('[MUT-001] Given a port that holds runtime code, When checked, Then it is mutable', () => {
    expect(isMutable('packages/application/src/ports/archive.ts')).toBe(true)
  })

  it('[MUT-001] Given the repository, When the mutable files are listed, Then every core source file but the barrels and pure ports is there', () => {
    const files = listMutable(root)
    expect(files).toContain('packages/domain/src/siril-space.ts')
    expect(files).toContain('packages/application/src/ports/archive.ts')
    expect(files.some(f => f.endsWith('/index.ts'))).toBe(false)
    const domain = fs.readdirSync(path.join(root, 'packages/domain/src')).filter(f => f.endsWith('.ts') && f !== 'index.ts')
    expect(files.filter(f => f.startsWith('packages/domain/src/'))).toHaveLength(domain.length)
    expect(files).toEqual([...files].sort())
  })

  it('[MUT-002] Given git output with changed, repeated, deleted and non-core paths, When targeted, Then only existing mutable core files remain, once and sorted', () => {
    const changed = [
      'packages/domain/src/jobs.ts',
      'README.md',
      '',
      'packages/application/src/use-cases/archive-target.ts',
      'packages/domain/src/jobs.ts',
      'packages/domain/src/removed.ts',
      'packages/domain/src/index.ts',
      'packages/domain/test/jobs.test.ts'
    ]
    const exists = (f: string) => f !== 'packages/domain/src/removed.ts'
    expect(changedTargets(changed, exists)).toEqual([
      'packages/application/src/use-cases/archive-target.ts',
      'packages/domain/src/jobs.ts'
    ])
  })

  it('[MUT-003] Given only non-core changes, When targeted, Then the run is skipped with nothing to mutate', () => {
    expect(changedTargets(['README.md', 'src/main/composition.ts', 'packages/domain/test/x.test.ts'], () => true)).toEqual([])
  })

  it('[MUT-004] Given the Stryker config, When loaded, Then it fails the run below the gate threshold', async () => {
    const configPath: string = pathToFileURL(path.join(root, 'stryker.config.mjs')).href
    const config = (await import(configPath)).default
    expect(config.thresholds.break).toBe(breakThreshold())
    expect(config.thresholds.break).toBeGreaterThan(0)
    expect(config.thresholds.low).toBeLessThanOrEqual(config.thresholds.high)
    expect(config.mutate).toEqual(listMutable(root))
  })

  it('[MUT-004] Given a MUTATION_BREAK override, When the threshold is read, Then the override wins', () => {
    expect(breakThreshold({ MUTATION_BREAK: '65' })).toBe(65)
    expect(breakThreshold({ MUTATION_BREAK: '0' })).toBe(0)
    expect(breakThreshold({ MUTATION_BREAK: '100' })).toBe(100)
    expect(breakThreshold({})).toBe(DEFAULT_BREAK)
  })

  it('[MUT-005] Given an empty or invalid MUTATION_BREAK, When the threshold is read, Then the default applies', () => {
    for (const bad of ['', '  ', 'eighty', '-1', '101', 'NaN']) {
      expect(breakThreshold({ MUTATION_BREAK: bad })).toBe(DEFAULT_BREAK)
    }
  })

  const mutants = (...statuses: string[]) => statuses.map(status => ({ status }))

  it('[MUT-006] Given mutants of every status, When scored, Then only killed and timed-out count as detected and only valid mutants count at all', () => {
    expect(score(mutants('Killed', 'Timeout', 'Survived', 'NoCoverage', 'Ignored', 'CompileError', 'RuntimeError'))).toEqual({
      detected: 2, survived: 2, valid: 4, score: 50
    })
    expect(score(mutants('Ignored')).score).toBeNull()
  })

  it('[MUT-006] Given a report, When summarised, Then it gives the overall score, each package and the files with the most survivors first', () => {
    const md = summarise({
      files: {
        'packages/domain/src/a.ts': { mutants: mutants('Killed', 'Killed', 'Killed', 'Survived') },
        'packages/domain/src/b.ts': { mutants: mutants('Killed') },
        'packages/application/src/use-cases/c.ts': { mutants: mutants('Survived', 'NoCoverage', 'Killed', 'Killed') }
      }
    })
    expect(md).toContain('## Mutation score: 66.67%')
    expect(md).toContain('6 of 9 valid mutants killed, 3 survived or not covered.')
    expect(md).toContain('| application | 50.00% | 2 | 2 |')
    expect(md).toContain('| domain | 80.00% | 4 | 1 |')
    expect(md.indexOf('use-cases/c.ts')).toBeLessThan(md.indexOf('domain/src/a.ts'))
    expect(md).not.toContain('src/b.ts')
  })

  it('[MUT-006] Given a report with no valid mutants, When summarised, Then the score reads n/a and no file table is written', () => {
    const md = summarise({ files: { 'packages/domain/src/a.ts': { mutants: mutants('Ignored') } } })
    expect(md).toContain('## Mutation score: n/a')
    expect(md).not.toContain('| File |')
  })
})
