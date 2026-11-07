import { describe, expect, it } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  nextSpecNumber, nextSteps, parseSliceArgs, prefixesIn, sliceFiles, sliceProblems, withExport, type SlicePlan
} from '../../scripts/new-slice/rules'
import { parseCitations, parseRequirements } from '../../scripts/ears/trace'

const repo = path.resolve(__dirname, '../..')
const read = (rel: string): string => fs.readFileSync(path.join(repo, rel), 'utf8')
const SPECS = fs.readdirSync(path.join(repo, 'specs'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
const PLAN: SlicePlan = { spec: '901-dark-sites', prefix: 'DSK', title: 'Dark sites' }
const NONE = { specFolders: ['045-developer-experience', '046-everyday-ux'], prefixes: ['DEV', 'EUX'], files: [] }

describe('npm run new:slice (spec 045, D5)', () => {
  it('[DEV-019] Given a name, prefix and title, When a slice is scaffolded, Then its spec, domain rule and test are written and the test cites the spec\'s requirement', async () => {
    expect(sliceProblems(PLAN, NONE)).toEqual([])
    const files = sliceFiles(PLAN)
    expect(files.map(f => f.path)).toEqual([
      'specs/901-dark-sites/requirements.md',
      'packages/domain/src/dark-sites.ts',
      'packages/domain/test/dark-sites.test.ts'
    ])
    const [spec, rule, test] = files
    const requirements = parseRequirements(spec.content, spec.path)
    expect(requirements.map(r => [r.id, r.pattern])).toEqual([['DSK-001', 'Unwanted']])
    expect(parseCitations(test.content, test.path).map(c => c.id)).toEqual(['DSK-001'])
    // The Unwanted requirement's test title carries a failure word, as the EARS gate asks.
    expect(parseCitations(test.content, test.path)[0].title).toMatch(/refus|missing/)
    expect(test.content).toContain("from '../src'")

    // The rule runs, and does what its test says.
    // Inside the checkout, where Vite serves files from: Windows' temp folder can be a short 8.3 name
    // (RUNNER~1) that a file URL encodes, and Vitest 3 does not load a file outside the project.
    const cache = path.join(repo, 'node_modules', '.cache')
    fs.mkdirSync(cache, { recursive: true })
    const dir = fs.mkdtempSync(path.join(cache, 'astrorepo-slice-'))
    fs.writeFileSync(path.join(dir, 'dark-sites.ts'), rule.content)
    const mod = (await import(path.join(dir, 'dark-sites.ts').split(path.sep).join('/'))) as Record<string, (x: { name: string }) => string[]>
    expect(mod.darkSitesProblems({ name: ' ' })).toEqual(['A name is needed.'])
    expect(mod.darkSitesProblems({ name: 'M 31' })).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('[DEV-019] Given a name without a number, When the command reads its flags, Then the next free spec number is taken, and the rule is exported once from the domain index', () => {
    expect(nextSpecNumber(['009-a', '046-everyday-ux', 'notes'])).toBe('047')
    expect(nextSpecNumber([])).toBe('001')
    expect(parseSliceArgs(['--name', 'dark-sites', '--prefix', 'DSK', '--title', 'Dark sites'], SPECS)).toEqual({
      spec: `${nextSpecNumber(SPECS)}-dark-sites`, prefix: 'DSK', title: 'Dark sites'
    })
    expect(parseSliceArgs(['--spec', '050-x', '--prefix', '--title', 'X'], SPECS)).toEqual({ spec: '050-x', prefix: undefined, title: 'X' })
    const index = "export * from './sky'\n"
    const once = withExport(index, PLAN)
    expect(once).toBe("export * from './sky'\nexport * from './dark-sites'\n")
    expect(withExport(once, PLAN)).toBe(once)
    expect(nextSteps(PLAN).join(' ')).toContain('npm run verify')
    expect(read('package.json')).toContain('"new:slice": "tsx scripts/new-slice/new-slice.ts"')
  })

  it('[DEV-020] Given a taken number or prefix, a malformed name or prefix, missing flags or a file already there, When a slice is scaffolded, Then it is refused with the reason and nothing is written', () => {
    expect(sliceProblems({ ...PLAN, spec: '046-other' }, NONE)).toEqual(['Spec number 046 is taken by 046-everyday-ux.'])
    expect(sliceProblems({ ...PLAN, prefix: 'EUX' }, NONE)).toEqual(['The prefix EUX is already used by another spec.'])
    expect(sliceProblems({ ...PLAN, spec: '47-Dark Sites' }, NONE)[0]).toMatch(/three digits/)
    expect(sliceProblems({ ...PLAN, prefix: 'dsk1' }, NONE)[0]).toMatch(/two to four capitals/)
    expect(sliceProblems({}, NONE)).toHaveLength(3)
    for (const spec of ['901-dark-', '901-dark--sites', '901--x']) expect(sliceProblems({ ...PLAN, spec }, NONE)[0], spec).toMatch(/three digits/)
    for (const title of ["O'Reilly", 'A | B', 'Back`tick', 'Two\nlines', ' Leading']) expect(sliceProblems({ ...PLAN, title }, NONE), title).toHaveLength(1)
    expect(sliceProblems({ ...PLAN, title: 'Dark sites (M 31, part 2).' }, NONE)).toEqual([])
    expect(sliceProblems(PLAN, { ...NONE, files: ['packages/domain/src/dark-sites.ts'] })).toEqual([
      'packages/domain/src/dark-sites.ts already exists; nothing was written.'
    ])
    expect(prefixesIn('| DEV-001 | Event | x |\n| DEV-002 | State | y |\n| NSI-010 | Event | z |')).toEqual(['DEV', 'NSI'])
    expect(prefixesIn(read('specs/046-everyday-ux/requirements.md'))).toEqual(['EUX'])

    const before = fs.readdirSync(path.join(repo, 'specs')).length
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/new-slice/new-slice.ts', '--name', 'clash', '--prefix', 'EUX', '--title', 'Clash'], { cwd: repo, encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('The prefix EUX is already used by another spec.')
    expect(fs.readdirSync(path.join(repo, 'specs')).length).toBe(before)
    const malformed = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/new-slice/new-slice.ts', '--name', 'dark-', '--prefix', 'ZZQ', '--title', 'Dark'], { cwd: repo, encoding: 'utf8' })
    expect(malformed.status).toBe(1)
    expect(malformed.stderr).toContain('three digits')
    expect(malformed.stderr).not.toContain('TypeError')
  })
})

describe('The contributor path (spec 045, D5)', () => {
  it('[DEV-021] Given a new contributor, When they open CONTRIBUTING.md, Then it covers setting up on Windows, the gates before a push and how a slice is built', () => {
    const guide = read('CONTRIBUTING.md')
    for (const heading of ['## Set up', '### On Windows', '### Editor', '## Before you push', '## How a slice is built', '## Pull requests']) expect(guide).toContain(heading)
    for (const command of ['npm run doctor', 'npm run verify', 'npm run new:slice', 'npm run smoke', 'npm run test:mutation:changed']) expect(guide).toContain(command)
    expect(read('README.md')).toContain('CONTRIBUTING.md')
  })

  it('[DEV-021] Given the agent guidelines, When CLAUDE.md is read, Then it holds the rules only, every command it names exists, and past slices\' notes are in slice-notes', () => {
    const guidelines = read('CLAUDE.md')
    expect(guidelines.split('\n').length).toBeLessThan(90)
    expect(guidelines).not.toContain('## Recent Changes')
    expect(guidelines).toContain('docs/architecture/slice-notes.md')
    const scripts = Object.keys((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts)
    for (const [, name] of guidelines.matchAll(/npm run ([a-z:-]+)/g)) expect(scripts, name).toContain(name)
    const notes = read('docs/architecture/slice-notes.md')
    expect(notes.match(/^- \d{3}-/gm)?.length ?? 0).toBeGreaterThan(30)
    expect(notes).toContain('045-developer-experience D5')
  })

  it('[DEV-022] Given VS Code, When the folder is opened, Then the shared settings, recommended extensions and debug launches for the app, its renderer and a test file are there and kept by git', () => {
    const json = (rel: string) => JSON.parse(read(rel)) as Record<string, unknown>
    expect(json('.vscode/settings.json')['typescript.tsdk']).toBe('node_modules/typescript/lib')
    expect(json('.vscode/extensions.json').recommendations).toEqual(expect.arrayContaining(['dbaeumer.vscode-eslint', 'vitest.explorer']))
    const launch = json('.vscode/launch.json') as { configurations: Array<{ name: string; runtimeExecutable?: string; program?: string }>; compounds: Array<{ configurations: string[] }> }
    const names = launch.configurations.map(c => c.name)
    expect(names).toEqual(['Debug main process', 'Debug renderer process', 'Debug the current test file'])
    expect(launch.compounds[0].configurations).toEqual(['Debug main process', 'Debug renderer process'])
    for (const c of launch.configurations) {
      const file = c.runtimeExecutable ?? c.program
      if (file) expect(fs.existsSync(file.replace('${workspaceFolder}', repo)), file).toBe(true)
    }
    const ignore = read('.gitignore').split('\n')
    for (const f of ['settings.json', 'extensions.json', 'launch.json']) expect(ignore).toContain(`!.vscode/${f}`)
    expect(ignore).not.toContain('.vscode/')
  })
})
