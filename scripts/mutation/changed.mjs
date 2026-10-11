// Mutation-tests only the core files that differ from a base ref (default origin/main).
//
//   node scripts/mutation/changed.mjs [--base <ref>] [-- <extra stryker args>]
//
// Changed means: committed since the merge base with <ref>, plus uncommitted and untracked files.
// A changed core test also mutates the source it covers; a change to the gate's own set-up mutates
// one small smoke file. With nothing to mutate it exits 0 without starting Stryker.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { SKIPPED_NOTE, changedTargets } from './scope.mjs'

const args = process.argv.slice(2)
const sep = args.indexOf('--')
const own = sep === -1 ? args : args.slice(0, sep)
const passthrough = sep === -1 ? [] : args.slice(sep + 1)
const baseAt = own.indexOf('--base')
const base = baseAt === -1 ? process.env.MUTATION_BASE || 'origin/main' : own[baseAt + 1]
if (!base || base.startsWith('-')) {
  console.error('Usage: node scripts/mutation/changed.mjs [--base <ref>] [-- <stryker args>]')
  process.exit(2)
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split(/\r?\n/)

const changed = [
  ...git('diff', '--name-only', '--diff-filter=d', `${base}...HEAD`),
  ...git('diff', '--name-only', '--diff-filter=d', 'HEAD'),
  ...git('ls-files', '--others', '--exclude-standard')
]
const targets = changedTargets(changed)

// The CI summary step reads this note, so a skipped run does not read as one that failed.
const skipNote = path.join('reports', 'mutation', SKIPPED_NOTE)
fs.rmSync(skipNote, { force: true })

if (targets.length === 0) {
  const note = `No core source file, core test or mutation set-up differs from ${base}: nothing to mutate.`
  console.log(note)
  fs.mkdirSync(path.dirname(skipNote), { recursive: true })
  fs.writeFileSync(skipNote, `${note}\n`)
  process.exit(0)
}

console.log(`Mutating ${targets.length} file(s) changed since ${base}:\n  ${targets.join('\n  ')}`)
// The package's exports hide its bin, so run it by path (npx needs a shell on Windows).
const stryker = path.join('node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js')
const run = spawnSync(process.execPath, [stryker, 'run', '--mutate', targets.join(','), ...passthrough], { stdio: 'inherit' })
process.exit(run.status ?? 1)
