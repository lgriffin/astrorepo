import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ambientUses, importsOf, isNodeBuiltin, rel, root, sourceFiles, target } from './source-graph'

const dir = (...parts: string[]) => path.join(root, ...parts)
const pkg = (name: string) => dir('packages', name, 'src')

interface Rule {
  /** Why an import is refused, or null when it is allowed. */
  (spec: string, file: string, names: string[], typeOnly: boolean): string | null
}

/** Every import under `dirs` that a rule refuses, as `file imports "spec" (reason)`. */
function violations(dirs: string[], rule: Rule): string[] {
  return dirs.flatMap(d => sourceFiles(d)).flatMap(file =>
    importsOf(file)
      .map(i => ({ i, reason: rule(i.spec, file, i.names, i.typeOnly) }))
      .filter(v => v.reason !== null)
      .map(v => `${rel(file)} imports "${v.i.spec}" (${v.reason})`))
}

/** True when a relative import stays inside `base`. */
const inside = (file: string, spec: string, base: string) =>
  spec.startsWith('.') && !path.relative(base, path.resolve(path.dirname(file), spec)).startsWith('..')

const onlyOwnFiles = (base: string, allowed: string[] = []): Rule => (spec, file) =>
  inside(file, spec, base) || allowed.includes(spec) ? null : 'outside its package'

describe('Hexagon boundaries', () => {
  it('[NFR-004] Given the domain package, When its imports are read, Then it imports only its own files', () => {
    expect(violations([pkg('domain')], onlyOwnFiles(pkg('domain')))).toEqual([])
  })

  it('[NFR-004] Given the application package, When its imports are read, Then it imports only itself and the domain', () => {
    expect(violations([pkg('application')], onlyOwnFiles(pkg('application'), ['@astro/domain']))).toEqual([])
  })

  it('[HEX-001] Given the domain and application packages, When their code is read, Then none of it uses the clock, randomness or a host global', () => {
    const uses = [pkg('domain'), pkg('application')].flatMap(d => sourceFiles(d)).flatMap(f => ambientUses(f))
    expect(uses).toEqual([])
  })

  it('[HEX-002] Given the renderer and preload, When their imports are read, Then they reach the main process only through the bridge and shared types', () => {
    const renderer = dir('src', 'renderer')
    const refused = violations([renderer], (spec, file) => {
      if (spec.startsWith('.')) return inside(file, spec, renderer) ? null : 'outside the renderer'
      if (spec.startsWith('@shared/')) return null
      if (spec.startsWith('@main') || spec.startsWith('@astro/')) return 'main-process or core code'
      if (spec === 'electron' || isNodeBuiltin(spec)) return 'Electron or Node is not available to the renderer'
      return null
    })
    const preload = violations([dir('src', 'preload')], spec =>
      spec === 'electron' || spec.startsWith('@shared/') || spec.startsWith('../shared/') ? null : 'the bridge passes messages only')
    expect([...refused, ...preload]).toEqual([])
  })

  it('[HEX-003] Given the shared types, When their imports are read, Then they import nothing outside src/shared', () => {
    expect(violations([dir('src', 'shared')], onlyOwnFiles(dir('src', 'shared')))).toEqual([])
  })

  it('[HEX-004] Given the driven adapters and presenters, When their imports are read, Then none reaches legacy code, IPC, composition or another adapter', () => {
    const adapters = dir('src', 'main', 'adapters')
    const refused = violations([adapters], (spec, file) => {
      if (!spec.startsWith('.')) return spec === 'electron' ? 'Electron belongs to the hosts that compose adapters' : null
      const to = target(file, spec)
      if (to.startsWith('src/main/adapters/shared/') || to === 'src/main/adapters/system-clock') return null
      if (to.startsWith('src/main/adapters/')) {
        const bothPresenters = /-presenter$/.test(path.basename(file, '.ts')) && /-presenter(\.ts)?$/.test(to)
        return bothPresenters ? null : 'another adapter; share code through adapters/shared'
      }
      if (to.startsWith('src/main/fits/') || to.startsWith('src/main/raw/')) return null
      return 'legacy services, the database connection, IPC and composition are off limits to adapters'
    })
    expect(refused).toEqual([])
  })

  it('[HEX-005] Given the main process, When it imports use-case factories, Then only the composition root does', () => {
    const composition = dir('src', 'main', 'composition.ts')
    const refused = violations([dir('src', 'main')], (spec, file, names, typeOnly) => {
      if (spec !== '@astro/application' || file === composition || typeOnly) return null
      const factories = names.filter(n => /^make[A-Z]/.test(n))
      return factories.length > 0 ? `builds ${factories.join(', ')} outside composition.ts` : null
    })
    expect(refused).toEqual([])
  })

  it('[HEX-006] Given the testkit, When its imports are read, Then it does not import the desktop app', () => {
    const testkit = dir('packages', 'testkit', 'src')
    const refused = violations([testkit], (spec, file) => {
      if (spec.startsWith('.')) return inside(file, spec, testkit) ? null : 'outside the testkit'
      return spec.startsWith('@main') || spec.startsWith('@shared') || spec.startsWith('@renderer') ? 'the desktop app' : null
    })
    expect(refused).toEqual([])
  })

  it('[HEX-007] Given the legacy services and file codecs, When their imports are read, Then none depends on adapters, IPC or composition', () => {
    const refused = violations(['services', 'fits', 'raw'].map(d => dir('src', 'main', d)), (spec, file) => {
      if (!spec.startsWith('.')) return null
      const to = target(file, spec)
      return /^src\/main\/(adapters|ipc)\//.test(to) || /^src\/main\/(composition|jobs-host)(\.ts)?$/.test(to) ? 'the new code depends on legacy, never the other way' : null
    })
    expect(refused).toEqual([])
  })

  it('[HEX-010] Given the adapters, When their code is read, Then only the system clock reads the time', () => {
    const clockReads = sourceFiles(dir('src', 'main', 'adapters'))
      .filter(f => path.basename(f) !== 'system-clock.ts')
      .flatMap(f => ambientUses(f))
      .filter(u => /reads the clock/.test(u))
    expect(clockReads).toEqual([])
  })
})

