// What the mutation gate mutates, and how hard it is allowed to fail. Plain JavaScript so that
// stryker.config.mjs, the changed-files runner and the unit tests all share one definition.
import fs from 'node:fs'
import path from 'node:path'

/** The core: the only code the gate mutates. */
export const CORE_ROOTS = ['packages/domain/src/', 'packages/application/src/']

/** Port files that hold runtime code (not only interfaces), so they are worth mutating. */
export const RUNTIME_PORTS = ['packages/application/src/ports/archive.ts']

/** The break threshold used when MUTATION_BREAK is not set. */
export const DEFAULT_BREAK = 80

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

/**
 * The files a changed-files run mutates: the mutable files among `changed` (paths as git prints
 * them) that still exist, deduplicated and sorted.
 */
export function changedTargets(changed, exists = f => fs.existsSync(f)) {
  return [...new Set(changed.map(c => toPosix(c.trim())).filter(Boolean))]
    .filter(f => isMutable(f) && exists(f))
    .sort()
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
