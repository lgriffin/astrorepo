import { describe, it, expect } from 'vitest'
import { parse as parseYaml } from 'yaml'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { databaseOpenFailure } from '../../src/main/db/open-failure'
import { diagnose, report, type DoctorFacts } from '../../scripts/doctor/checks'
import { runGates, summary, QUICK_GATES, TEST_GATE, type Gate } from '../../scripts/verify/gates'
import { SMOKE_THEMES, smokePages, pageProblems, fixedFindings, baselineOf, shrunkBaseline, type PageResult } from '../../scripts/smoke/rules'
import { NAV_PLACES, SETTINGS_SECTIONS, settingsLink } from '../../src/shared/navigation'
import { DEMO_MARKER, DEMO_TARGETS, demoFiles, demoLoggedNights, mayClear, subTime } from '../../scripts/demo/library'
import { fitsFile, starfield, tiffFile, greyLevels, DEMO_SIZE } from '../../scripts/demo/encode'
import { dataFolderOverride } from '../../src/main/db/data-folder'
import { parseFitsHeaders } from '../../src/main/fits/parser'

const repo = path.resolve(__dirname, '../..')
/** The Electron binary npm installed, when it did (an install with --ignore-scripts skips it). */
function electronBinary(): string | undefined {
  try {
    const bin = path.join(repo, 'node_modules', 'electron', 'dist', fs.readFileSync(path.join(repo, 'node_modules', 'electron', 'path.txt'), 'utf8').trim())
    return fs.existsSync(bin) ? bin : undefined
  } catch {
    return undefined
  }
}
const major = (range: string) => Number(range.replace(/^[^\d]*/, '').split('.')[0])
const manifest = () => JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string>
}

