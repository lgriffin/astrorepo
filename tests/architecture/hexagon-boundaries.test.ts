import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ambientUses, COMPUTED, importsOf, isNodeBuiltin, rel, root, sourceFiles, target, type ImportRef } from './source-graph'

const dir = (...parts: string[]) => path.join(root, ...parts)
const pkg = (name: string) => dir('packages', name, 'src')

/**
 * Why an import is refused, or null when it is allowed. `to` is where it leads relative to the repo
 * root (relative and aliased specifiers alike), or null for a package or Node built-in.
 */
type Rule = (ref: ImportRef, to: string | null, file: string) => string | null

/** Every import under `dirs` that a rule refuses, as `file imports "spec" (reason)`. A computed specifier is always refused. */
function violations(dirs: string[], rule: Rule): string[] {
  return dirs.flatMap(d => sourceFiles(d)).flatMap(file =>
    importsOf(file)
      .map(ref => {
        const to = target(file, ref.spec)
        return { ref, reason: to === COMPUTED ? 'a computed specifier no rule can check' : rule(ref, to, file) }
      })
      .filter(v => v.reason !== null)
      .map(v => `${rel(file)} imports "${v.ref.spec}" (${v.reason})`))
}

const under = (to: string | null, base: string) => to !== null && (to === base || to.startsWith(`${base}/`))

/** Only files under `base`, plus the named packages or aliases. */
const onlyWithin = (base: string, allowed: string[] = []): Rule => (ref, to) =>
  under(to, base) || allowed.includes(ref.spec) ? null : 'outside its package'

describe('Hexagon boundaries', () => {
  it('[NFR-004] Given the domain package, When its imports are read, Then it imports only its own files', () => {
    expect(violations([pkg('domain')], onlyWithin('packages/domain/src'))).toEqual([])
  })

  it('[NFR-004] Given the application package, When its imports are read, Then it imports only itself and the domain', () => {
    expect(violations([pkg('application')], onlyWithin('packages/application/src', ['@astro/domain']))).toEqual([])
  })

  it('[HEX-001] Given the domain and application packages, When their code is read, Then none of it uses the clock, randomness or a host global', () => {
    expect(ambientUses([pkg('domain'), pkg('application')].flatMap(d => sourceFiles(d)))).toEqual([])
  })

  it('[HEX-002] Given the renderer and preload, When their imports are read, Then they reach the main process only through the bridge and shared types', () => {
    const renderer = violations([dir('src', 'renderer')], (ref, to) => {
      if (under(to, 'src/renderer') || under(to, 'src/shared')) return null
      if (to !== null) return 'main-process or core code'
      if (ref.spec === 'electron' || isNodeBuiltin(ref.spec)) return 'Electron or Node is not available to the renderer'
      return null
    })
    const preload = violations([dir('src', 'preload')], (ref, to) =>
      ref.spec === 'electron' || under(to, 'src/shared') || under(to, 'src/preload') ? null : 'the bridge passes messages only')
    expect([...renderer, ...preload]).toEqual([])
  })

  it('[HEX-003] Given the shared types, When their imports are read, Then they import nothing outside src/shared', () => {
    expect(violations([dir('src', 'shared')], onlyWithin('src/shared'))).toEqual([])
  })

  it('[HEX-004] Given the driven adapters and presenters, When their imports are read, Then none reaches legacy code, IPC, composition or another adapter', () => {
    expect(violations([dir('src', 'main', 'adapters')], adapterRule)).toEqual([])
  })

  it('[HEX-005] Given the main process, When it imports use-case factories, Then only the composition root does', () => {
    expect(violations([dir('src', 'main')], factoryRule)).toEqual([])
  })

  it('[HEX-006] Given the testkit, When its imports are read, Then it does not import the desktop app', () => {
    const refused = violations([dir('packages', 'testkit', 'src')], (_ref, to) => (to !== null && to.startsWith('src/') ? 'the desktop app' : null))
    expect(refused).toEqual([])
  })

  it('[HEX-007] Given the legacy services and file codecs, When their imports are read, Then none depends on adapters, IPC or composition', () => {
    expect(violations(['services', 'fits', 'raw'].map(d => dir('src', 'main', d)), legacyRule)).toEqual([])
  })

  it('[PI-005] Given the main process, When its imports are read, Then only the Electron host imports Electron', () => {
    expect(violations([dir('src', 'main')], electronRule)).toEqual([])
  })

  it('[PI-005] Given the channel router and the Desktop port, When their imports are read, Then they import nothing at all', () => {
    expect(violations([dir('src', 'main', 'transport')], (ref, to) => (under(to, 'src/main/transport') ? null : `"${ref.spec}" is not the transport's own`))).toEqual([])
  })

  it('[HEX-010] Given the adapters, When their code is read, Then only the system clock reads the time', () => {
    const files = sourceFiles(dir('src', 'main', 'adapters')).filter(f => path.basename(f) !== 'system-clock.ts')
    expect(ambientUses(files).filter(u => /reads the clock/.test(u))).toEqual([])
  })
})

