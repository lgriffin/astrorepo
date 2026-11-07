/**
 * What `npm run doctor` checks and how it says to fix each problem (spec 045, DEV-004).
 * Pure: the probes in doctor.ts gather the facts.
 */
export interface DoctorFacts {
  nodeVersion: string
  /** The major version .nvmrc names. */
  wantedNode: string
  /** undefined when the Node build of better-sqlite3 loads, else the error. */
  nodeSqliteError?: string
  electronInstalled: boolean
  /** 'ok', or the error Electron gave loading the same better-sqlite3 build the tests use. */
  electronSqlite: 'ok' | { error: string }
  hooksInstalled: boolean
}

export interface DoctorCheck {
  name: string
  ok: boolean
  detail: string
  fix?: string
}

export function majorOf(version: string): number {
  return Number(version.replace(/^v/, '').split('.')[0])
}

export function diagnose(f: DoctorFacts): DoctorCheck[] {
  const nodeOk = majorOf(f.nodeVersion) >= majorOf(f.wantedNode)
  const checks: DoctorCheck[] = [
    nodeOk
      ? { name: 'Node', ok: true, detail: `Node ${f.nodeVersion} (.nvmrc names ${f.wantedNode}, which CI uses)` }
      : {
          name: 'Node', ok: false,
          detail: `Node ${f.nodeVersion} is too old; this repo needs Node ${f.wantedNode} or later`,
          fix: `Install Node ${f.wantedNode} LTS (\`nvm install ${f.wantedNode}\` then \`nvm use ${f.wantedNode}\`, or nodejs.org), then \`npm ci\``
        },
    f.nodeSqliteError === undefined
      ? { name: 'better-sqlite3 for Node', ok: true, detail: 'Loads, so the tests can open databases' }
      : {
          name: 'better-sqlite3 for Node', ok: false,
          detail: `Does not load: ${firstLine(f.nodeSqliteError)}`,
          fix: '`npm rebuild better-sqlite3` (Windows needs the Visual Studio C++ build tools if no prebuilt binary matches)'
        },
    f.electronInstalled
      ? { name: 'Electron', ok: true, detail: 'The Electron binary is installed' }
      : {
          name: 'Electron', ok: false,
          detail: 'The Electron binary is missing (installs run with --ignore-scripts skip it)',
          fix: '`node node_modules/electron/install.js`'
        }
  ]
  if (f.electronInstalled) {
    const e = f.electronSqlite
    checks.push(e === 'ok'
      ? { name: 'better-sqlite3 for Electron', ok: true, detail: 'The same build loads in Electron, so `npm run dev` can open the database' }
      : {
          name: 'better-sqlite3 for Electron', ok: false,
          detail: `Does not load in Electron: ${firstLine(e.error)}`,
          fix: '`npm rebuild better-sqlite3`'
        })
  }
  checks.push(f.hooksInstalled
    ? { name: 'Git hooks', ok: true, detail: 'The pre-commit lint runs on staged files' }
    : { name: 'Git hooks', ok: false, detail: 'The pre-commit hook is not installed', fix: '`npx husky`' })
  return checks
}

/** The line that says what went wrong: the first naming an error, else the first with text. */
function firstLine(text: string): string {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  return lines.find(l => /error/i.test(l)) ?? lines[0] ?? text
}

/** The report doctor prints, one line per check and a fix under each problem. */
export function report(checks: DoctorCheck[]): string {
  const lines = checks.flatMap(c => c.ok
    ? [`  ok    ${c.name}: ${c.detail}`]
    : [`  FIX   ${c.name}: ${c.detail}`, `        ${c.fix}`])
  const problems = checks.filter(c => !c.ok).length
  lines.push('', problems === 0 ? 'All set: `npm run dev` starts the app and `npm run verify` runs every gate.' : `${problems} to fix.`)
  return lines.join('\n')
}
