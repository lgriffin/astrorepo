import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { bindingFolder, fetchElectronSqlite } from '../../scripts/native/electron-sqlite.mjs'
import { electronSqliteBinding, databaseOpenFailure } from '../../src/main/db/native-binding'
import { diagnose, report, type DoctorFacts } from '../../scripts/doctor/checks'
import { runGates, summary, QUICK_GATES, TEST_GATE, type Gate } from '../../scripts/verify/gates'

const repo = path.resolve(__dirname, '../..')
const versions = { sqliteVersion: '11.10.0', electronVersion: '33.4.11', platform: 'win32', arch: 'x64' }

/** A throwaway checkout with just enough of node_modules for the native script. */
function checkout(withPrebuild = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astrorepo-dx-'))
  const write = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), text)
  }
  write('package.json', '{"name":"x"}')
  write('node_modules/electron/package.json', '{"name":"electron","version":"33.4.11"}')
  write('node_modules/better-sqlite3/package.json', '{"name":"better-sqlite3","version":"11.10.0"}')
  write('node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'node build')
  write('node_modules/better-sqlite3/binding.gyp', '{}')
  write('node_modules/better-sqlite3/src/better_sqlite3.cpp', '')
  if (withPrebuild) write('node_modules/prebuild-install/bin.js', '')
  return root
}

const built = (cwd: string, text: string) => {
  fs.mkdirSync(path.join(cwd, 'build', 'Release'), { recursive: true })
  fs.writeFileSync(path.join(cwd, 'build', 'Release', 'better_sqlite3.node'), text)
}

