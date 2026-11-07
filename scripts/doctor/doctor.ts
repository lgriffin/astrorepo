/**
 * `npm run doctor`: checks this checkout can test and run the app, and says how to fix what it finds (DEV-004).
 */
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { diagnose, report, type DoctorFacts } from './checks'

const root = path.resolve(__dirname, '..', '..')

function nodeSqliteError(): string | undefined {
  const r = spawnSync(process.execPath, ['-e', "require('better-sqlite3')(':memory:').close()"], { cwd: root, encoding: 'utf8' })
  return r.status === 0 ? undefined : (r.stderr || String(r.error))
}

function electronBinary(): string | undefined {
  try {
    const p = fs.readFileSync(path.join(root, 'node_modules', 'electron', 'path.txt'), 'utf8').trim()
    const bin = path.join(root, 'node_modules', 'electron', 'dist', p)
    return fs.existsSync(bin) ? bin : undefined
  } catch {
    return undefined
  }
}

/** Loads better-sqlite3 in Electron's own Node: the one Node-API build serves both (DEV-001). */
function electronSqlite(bin: string): DoctorFacts['electronSqlite'] {
  const r = spawnSync(bin, ['-e', "require('better-sqlite3')(':memory:').close()"], { cwd: root, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  return r.status === 0 ? 'ok' : { error: r.stderr || String(r.error) }
}

/** The pre-commit hook Git will run: in core.hooksPath (relative to the checkout, or absolute) when set. */
function hooksInstalled(): boolean {
  const r = spawnSync('git', ['config', 'core.hooksPath'], { cwd: root, encoding: 'utf8' })
  const configured = r.status === 0 ? r.stdout.trim() : ''
  return configured !== '' && fs.existsSync(path.resolve(root, configured, 'pre-commit'))
}

const bin = electronBinary()
const facts: DoctorFacts = {
  nodeVersion: process.version,
  wantedNode: fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim(),
  nodeSqliteError: nodeSqliteError(),
  electronInstalled: bin !== undefined,
  electronSqlite: bin ? electronSqlite(bin) : 'ok',
  hooksInstalled: hooksInstalled()
}
const checks = diagnose(facts)
console.log(`astrorepo doctor\n\n${report(checks)}`)
process.exitCode = checks.every(c => c.ok) ? 0 : 1