/** Electron only in the desktop app's entry point and its Electron adapters (PI-005). */
function electronRule(ref: ImportRef, _to: string | null, file: string): string | null {
  const host = rel(file) === 'src/main/index.ts' || rel(file).startsWith('src/main/electron/')
  return ref.spec === 'electron' && !host ? 'Electron belongs to src/main/index.ts and src/main/electron' : null
}

function adapterRule(ref: ImportRef, to: string | null, file: string): string | null {
  if (to === null) return ref.spec === 'electron' ? 'Electron belongs to the hosts that compose adapters' : null
  if (under(to, 'packages/domain/src') || under(to, 'packages/application/src') || under(to, 'src/shared')) return null
  if (under(to, 'src/main/adapters/shared') || to === 'src/main/adapters/system-clock') return null
  if (under(to, 'src/main/adapters')) {
    const bothPresenters = /-presenter$/.test(path.basename(file).replace(/\.tsx?$/, '')) && /-presenter$/.test(to)
    return bothPresenters ? null : 'another adapter; share code through adapters/shared'
  }
  if (under(to, 'src/main/fits') || under(to, 'src/main/raw')) return null
  return 'legacy services, the database connection, IPC and composition are off limits to adapters'
}

function factoryRule(ref: ImportRef, to: string | null, file: string): string | null {
  if (!under(to, 'packages/application/src') || rel(file) === 'src/main/composition.ts' || ref.typeOnly) return null
  if (ref.whole) return 'a namespace or default import of the application package can build any use case'
  const factories = ref.names.filter(n => /^make[A-Z]/.test(n))
  return factories.length > 0 ? `builds ${factories.join(', ')} outside composition.ts` : null
}

function legacyRule(_ref: ImportRef, to: string | null): string | null {
  if (to === null) return null
  return under(to, 'src/main/adapters') || under(to, 'src/main/ipc') || /^src\/main\/(composition|jobs-host|vespera-host)$/.test(to)
    ? 'the new code depends on legacy, never the other way'
    : null
}