describe('Electron gets its own better-sqlite3 build (spec 045)', () => {
  it('[DEV-001] Given the app runs in Electron and its build is installed, When the database opens, Then it uses that build', () => {
    const root = path.join('C:', 'repo')
    const want = path.join(bindingFolder(root, versions), 'better_sqlite3.node')
    expect(electronSqliteBinding({ ...versions, root, exists: f => f === want })).toBe(want)
  })

  it('[DEV-001] Given plain Node (tests, the served app), When the database opens, Then the default build is used', () => {
    expect(electronSqliteBinding({ ...versions, electronVersion: undefined, root: '/repo', exists: () => true })).toBeUndefined()
  })

  it('[DEV-001] Given Electron but no Electron build, or a packaged app, When the database opens, Then the default build is used', () => {
    expect(electronSqliteBinding({ ...versions, root: '/repo', exists: () => false })).toBeUndefined()
    expect(electronSqliteBinding({ ...versions, root: '/opt/AstroRepo/resources/app.asar', exists: () => true })).toBeUndefined()
  })

  it('[DEV-002] Given an install, When the Electron build is fetched, Then it lands in its own folder and the Node build is untouched', () => {
    const root = checkout()
    const calls: { args: string[]; cwd: string }[] = []
    const outcome = fetchElectronSqlite({
      root, platform: 'win32', arch: 'x64', env: {}, log: () => {},
      run: (_command, args, cwd) => {
        calls.push({ args, cwd })
        built(cwd, 'electron build')
        return { ok: true, output: '' }
      }
    })
    expect(outcome).toBe('fetched')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual(expect.arrayContaining(['--runtime', 'electron', '--target', '33.4.11', '--platform', 'win32', '--arch', 'x64']))
    expect(calls[0].cwd.startsWith(path.join(root, 'node_modules', '.cache', 'astrorepo-native'))).toBe(true)
    const folder = bindingFolder(root, versions)
    expect(fs.readFileSync(path.join(folder, 'better_sqlite3.node'), 'utf8')).toBe('electron build')
    expect(fs.existsSync(path.join(folder, 'work'))).toBe(false)
    expect(fs.readFileSync(path.join(root, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'), 'utf8')).toBe('node build')
    // A second install finds it there and runs nothing.
    expect(fetchElectronSqlite({ root, platform: 'win32', arch: 'x64', env: {}, log: () => {}, run: () => { throw new Error('ran') } })).toBe('present')
  })

  it('[DEV-002] Given a build Electron refuses to load, When native:electron runs with force, Then the build is replaced', () => {
    const root = checkout()
    const folder = bindingFolder(root, versions)
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'better_sqlite3.node'), 'broken')
    const run = (_c: string, _a: string[], cwd: string) => { built(cwd, 'fresh'); return { ok: true, output: '' } }
    expect(fetchElectronSqlite({ root, platform: 'win32', arch: 'x64', env: {}, log: () => {}, run })).toBe('present')
    expect(fetchElectronSqlite({ root, platform: 'win32', arch: 'x64', env: {}, log: () => {}, run, force: true })).toBe('fetched')
    expect(fs.readFileSync(path.join(folder, 'better_sqlite3.node'), 'utf8')).toBe('fresh')
  })

  it('[DEV-002] Given the install and retry commands, When package.json runs them, Then both go through the CLI, which always runs, and the retry forces', () => {
    const scripts = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts
    expect(scripts.postinstall).toBe('node scripts/native/electron-sqlite-cli.mjs')
    expect(scripts['native:electron']).toBe('node scripts/native/electron-sqlite-cli.mjs --force')
    expect(fs.readFileSync(path.join(repo, 'scripts/native/electron-sqlite-cli.mjs'), 'utf8')).not.toMatch(/import\.meta\.url ===|=== import\.meta\.url/)
  })

  it('[DEV-002] Given no prebuilt binary for this Electron, When installing, Then it compiles one against Electron headers', () => {
    const root = checkout()
    const runs: string[][] = []
    const outcome = fetchElectronSqlite({
      root, platform: 'win32', arch: 'x64', env: { npm_config_node_gyp: '/npm/node-gyp-bin.js' }, log: () => {},
      run: (_command, args, cwd) => {
        runs.push(args)
        if (args[0] !== '/npm/node-gyp-bin.js') return { ok: false, output: 'no prebuilt binaries found' }
        expect(fs.existsSync(path.join(cwd, 'binding.gyp'))).toBe(true)
        built(cwd, 'compiled')
        return { ok: true, output: '' }
      }
    })
    expect(outcome).toBe('compiled')
    expect(runs[1]).toEqual(expect.arrayContaining(['rebuild', '--target=33.4.11', '--dist-url=https://electronjs.org/headers']))
  })

  it('[DEV-003] Given the Electron build fails to fetch or compile, When installing, Then the install still succeeds and says how to retry', () => {
    const root = checkout()
    const lines: string[] = []
    const outcome = fetchElectronSqlite({
      root, platform: 'win32', arch: 'x64', env: { npm_config_node_gyp: '/npm/node-gyp-bin.js' }, log: l => lines.push(l),
      run: () => ({ ok: false, output: 'offline' })
    })
    expect(outcome).toBe('failed')
    expect(lines.join('\n')).toContain('npm run native:electron')
    expect(fs.existsSync(path.join(bindingFolder(root, versions), 'work'))).toBe(false)
  })

  it('[DEV-003] Given Electron is not installed or the build is switched off, When installing, Then the step is skipped without failing', () => {
    const root = checkout()
    fs.rmSync(path.join(root, 'node_modules', 'electron'), { recursive: true })
    expect(fetchElectronSqlite({ root, env: {}, log: () => {}, run: () => ({ ok: true, output: '' }) })).toBe('skipped')
    expect(fetchElectronSqlite({ root: checkout(), env: { ASTROREPO_SKIP_ELECTRON_NATIVE: '1' }, log: () => {}, run: () => ({ ok: true, output: '' }) })).toBe('skipped')
  })

  it('[DEV-007] Given the database fails to open at start, When the app reports it, Then a development checkout is told the command that fixes it', () => {
    const native = new Error("The module '.../better_sqlite3.node'\nwas compiled against a different Node.js version using\nNODE_MODULE_VERSION 127.")
    const dev = databaseOpenFailure(native, false)
    expect(dev.title).toBe('AstroRepo could not open its database')
    expect(dev.body).toContain('npm run native:electron')
    expect(dev.body).toContain('NODE_MODULE_VERSION 127')
    expect(databaseOpenFailure(new Error('disk I/O error'), false).body).toContain('npm run doctor')
    expect(databaseOpenFailure(native, true).body).not.toContain('npm run')
  })
})

const healthy: DoctorFacts = {
  nodeVersion: 'v22.11.0', wantedNode: '22', electronInstalled: true, electronSqlite: 'ok', hooksInstalled: true
}

describe('npm run doctor (spec 045)', () => {
  it('[DEV-004] Given a healthy checkout, When the doctor runs, Then every check passes', () => {
    const checks = diagnose(healthy)
    expect(checks.map(c => c.name)).toEqual(['Node', 'better-sqlite3 for Node', 'Electron', 'better-sqlite3 for Electron', 'Git hooks'])
    expect(checks.every(c => c.ok)).toBe(true)
    expect(report(checks)).toContain('All set')
  })

  it('[DEV-004] Given each problem, When the doctor runs, Then it names the problem and the command that fixes it', () => {
    const fixes = (facts: Partial<DoctorFacts>) => diagnose({ ...healthy, ...facts }).filter(c => !c.ok).map(c => c.fix)
    expect(fixes({ nodeVersion: 'v20.18.0' })[0]).toContain('nvm install 22')
    expect(fixes({ nodeVersion: 'v24.1.0' })).toEqual([])
    expect(fixes({ nodeSqliteError: 'Error: NODE_MODULE_VERSION 130\nmore' })).toEqual([expect.stringContaining('npm rebuild better-sqlite3')])
    expect(fixes({ electronSqlite: 'missing' })).toEqual(['`npm run native:electron`'])
    expect(fixes({ electronSqlite: { error: 'bad build' } })).toEqual(['`npm run native:electron`'])
    expect(fixes({ electronInstalled: false })).toEqual([expect.stringContaining('electron/install.js')])
    expect(fixes({ hooksInstalled: false })).toEqual(['`npx husky`'])
    const text = report(diagnose({ ...healthy, nodeSqliteError: 'Error: NODE_MODULE_VERSION 130\nstack' }))
    expect(text).toContain('Does not load: Error: NODE_MODULE_VERSION 130')
    expect(text).not.toContain('stack')
    expect(text).toContain('1 to fix.')
    const electron = report(diagnose({ ...healthy, electronSqlite: { error: 'node:electron/js2c/node_init:2\n  at x\nError: invalid ELF header' } }))
    expect(electron).toContain('Does not load in Electron: Error: invalid ELF header')
  })
})

describe('npm run verify (spec 045)', () => {
  it('[DEV-005] Given the gates, When verify runs, Then lint, both type checks and EARS run before the tests', () => {
    expect(QUICK_GATES.map(g => g.name)).toEqual(['lint', 'typecheck', 'typecheck:tests', 'ears'])
    expect(TEST_GATE.name).toBe('test')
    // Coverage floors fail CI's test step, so they fail verify too.
    expect(TEST_GATE.command).toContain('--coverage')
    const scripts = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts
    for (const g of [...QUICK_GATES, TEST_GATE]) expect(scripts[g.name]).toBeTruthy()
  })

  it('[DEV-005] Given one gate fails, When verify runs, Then every gate still runs and verify fails naming it', async () => {
    const ran: string[] = []
    const run = async (g: Gate) => {
      ran.push(g.name)
      return { name: g.name, ok: g.name !== 'lint', ms: 1500, output: g.name === 'lint' ? 'src/x.ts  1:1  error' : '' }
    }
    const { ok, results } = await runGates(QUICK_GATES, [TEST_GATE], run)
    expect(ok).toBe(false)
    expect(ran.sort()).toEqual(['ears', 'lint', 'test', 'typecheck', 'typecheck:tests'])
    const text = summary(results)
    expect(text).toContain('--- lint failed ---')
    expect(text).toContain('src/x.ts  1:1  error')
    expect(text).toContain('1 gate failed: lint.')
  })

  it('[DEV-005] Given every gate passes, When verify runs, Then it passes', async () => {
    const { ok, results } = await runGates(QUICK_GATES, [TEST_GATE], async g => ({ name: g.name, ok: true, ms: 10, output: 'noise' }))
    expect(ok).toBe(true)
    expect(summary(results)).toContain('Every gate passed.')
    expect(summary(results)).not.toContain('noise')
  })
})

describe('one Node version (spec 045)', () => {
  it('[DEV-006] Given .nvmrc, When package.json and the workflows are read, Then they all use its Node LTS', () => {
    const wanted = fs.readFileSync(path.join(repo, '.nvmrc'), 'utf8').trim()
    expect(wanted).toMatch(/^\d+$/)
    expect(Number(wanted) % 2).toBe(0)
    const engines = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).engines.node
    expect(engines).toBe(`>=${wanted}`)
    const workflows = fs.readdirSync(path.join(repo, '.github', 'workflows'))
    for (const w of workflows) {
      const text = fs.readFileSync(path.join(repo, '.github', 'workflows', w), 'utf8')
      if (!text.includes('setup-node')) continue
      expect(text, w).toContain('node-version-file: .nvmrc')
      expect(text, w).not.toMatch(/node-version:\s*\d/)
    }
  })

  it('[DEV-001] [DEV-002] Given the install script and the main process, When they name the Electron build folder, Then the names agree', () => {
    const root = path.join('/', 'repo')
    const fromScript = path.join(bindingFolder(root, versions), 'better_sqlite3.node')
    expect(electronSqliteBinding({ ...versions, root, exists: f => f === fromScript })).toBe(fromScript)
  })
})
