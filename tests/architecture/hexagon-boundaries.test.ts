import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const root = path.resolve(__dirname, '../..')
const IMPORT = /(?:^|\n)\s*(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? sourceFiles(full) : /\.tsx?$/.test(e.name) ? [full] : []
  })
}

function importsOf(file: string): string[] {
  const code = fs.readFileSync(file, 'utf8')
  return [...code.matchAll(IMPORT)].map(m => m[1] ?? m[2] ?? m[3])
}

/** Imports under `dir` that are neither relative inside `dir` nor in `allowedPackages`. */
function violations(dir: string, allowedPackages: string[] = []): string[] {
  return sourceFiles(dir).flatMap(file =>
    importsOf(file)
      .filter(spec => {
        if (spec.startsWith('.')) {
          const target = path.resolve(path.dirname(file), spec)
          return path.relative(dir, target).startsWith('..')
        }
        return !allowedPackages.includes(spec)
      })
      .map(spec => `${path.relative(dir, file)} imports "${spec}"`))
}

const pkg = (name: string) => path.join(root, 'packages', name, 'src')

describe('Hexagon boundaries', () => {
  it('[NFR-004] Given the domain package, When its imports are read, Then it imports only its own files', () => {
    expect(violations(pkg('domain'))).toEqual([])
  })

  it('[NFR-004] Given the application package, When its imports are read, Then it imports only itself and the domain', () => {
    expect(violations(pkg('application'), ['@astro/domain'])).toEqual([])
  })

  it('[NFR-004] Given a core file that imports I/O, a framework or escapes its package, When checked, Then each import is reported', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexagon-'))
    try {
      fs.writeFileSync(path.join(dir, 'probe.ts'), [
        "import fs from 'fs'",
        "import Database from 'better-sqlite3'",
        "import { getSqlite } from '../../src/main/db/connection'",
        "import { ok } from './ok'"
      ].join('\n'))
      fs.writeFileSync(path.join(dir, 'ok.ts'), 'export const ok = 1\n')

      expect(violations(dir)).toEqual([
        'probe.ts imports "fs"',
        'probe.ts imports "better-sqlite3"',
        'probe.ts imports "../../src/main/db/connection"'
      ])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