describe('The architecture check itself', () => {
  const probe = (files: Record<string, string>) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hexagon-'))
    for (const [name, code] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true })
      fs.writeFileSync(path.join(tmp, name), code)
    }
    return tmp
  }
  const reasons = (found: string[]) => found.map(v => v.replace(/^.*? imports /, ''))

  it('[NFR-004] [HEX-011] Given a core file with static, side-effect, dynamic, require, computed and re-export imports, When checked, Then each escape is refused', () => {
    const tmp = probe({
      'probe.ts': [
        "import fs from 'fs'",
        "import 'better-sqlite3'",
        "export { getSqlite } from '../../src/main/db/connection'",
        "const later = () => import('electron')",
        "const old = require('child_process')",
        'const name = "os"; const sneaky = require(name); const lazy = import(name)',
        "import { ok } from './ok'"
      ].join('\n'),
      'ok.ts': 'export const ok = 1\n'
    })
    try {
      expect(reasons(violations([tmp], onlyWithin(rel(tmp))))).toEqual([
        '"fs" (outside its package)',
        '"better-sqlite3" (outside its package)',
        '"../../src/main/db/connection" (outside its package)',
        '"electron" (outside its package)',
        '"child_process" (outside its package)',
        '"<computed>" (a computed specifier no rule can check)',
        '"<computed>" (a computed specifier no rule can check)'
      ])
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('[PI-005] Given Electron imported by the job runner and by an Electron adapter, When checked, Then only the adapter is allowed', () => {
    const judge = (file: string) => electronRule(importsOf(file, "import { app } from 'electron'")[0], null, file)
    expect(judge(path.join(root, 'src', 'main', 'jobs-host.ts'))).toMatch(/belongs to/)
    expect(judge(path.join(root, 'src', 'main', 'ipc', 'handlers.ts'))).toMatch(/belongs to/)
    expect(judge(path.join(root, 'src', 'main', 'electron', 'probe.ts'))).toBeNull()
    expect(judge(path.join(root, 'src', 'main', 'index.ts'))).toBeNull()
  })

  it('[HEX-004] [HEX-007] Given imports written through the @main alias, When checked, Then they are judged by where they lead', () => {
    const adapter = path.join(root, 'src', 'main', 'adapters', 'probe-adapter.ts')
    const service = path.join(root, 'src', 'main', 'services', 'probe-service.ts')
    const judge = (rule: Rule, file: string, spec: string) => rule(importsOf(file, `import { x } from '${spec}'`)[0], target(file, spec), file)
    expect(judge(adapterRule, adapter, '@main/services/target')).toMatch(/off limits/)
    expect(judge(adapterRule, adapter, '@main/ipc/handlers')).toMatch(/off limits/)
    expect(judge(adapterRule, adapter, '@main/adapters/sqlite-jobs')).toMatch(/another adapter/)
    expect(judge(adapterRule, adapter, '@main/adapters/shared/sql')).toBeNull()
    expect(judge(legacyRule, service, '@main/adapters/sqlite-jobs')).toMatch(/never the other way/)
    expect(judge(legacyRule, service, '@main/composition')).toMatch(/never the other way/)
    expect(judge(legacyRule, service, '@astro/domain')).toBeNull()
  })

  it('[HEX-005] Given a handler that imports the application package whole, by name or for types, When checked, Then only real factory access is refused', () => {
    const handler = path.join(root, 'src', 'main', 'ipc', 'probe.ts')
    const judge = (code: string) => factoryRule(importsOf(handler, code)[0], target(handler, '@astro/application'), handler)
    expect(judge("import * as app from '@astro/application'")).toMatch(/namespace or default/)
    expect(judge("import { makeQueueStack } from '@astro/application'")).toMatch(/builds makeQueueStack/)
    expect(judge("import type { makeQueueStack } from '@astro/application'")).toBeNull()
    expect(judge("import { JobRefusedError, type Job } from '@astro/application'")).toBeNull()
  })

  it('[HEX-001] Given core code that reads the clock, randomness and host globals, When checked by scope, Then each use is reported and shadows and look-alikes are not', () => {
    const file = path.join(os.tmpdir(), 'ambient-probe.ts')
    const uses = ambientUses([], {
      [file]: [
        'const a = Date.now()',
        'const b = new Date()',
        "const c = new Date('2026-10-11T00:00:00Z')",
        'const d = Math.random()',
        'console.log(a)',
        'setTimeout(() => {}, 1)',
        'const e = process.env.HOME',
        'const f = { process: 1, console: 2 }',
        'declare const job: { process: string }; const g = job.process',
        'function h(process: { env: string }) { return process.env }',
        'const i = navigator.userAgent',
        'export { a, b, c, d, e, f, g, h, i }'
      ].join('\n')
    }).map(u => u.replace(/^.*:(\d+) /, '$1 '))
    expect(uses).toEqual([
      '1 Date.now reads the clock',
      '2 new Date() reads the clock',
      '4 Math.random is not deterministic',
      '5 console is a host global',
      '6 setTimeout is a host global',
      '7 process is a host global',
      '11 navigator is a host global'
    ])
  })
})