describe('One better-sqlite3 build for Electron and Node (spec 045)', () => {
  it('[DEV-001] Given better-sqlite3 13 (Node-API), When the app and the tests open a database, Then both use the build npm installed, with no Electron-only build or install step', () => {
    const pkg = manifest()
    expect(major(pkg.dependencies['better-sqlite3'])).toBeGreaterThanOrEqual(13)
    expect(pkg.scripts.postinstall).toBeUndefined()
    expect(pkg.scripts['native:electron']).toBeUndefined()
    const connection = fs.readFileSync(path.join(repo, 'src/main/db/connection.ts'), 'utf8')
    expect(connection).toContain('new Database(dbPath)')
    expect(connection).not.toContain('nativeBinding')
  })

  it('[DEV-001] Given the installed Electron, When it loads better-sqlite3 in its own Node, Then the database opens with the same build the tests use', () => {
    const bin = electronBinary()
    // CI installs Electron on Ubuntu and Windows, so this runs there; a checkout without the binary has nothing to load.
    if (!bin) return
    const script = "const D=require('better-sqlite3');const d=new D(':memory:');console.log(process.versions.electron+' '+d.prepare('select 41+1 n').get().n);d.close()"
    const r = spawnSync(bin, ['-e', script], { cwd: repo, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
    expect(r.stderr).toBe('')
    expect(r.stdout.trim()).toBe(`${JSON.parse(fs.readFileSync(path.join(repo, 'node_modules/electron/package.json'), 'utf8')).version} 42`)
  }, 30_000)

  it('[DEV-027] Given the desktop app, When its runtime is read, Then it is Electron 45 and Dependabot still leaves Electron majors to a planned change', () => {
    expect(major(manifest().devDependencies.electron)).toBe(45)
    const bot = parseYaml(fs.readFileSync(path.join(repo, '.github/dependabot.yml'), 'utf8')) as { updates: Array<{ ignore?: Array<{ 'dependency-name': string; 'update-types': string[] }> }> }
    expect(bot.updates[0].ignore).toContainEqual({ 'dependency-name': 'electron', 'update-types': ['version-update:semver-major'] })
  })

  it('[DEV-007] Given the database fails to open at start, When the app reports it, Then a development checkout is told the command that fixes it', () => {
    const native = new Error("The module '.../better_sqlite3.node'\nwas compiled against a different Node.js version using\nNODE_MODULE_VERSION 127.")
    const dev = databaseOpenFailure(native, false)
    expect(dev.title).toBe('AstroRepo could not open its database')
    expect(dev.body).toContain('npm rebuild better-sqlite3')
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
    expect(fixes({ electronSqlite: { error: 'bad build' } })).toEqual(['`npm rebuild better-sqlite3`'])
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
})

describe('CI (spec 045, D2)', () => {
  const folder = path.join(repo, '.github', 'workflows')
  type Step = { run?: string; uses?: string }
  type Workflow = { on: Record<string, unknown>; concurrency?: { group: string; 'cancel-in-progress': unknown }; jobs: Record<string, { 'runs-on': string; steps: Step[] }> }
  /** Parses one workflow; a file GitHub could not read fails naming it (DEV-010). */
  const parseWorkflow = (name: string, text: string): Workflow => {
    try {
      return parseYaml(text) as Workflow
    } catch (error) {
      throw new Error(`${name} is not valid YAML: ${(error as Error).message}`, { cause: error })
    }
  }
  const read = (name: string) => parseWorkflow(name, fs.readFileSync(path.join(folder, name), 'utf8'))

  it('[DEV-010] Given a workflow with a plain value holding "seed: ", When it is parsed, Then it fails naming the file', () => {
    expect(() => parseWorkflow('broken.yml', "jobs:\n  a:\n    steps:\n      - run: grep 'seed: ' log\n")).toThrow(/^broken\.yml is not valid YAML/)
  })


  it('[DEV-010] Given every workflow, When it is parsed as YAML, Then none fails to parse and each has triggers and jobs', () => {
    for (const name of fs.readdirSync(folder).filter(f => /\.ya?ml$/.test(f))) {
      const workflow = read(name)
      expect(workflow.on, name).toBeTruthy()
      expect(Object.keys(workflow.jobs ?? {}).length, name).toBeGreaterThan(0)
    }
  })

  it('[DEV-008] Given the CI workflow, When a pull request is pushed to, Then it runs once for the pull request and a newer push cancels the run it replaces', () => {
    const ci = read('ci.yml')
    expect(ci.on.push).toEqual({ branches: ['main'] })
    expect('pull_request' in ci.on).toBe(true)
    expect(ci.concurrency?.group).toContain('github.event.pull_request.number')
    expect(String(ci.concurrency?.['cancel-in-progress'])).toContain("github.event_name == 'pull_request'")
  })

  it('[DEV-009] Given the CI workflow, When its jobs are read, Then every gate runs once through npm run verify and Windows runs the tests and the build', () => {
    const jobs = read('ci.yml').jobs
    const runs = (job: string) => jobs[job].steps.map(s => s.run).filter((r): r is string => Boolean(r))
    expect(jobs.verify['runs-on']).toBe('ubuntu-latest')
    expect(runs('verify')).toEqual(['npm ci', 'npm run verify', 'npm run build'])
    expect(jobs.windows['runs-on']).toBe('windows-latest')
    expect(runs('windows')).toEqual(['npm ci', 'npm test', 'npm run build'])
    expect(TEST_GATE.command).toContain('--coverage')
  })
})

describe('smoke run (spec 045, D3)', () => {
  const page = (over: Partial<PageResult> = {}): PageResult => ({ route: '/', theme: 'dark', errors: [], textLength: 120, violations: {}, ...over })

  it('[DEV-011] Given the map of places, When the smoke pages are listed, Then every page and every Settings section is opened once, in every theme', () => {
    const routes = smokePages().map(p => p.route)
    for (const place of NAV_PLACES) for (const p of place.pages) expect(routes).toContain(p.to)
    for (const section of SETTINGS_SECTIONS) expect(routes).toContain(settingsLink(section.id))
    expect(new Set(routes).size).toBe(routes.length)
    expect([...SMOKE_THEMES]).toEqual(['dark', 'light', 'night'])
  })

  it('[DEV-011] Given the smoke pages, When their screenshot names are made, Then each is a distinct file-safe name', () => {
    const names = smokePages().map(p => p.name)
    for (const name of names) expect(name).toMatch(/^[a-z0-9-]+$/i)
    expect(new Set(names).size).toBe(names.length)
  })

  it('[DEV-012] Given a page that logged an error or drew blank, When it is judged, Then the run fails naming the page and theme', () => {
    expect(pageProblems(page({ route: '/jobs', theme: 'night', errors: ['boom'] }), {})).toEqual(['/jobs (night): boom'])
    expect(pageProblems(page({ route: '/jobs', textLength: 0 }), {})).toEqual(['/jobs (dark) drew a blank page'])
    expect(pageProblems(page(), {})).toEqual([])
  })

  it('[DEV-013] Given an accessibility finding not in the baseline, When it is judged, Then the run fails naming the page and rule, and a known one passes', () => {
    const result = page({ route: '/poster', violations: { 'select-name': 1, 'color-contrast': 2 } })
    expect(pageProblems(result, { '/poster': { 'select-name': 1 } })).toEqual(['/poster (dark): new accessibility finding color-contrast'])
    expect(pageProblems(result, { '/poster': { 'color-contrast': 2, 'select-name': 1 } })).toEqual([])
  })

  it('[DEV-013] Given a known rule failing on more elements than the baseline holds, When it is judged, Then the run fails rather than hiding the new defect', () => {
    const result = page({ route: '/messier', violations: { 'color-contrast': 67 } })
    expect(pageProblems(result, { '/messier': { 'color-contrast': 66 } })).toEqual(['/messier (dark): color-contrast on 67 elements, 66 known'])
  })

  it('[DEV-013] Given a baseline finding that no longer occurs, When the run ends, Then it is listed as fixed and the cut-down baseline drops it', () => {
    const results = [page({ route: '/a', violations: { x: 2 } }), page({ route: '/a', theme: 'light', violations: { y: 1, x: 3 } })]
    const baseline = { '/a': { x: 4, z: 1 }, '/b': { x: 1 } }
    expect(fixedFindings(results, baseline)).toEqual(['/a x (3 of 4)', '/a z (0 of 1)', '/b x (0 of 1)'])
    expect(shrunkBaseline(results, baseline)).toEqual({ '/a': { x: 3 } })
    expect(baselineOf(results)).toEqual({ '/a': { x: 3, y: 1 } })
  })

  it('[DEV-013] Given a new finding, When the baseline is updated, Then the failure is not written into it, since the baseline only shrinks', () => {
    const results = [page({ route: '/a', violations: { x: 5, fresh: 1 } }), page({ route: '/new', violations: { y: 1 } })]
    expect(shrunkBaseline(results, { '/a': { x: 2 } })).toEqual({ '/a': { x: 2 } })
  })

  it('[DEV-013] Given the committed baseline, When it is read, Then it only names pages the smoke run opens', () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(repo, 'scripts', 'smoke', 'axe-baseline.json'), 'utf8')) as Record<string, Record<string, number>>
    const routes = new Set(smokePages().map(p => p.route))
    for (const route of Object.keys(baseline)) expect(routes.has(route), route).toBe(true)
  })

  it('[DEV-014] Given the CI workflow, When its smoke job is read, Then it builds, runs the smoke run and keeps the screenshots', () => {
    const ci = parseYaml(fs.readFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'utf8')) as { jobs: Record<string, { steps: { run?: string; uses?: string; with?: { path?: string } }[] }> }
    const steps = ci.jobs.smoke.steps
    const runs = steps.map(s => s.run).filter(Boolean)
    expect(runs.indexOf('npm run build')).toBeLessThan(runs.indexOf('npm run smoke'))
    expect(steps.some(s => s.uses?.startsWith('actions/upload-artifact') && s.with?.path?.split('\n').includes('reports/smoke/'))).toBe(true)
  })
})

