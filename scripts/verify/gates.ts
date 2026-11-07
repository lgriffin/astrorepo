/**
 * The gates `npm run verify` runs (spec 045, DEV-005): the quick ones side by side, then the tests,
 * which use every core themselves. Every gate runs even when an earlier one fails, so one run
 * shows everything to fix.
 */
export interface Gate {
  name: string
  command: string
}

export interface GateResult {
  name: string
  ok: boolean
  ms: number
  output: string
}

export type RunGate = (gate: Gate) => Promise<GateResult>

export const QUICK_GATES: Gate[] = [
  { name: 'lint', command: 'npm run -s lint' },
  { name: 'typecheck', command: 'npm run -s typecheck' },
  { name: 'typecheck:tests', command: 'npm run -s typecheck:tests' },
  { name: 'ears', command: 'npm run -s ears' }
]

export const TEST_GATE: Gate = { name: 'test', command: 'npm test --silent' }

export async function runGates(quick: Gate[], last: Gate[], run: RunGate): Promise<{ ok: boolean; results: GateResult[] }> {
  const first = await Promise.all(quick.map(run))
  const rest: GateResult[] = []
  for (const g of last) rest.push(await run(g))
  const results = [...first, ...rest]
  return { ok: results.every(r => r.ok), results }
}

export function summary(results: GateResult[]): string {
  const failed = results.filter(r => !r.ok)
  const lines = failed.flatMap(r => [`--- ${r.name} failed ---`, r.output.trimEnd(), ''])
  for (const r of results) lines.push(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(16)} ${(r.ms / 1000).toFixed(1)} s`)
  lines.push('', failed.length === 0 ? 'Every gate passed.' : `${failed.length} gate${failed.length === 1 ? '' : 's'} failed: ${failed.map(r => r.name).join(', ')}.`)
  return lines.join('\n')
}
