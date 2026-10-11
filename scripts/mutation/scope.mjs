// What the mutation gate mutates, and how hard it is allowed to fail. Plain JavaScript so that
// stryker.config.mjs, the changed-files runner and the unit tests all share one definition.
import fs from 'node:fs'
import path from 'node:path'

/** The core: the only code the gate mutates. */
export const CORE_ROOTS = ['packages/domain/src/', 'packages/application/src/']

/** Port files that hold runtime code (not only interfaces), so they are worth mutating. */
export const RUNTIME_PORTS = ['packages/application/src/ports/archive.ts']

/** Written beside the report when a changed-files run has nothing to mutate. */
export const SKIPPED_NOTE = 'skipped.txt'

/**
 * The break threshold used when MUTATION_BREAK is not set. The first full run (2026-10-11) scored
 * 76.8% overall with the weakest sizeable files near 67%; the floor sits below those so a pull
 * request touching one of them still passes. Raise it as survivors are killed; never lower it.
 */
export const DEFAULT_BREAK = 65

/** Normalises a repository-relative path to forward slashes, whatever the platform. */
export function toPosix(file) {
  return file.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * True for a core source file the gate mutates: TypeScript under packages/domain/src or
 * packages/application/src, excluding the index.ts barrels and the interface-only port files.
 */
export function isMutable(file) {
  const f = toPosix(file)
  if (!CORE_ROOTS.some(root => f.startsWith(root))) return false
  if (!f.endsWith('.ts') || f.endsWith('.d.ts')) return false
  if (f.endsWith('/index.ts')) return false
  if (f.includes('/ports/')) return RUNTIME_PORTS.includes(f)
  return true
}

/** Every mutable file in the repository at `root`, sorted. */
export function listMutable(root = process.cwd()) {
  const out = []
  const walk = dir => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}${e.name}`
      if (e.isDirectory()) walk(`${rel}/`)
      else if (isMutable(rel)) out.push(rel)
    }
  }
  for (const r of CORE_ROOTS) if (fs.existsSync(path.join(root, r))) walk(r)
  return out.sort()
}

/** The gate's own set-up: a change to any of these is checked by a run on SMOKE_TARGET. */
export const GATE_FILES = [
  'stryker.config.mjs', 'vitest.mutation.config.ts', 'tsconfig.mutation.json', 'package.json', 'package-lock.json',
  '.github/workflows/mutation.yml'
]
export const GATE_DIRS = ['scripts/mutation/']

/** A small, fully tested core file a run mutates to prove the gate still works end to end. */
export const SMOKE_TARGET = 'packages/domain/src/scan-pacing.ts'

const isGateFile = f => GATE_FILES.includes(f) || GATE_DIRS.some(d => f.startsWith(d))

/**
 * The core source files a changed core test most likely covers: packages/<p>/test/<x>.test.ts
 * names packages/<p>/src/<x>.ts or packages/<p>/src/use-cases/<x>.ts.
 */
export function sourcesForTest(file) {
  const m = /^(packages\/(?:domain|application))\/test\/(.+)\.test\.ts$/.exec(toPosix(file))
  return m ? [`${m[1]}/src/${m[2]}.ts`, `${m[1]}/src/use-cases/${m[2]}.ts`] : []
}

/**
 * The files a changed-files run mutates, from `changed` (paths as git prints them): the mutable
 * core files that changed, the ones a changed core test covers, and SMOKE_TARGET when the gate's
 * own set-up changed and nothing else would run. Only files that still exist; deduplicated and sorted.
 */
export function changedTargets(changed, exists = f => fs.existsSync(f)) {
  const paths = [...new Set(changed.map(c => toPosix(c.trim())).filter(Boolean))]
  const candidates = paths.flatMap(f => [f, ...sourcesForTest(f)])
  const targets = [...new Set(candidates)].filter(f => isMutable(f) && exists(f)).sort()
  if (targets.length === 0 && paths.some(isGateFile) && exists(SMOKE_TARGET)) return [SMOKE_TARGET]
  return targets
}

/**
 * The score below which a run fails. MUTATION_BREAK overrides the default; an empty or invalid
 * value falls back to it rather than silently switching the gate off.
 */
export function breakThreshold(env = process.env) {
  const raw = env.MUTATION_BREAK
  if (raw === undefined || raw.trim() === '') return DEFAULT_BREAK
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_BREAK
}