describe('demo library (spec 045, D4)', () => {
  const files = demoFiles()

  it('[DEV-015] Given the demo, When its files are listed twice, Then they are the same, laid out as raw, stacked, tif and images by target', () => {
    expect(demoFiles()).toEqual(files)
    for (const f of files) expect(f.path).toMatch(/^(raw\/[^/]+\/\d{4}-\d{2}-\d{2}\/Light_.+\.fit|stacked\/[^/]+\/.+\.fit|tif\/[^/]+\/.+\.tif|images\/[^/]+\/[^/]+\.png)$/)
    expect(new Set(files.map(f => f.path)).size).toBe(files.length)
    expect(files.length).toBeLessThan(1000)
  })

  it('[DEV-015] Given the demo targets, When their files are listed, Then the library holds a target at each point of the workflow', () => {
    const has = (name: string, kind: string) => files.some(f => f.target === name && f.kind === kind)
    const finished = DEMO_TARGETS.filter(t => has(t.name, 'picture'))
    const waiting = DEMO_TARGETS.filter(t => has(t.name, 'light') && !has(t.name, 'master'))
    const stackedOnly = DEMO_TARGETS.filter(t => has(t.name, 'master') && !has(t.name, 'tif'))
    expect(finished.length).toBeGreaterThan(0)
    expect(waiting.length).toBeGreaterThan(0)
    expect(stackedOnly.length).toBeGreaterThan(0)
    for (const t of DEMO_TARGETS) expect(has(t.name, 'light'), t.name).toBe(true)
  })

  it('[DEV-015] Given a master, When its header is read, Then it combines every sub of its target and their whole exposure', () => {
    for (const t of DEMO_TARGETS.filter(t => t.stacked)) {
      const master = files.find(f => f.target === t.name && f.kind === 'master')!
      expect(master.cards?.NCOMBINE).toBe(t.nights.reduce((n, x) => n + x.subs, 0))
      expect(master.cards?.EXPTIME).toBe(t.nights.reduce((n, x) => n + x.subs * x.exposureSec, 0))
    }
  })

  it('[DEV-015] Given a demo frame written to disk, When the app reads its header, Then it finds the target, the time and the stacking count', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-'))
    const master = files.find(f => f.kind === 'master')!
    const file = path.join(dir, 'master.fit')
    fs.writeFileSync(file, fitsFile(master.cards ?? {}, starfield(1)))
    const headers = parseFitsHeaders(file).headers
    const value = (k: string) => headers.find(h => h.keyword === k)?.value
    expect(value('OBJECT')).toBe(master.target)
    expect(value('NCOMBINE')).toBe(master.cards?.NCOMBINE)
    expect(value('NAXIS1')).toBe(DEMO_SIZE)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('[DEV-015] Given a TIFF from the demo, When its header is read, Then it is a little-endian baseline TIFF with one strip of the picture', () => {
    const grey = greyLevels(starfield(2))
    const tiff = tiffFile(grey)
    expect(tiff.subarray(0, 4)).toEqual(Buffer.from([0x49, 0x49, 42, 0]))
    expect(tiff.length).toBe(8 + 2 + 9 * 12 + 4 + DEMO_SIZE * DEMO_SIZE)
  })

  it('[DEV-015] Given a long night, When subs are timed, Then they run on past midnight and the logged nights are the targets\' first nights', () => {
    expect(subTime('2025-12-01', 120, 30).toISOString()).toBe('2025-12-01T22:04:00.000Z')
    expect(subTime('2025-12-01', 200, 60).toISOString().slice(0, 10)).toBe('2025-12-02')
    expect(demoLoggedNights().map(n => n.date)).toEqual(DEMO_TARGETS.slice(0, 3).map(t => t.nights[0].date))
    expect(demoLoggedNights().map(n => n.target)).toEqual(DEMO_TARGETS.slice(0, 3).map(t => t.name))
  })

  it('[DEV-015] Given a folder that is the checkout, a parent of it, a root, or full of other files, When the demo would clear it, Then it refuses', () => {
    const checkout = '/home/me/astrorepo'
    expect(mayClear('/home/me/astrorepo', checkout, ['package.json']).ok).toBe(false)
    expect(mayClear('/home/me', checkout, ['astrorepo']).ok).toBe(false)
    expect(mayClear('/', checkout, ['home']).ok).toBe(false)
    expect(mayClear('C:\\', 'C:\\code\\astrorepo', ['code']).ok).toBe(false)
    expect(mayClear('/home/me/photos', checkout, ['M31.png']).ok).toBe(false)
    expect(mayClear('/home/me/astrorepo/.demo', checkout, [DEMO_MARKER, 'data']).ok).toBe(true)
    expect(mayClear('/tmp/new-demo', checkout, null).ok).toBe(true)
    expect(mayClear('/tmp/empty', checkout, []).ok).toBe(true)
  })

  it('[DEV-016] Given ASTRO_DEV_DATA in a development run, When the desktop app starts, Then it opens that folder; a packaged app, an empty value or the server ASTRO_DATA does not move it', () => {
    expect(dataFolderOverride({ ASTRO_DEV_DATA: '.demo/data' }, false)).toBe(path.resolve('.demo/data'))
    expect(dataFolderOverride({ ASTRO_DEV_DATA: '.demo/data' }, true)).toBeNull()
    expect(dataFolderOverride({ ASTRO_DEV_DATA: '  ' }, false)).toBeNull()
    expect(dataFolderOverride({}, false)).toBeNull()
    // The server's own variable is not followed, so a desktop run never shares a running server's database.
    expect(dataFolderOverride({ ASTRO_DATA: '/srv/astrorepo' }, false)).toBeNull()
  })

  it('[DEV-016] Given the desktop app and package.json, When they are read, Then the app applies the override before it opens its data and dev:demo starts it on the demo', () => {
    const main = fs.readFileSync(path.join(repo, 'src', 'main', 'index.ts'), 'utf8')
    expect(main.indexOf("app.setPath('userData', dataOverride)")).toBeGreaterThan(-1)
    expect(main.indexOf("app.setPath('userData', dataOverride)")).toBeLessThan(main.indexOf("initDatabase(app.getPath('userData'))"))
    const scripts = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts as Record<string, string>
    expect(scripts.demo).toBe('tsx scripts/demo/demo.ts')
    expect(scripts['dev:demo']).toBe('node scripts/demo/dev-demo.mjs')
    expect(fs.readFileSync(path.join(repo, 'scripts', 'demo', 'dev-demo.mjs'), 'utf8')).toContain("ASTRO_DEV_DATA: data")
  })

  it('[DEV-017] Given the CI workflow, When its smoke job is read, Then it also builds the demo and runs the smoke run over it, keeping both sets of screenshots', () => {
    const ci = parseYaml(fs.readFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'utf8')) as { jobs: Record<string, { steps: { run?: string; uses?: string; with?: { path?: string } }[] }> }
    const steps = ci.jobs.smoke.steps
    const runs = steps.map(s => s.run).filter(Boolean)
    expect(runs.indexOf('npm run demo')).toBeGreaterThan(-1)
    expect(runs.indexOf('npm run demo')).toBeLessThan(runs.indexOf('npm run smoke -- --demo'))
    expect(steps.some(s => s.uses?.startsWith('actions/upload-artifact') && s.with?.path?.includes('reports/smoke-demo/'))).toBe(true)
  })

  it('[DEV-017] Given the demo baseline, When it is read, Then it only names pages the smoke run opens', () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(repo, 'scripts', 'smoke', 'axe-baseline.demo.json'), 'utf8')) as Record<string, Record<string, number>>
    const routes = new Set(smokePages().map(p => p.route))
    for (const route of Object.keys(baseline)) expect(routes.has(route), route).toBe(true)
  })
})
