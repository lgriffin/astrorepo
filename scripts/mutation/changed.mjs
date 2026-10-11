// Mutation-tests only the core files that differ from a base ref (default origin/main).
//
//   node scripts/mutation/changed.mjs [--base <ref>] [-- <extra stryker args>]
//
// Changed means: committed since the merge base with <ref>, plus uncommitted and untracked files.
// With no changed core file it exits 0 without starting Stryker.
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { changedTargets } from './scope.mjs'

const args = process.argv.slice(2)
const sep = args.indexOf('--')
const own = sep === -1 ? args : args.slice(0, sep)
const passthrough = sep === -1 ? [] : args.slice(sep + 1)
const baseAt = own.indexOf('--base')
const base = baseAt === -1 ? process.env.MUTATION_BASE || 'origin/main' : own[baseAt + 1]

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split(/\r?\n/)

const changed = [
  ...git('diff', '--name-only', '--diff-filter=d', `${base}...HEAD`),
  ...git('diff', '--name-only', '--diff-filter=d', 'HEAD'),
  ...git('ls-files', '--others', '--exclude-standard')
]
const targets = changedTargets(changed)

if (targets.length === 0) {
  console.log(`No core source file differs from ${base}: nothing to mutate.`)
  process.exit(0)
}

console.log(`Mutating ${targets.length} file(s) changed since ${base}:\n  ${targets.join('\n  ')}`)
// The package's exports hide its bin, so run it by path (npx needs a shell on Windows).
const stryker = path.join('node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js')
const run = spawnSync(process.execPath, [stryker, 'run', '--mutate', targets.join(','), ...passthrough], { stdio: 'inherit' })
process.exit(run.status ?? 1)
