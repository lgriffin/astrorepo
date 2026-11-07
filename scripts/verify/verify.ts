/**
 * `npm run verify`: every gate CI runs before the build, in one command (DEV-005).
 * `npm run verify -- --no-test` skips the tests for a quick check.
 */
import { spawn } from 'child_process'
import path from 'path'
import { QUICK_GATES, TEST_GATE, runGates, summary, type Gate, type GateResult } from './gates'

const root = path.resolve(__dirname, '..', '..')

function run(gate: Gate): Promise<GateResult> {
  const started = Date.now()
  return new Promise(resolve => {
    const child = spawn(gate.command, { cwd: root, shell: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } })
    let output = ''
    child.stdout.on('data', d => { output += d })
    child.stderr.on('data', d => { output += d })
    child.on('close', code => {
      const r = { name: gate.name, ok: code === 0, ms: Date.now() - started, output }
      console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${gate.name}`)
      resolve(r)
    })
  })
}

const last = process.argv.includes('--no-test') ? [] : [TEST_GATE]
console.log(`astrorepo verify: ${[...QUICK_GATES, ...last].map(g => g.name).join(', ')}\n`)
runGates(QUICK_GATES, last, run).then(({ ok, results }) => {
  console.log(`\n${summary(results)}`)
  process.exitCode = ok ? 0 : 1
})