describe('The architecture check itself', () => {
  const probe = (files: Record<string, string>) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hexagon-'))
    for (const [name, code] of Object.entries(files)) fs.writeFileSync(path.join(tmp, name), code)
    return tmp
  }

  it('[NFR-004] [HEX-011] Given a core file with static, side-effect, dynamic, require and re-export imports, When checked, Then each escape is reported', () => {
    const tmp = probe({
      'probe.ts': [
        "import fs from 'fs'",
        "import 'better-sqlite3'",
        "export { getSqlite } from '../../src/main/db/connection'",
        "const later = () => import('electron')",
        "const old = require('child_process')",
        "import { ok } from './ok'"
      ].join('\n'),
      'ok.ts': 'export const ok = 1\n'
    })
    try {
      expect(violations([tmp], onlyOwnFiles(tmp)).map(v => v.replace(/ \(.*\)$/, ''))).toEqual([
        'probe.ts imports "fs"',
        'probe.ts imports "better-sqlite3"',
        'probe.ts imports "../../src/main/db/connection"',
        'probe.ts imports "electron"',
        'probe.ts imports "child_process"'
      ].map(v => `${rel(path.join(tmp, v.split(' ')[0]))}${v.slice(v.indexOf(' '))}`))
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('[HEX-001] Given core code that reads the clock, randomness and host globals, When checked, Then each use is reported and look-alikes are not', () => {
    const file = path.join(os.tmpdir(), 'ambient-probe.ts')
    const uses = ambientUses(file, [
      'const a = Date.now()',
      'const b = new Date()',
      "const c = new Date('2026-10-11T00:00:00Z')",
      'const d = Math.random()',
      'console.log(a)',
      'setTimeout(() => {}, 1)',
      'const e = process.env.HOME',
      'const f = { process: 1, console: 2 }',
      'const g = job.process',
      'function h(timeout: { setTimeout: number }) { return timeout.setTimeout }'
    ].join('\n')).map(u => u.replace(/^.*:(\d+) /, '$1 '))
    expect(uses).toEqual([
      '1 Date.now reads the clock',
      '2 new Date() reads the clock',
      '4 Math.random is not deterministic',
      '5 console is a host global',
      '6 setTimeout is a host global',
      '7 process is a host global'
    ])
  })

  it('[HEX-005] Given a type-only import of a factory, When read, Then it is marked type-only', () => {
    const file = path.join(os.tmpdir(), 'types-probe.ts')
    const [typed, real] = [
      importsOf(file, "import type { makeX } from '@astro/application'"),
      importsOf(file, "import { makeX, type Y } from '@astro/application'")
    ]
    expect(typed[0]).toMatchObject({ names: ['makeX'], typeOnly: true })
    expect(real[0]).toMatchObject({ names: ['makeX', 'Y'], typeOnly: false })
  })
})
