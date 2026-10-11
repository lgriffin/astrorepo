import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { importsOf, rel, root, sourceFiles } from './source-graph'
import recorded from './legacy-ratchet.json'

/**
 * The strangler only moves one way: legacy code may shrink, never grow. Each count is compared with
 * the number recorded in legacy-ratchet.json; a rise fails, and so does a fall until the recorded
 * number is lowered to match, so the next change cannot quietly win the ground back.
 */

interface LegacyCounts {
  /** Calls to the database singleton outside the connection module. */
  getSqliteCalls: number
  /** Files in src/main/services. */
  legacyServices: number
  /** Legacy service functions the IPC handlers call directly. */
  handlerLegacyCalls: number
}

function measure(base = root): LegacyCounts {
  const main = path.join(base, 'src', 'main')
  const getSqliteCalls = sourceFiles(main)
    .filter(f => rel(f) !== 'src/main/db/connection.ts')
    .reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(/\bgetSqlite\(/g)?.length ?? 0), 0)
  const legacyServices = sourceFiles(path.join(main, 'services')).length
  const handlers = sourceFiles(path.join(main, 'ipc'))
  const handlerLegacyCalls = handlers
    .flatMap(f => importsOf(f))
    .filter(i => i.spec.startsWith('../services/'))
    .reduce((n, i) => n + i.names.length, 0)
  return { getSqliteCalls, legacyServices, handlerLegacyCalls }
}

/** What to tell a contributor about each count that moved. */
function compare(now: LegacyCounts, before: LegacyCounts): string[] {
  return (Object.keys(before) as (keyof LegacyCounts)[]).flatMap(key => {
    if (now[key] > before[key]) return [`${key} rose from ${before[key]} to ${now[key]}: put new logic in packages/ behind a port instead`]
    if (now[key] < before[key]) return [`${key} fell from ${before[key]} to ${now[key]}: lower it in tests/architecture/legacy-ratchet.json to lock the gain in`]
    return []
  })
}

describe('Legacy ratchet', () => {
  it('[HEX-008] [HEX-009] Given the current source, When legacy code is counted, Then every count matches the recorded ratchet', () => {
    expect(compare(measure(), recorded)).toEqual([])
  })

  it('[HEX-008] Given a change that adds a getSqlite call, When compared, Then the check fails and names the count that rose', () => {
    const before = { getSqliteCalls: 10, legacyServices: 5, handlerLegacyCalls: 20 }
    expect(compare({ ...before, getSqliteCalls: 11 }, before)).toEqual([
      'getSqliteCalls rose from 10 to 11: put new logic in packages/ behind a port instead'
    ])
  })

  it('[HEX-009] Given a change that moves a service into the core, When compared, Then the check asks for the ratchet to be lowered', () => {
    const before = { getSqliteCalls: 10, legacyServices: 5, handlerLegacyCalls: 20 }
    expect(compare({ ...before, legacyServices: 4, handlerLegacyCalls: 17 }, before)).toEqual([
      'legacyServices fell from 5 to 4: lower it in tests/architecture/legacy-ratchet.json to lock the gain in',
      'handlerLegacyCalls fell from 20 to 17: lower it in tests/architecture/legacy-ratchet.json to lock the gain in'
    ])
  })
})
