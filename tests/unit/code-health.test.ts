import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from 'yaml'

const repo = path.resolve(__dirname, '../..')
const read = (rel: string): string => fs.readFileSync(path.join(repo, rel), 'utf8')
const lines = (rel: string): number => read(rel).split('\n').length
const filesIn = (rel: string): string[] => fs.readdirSync(path.join(repo, rel)).filter(f => f.endsWith('.ts')).map(f => `${rel}/${f}`)

describe('Code health (spec 045, D6)', () => {
  it('[DEV-023] Given the renderer, When the app starts, Then only Home is loaded with it, every other page is loaded the first time it is opened, and one that fails to load is not left blank', () => {
    const app = read('src/renderer/App.tsx')
    const routes = read('src/renderer/routes.tsx')
    expect([...app.matchAll(/from '\.\/pages\//g)]).toHaveLength(0)
    const eager = [...routes.matchAll(/^import \{ (\w+) \} from '\.\/pages\/(\w+)'/gm)].map(m => m[1])
    expect(eager).toEqual(['Dashboard'])
    const lazy = [...routes.matchAll(/^const (\w+) = page\(\(\) => import\('\.\/pages\/(\w+)'\), '(\w+)'\)/gm)]
    for (const [, name, file, exported] of lazy) {
      expect(exported, file).toBe(name)
      expect(read(`src/renderer/pages/${file}.tsx`), file).toContain(`export function ${name}(`)
    }
    // Every page a route opens is one of them.
    const routed = [...routes.matchAll(/\{ path: '[^']+', page: (\w+) \}/g)].map(m => m[1])
    expect(routed.length).toBeGreaterThan(20)
    for (const page of routed) expect(['Dashboard', ...lazy.map(l => l[1])], page).toContain(page)
    expect(app).toContain('{ROUTES.map(')
    expect(app).toContain('<Suspense fallback={<Loading label="Loading the page"')
    // A page that fails to load says so and offers a reload, rather than leaving the screen blank.
    expect(app.indexOf('<PageLoadBoundary>')).toBeLessThan(app.indexOf('<Suspense'))
    const boundary = read('src/renderer/components/common/PageLoadBoundary.tsx')
    expect(boundary).toContain('getDerivedStateFromError')
    expect(boundary).toContain('window.location.reload()')
    expect(boundary).toContain('key={pathname}')
  })

  it('[DEV-024] Given the IPC handlers and the shared types, When they are read, Then each area is a module of its own and none is over 600 lines', () => {
    expect(lines('src/main/ipc/handlers.ts')).toBeLessThan(60)
    expect(lines('src/shared/types.ts')).toBeLessThan(40)
    const channelFiles = filesIn('src/main/ipc/channels')
    const typeFiles = filesIn('src/shared/types')
    expect(channelFiles.length).toBeGreaterThanOrEqual(10)
    expect(typeFiles.length).toBeGreaterThanOrEqual(10)
    for (const f of [...channelFiles, ...typeFiles]) expect(lines(f), f).toBeLessThan(600)
    // handlers.ts registers every area, and types.ts re-exports every area.
    const handlers = read('src/main/ipc/handlers.ts')
    for (const f of channelFiles.filter(f => !/(shared|validated)\.ts$/.test(f))) expect(handlers, f).toContain(`from './channels/${path.basename(f, '.ts')}'`)
    const types = read('src/shared/types.ts')
    for (const f of typeFiles) expect(types, f).toContain(`export * from './types/${path.basename(f, '.ts')}'`)
  })

  it('[DEV-025] Given the test tools, When package.json is read, Then Vitest and its coverage are on the same current major and Stryker runs on it', () => {
    const pkg = JSON.parse(read('package.json')) as { devDependencies: Record<string, string> }
    const major = (v: string) => Number(/(\d+)/.exec(v)?.[1])
    expect(major(pkg.devDependencies.vitest)).toBeGreaterThanOrEqual(3)
    expect(major(pkg.devDependencies['@vitest/coverage-v8'])).toBe(major(pkg.devDependencies.vitest))
    expect(pkg.devDependencies['@stryker-mutator/vitest-runner']).toBeDefined()
  })

  it('[DEV-026] Given Dependabot, When its file is read, Then npm and the workflows are checked weekly in groups, and an Electron major is never proposed on its own', () => {
    const config = parse(read('.github/dependabot.yml')) as { version: number; updates: Array<{ 'package-ecosystem': string; schedule: { interval: string }; groups?: Record<string, { patterns: string[] }>; ignore?: Array<{ 'dependency-name': string; 'update-types': string[] }> }> }
    expect(config.version).toBe(2)
    expect(config.updates.map(u => u['package-ecosystem'])).toEqual(['npm', 'github-actions'])
    for (const u of config.updates) {
      expect(u.schedule.interval).toBe('weekly')
      expect(Object.keys(u.groups ?? {}).length).toBeGreaterThan(0)
    }
    const npm = config.updates[0]
    expect(npm.groups?.electron.patterns).toContain('electron')
    expect(npm.ignore).toContainEqual({ 'dependency-name': 'electron', 'update-types': ['version-update:semver-major'] })
  })
})
