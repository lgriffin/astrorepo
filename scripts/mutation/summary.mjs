// Turns Stryker's JSON report into a Markdown score table.
//
//   node scripts/mutation/summary.mjs [reports/mutation/mutation.json] >> "$GITHUB_STEP_SUMMARY"
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SKIPPED_NOTE, breakThreshold } from './scope.mjs'

const DETECTED = ['Killed', 'Timeout']
const UNDETECTED = ['Survived', 'NoCoverage']

/**
 * Stryker's mutation score: detected mutants over valid ones (detected + undetected). Ignored
 * mutants, compile errors and runtime errors are not valid and do not count. Null with no valid
 * mutant.
 */
export function score(mutants) {
  const detected = mutants.filter(m => DETECTED.includes(m.status)).length
  const undetected = mutants.filter(m => UNDETECTED.includes(m.status)).length
  const valid = detected + undetected
  return { detected, survived: undetected, valid, score: valid === 0 ? null : (detected / valid) * 100 }
}

const pct = s => (s === null ? 'n/a' : `${s.toFixed(2)}%`)

/** Package of a core file: domain or application. */
const pkg = file => file.replace(/\\/g, '/').split('/')[1] ?? file

/**
 * The files scoring below `threshold`, lowest first: the gate holds every file to the floor, not
 * only the run as a whole, so one well-tested file cannot carry a weak one past it. Files with no
 * valid mutant have no score and are never below.
 */
export function filesBelow(report, threshold) {
  return Object.entries(report.files ?? {})
    .map(([file, f]) => ({ file, score: score(f.mutants).score }))
    .filter(f => f.score !== null && f.score < threshold)
    .sort((a, b) => a.score - b.score || a.file.localeCompare(b.file))
}

/**
 * A Markdown summary: overall score, per package, then per file with the most survivors first,
 * and the files under `floor` when one is given.
 */
export function summarise(report, top = 15, floor = null) {
  const files = Object.entries(report.files ?? {}).map(([file, f]) => ({ file, ...score(f.mutants) }))
  const all = score(Object.values(report.files ?? {}).flatMap(f => f.mutants))
  const lines = [`## Mutation score: ${pct(all.score)}`, '',
    `${all.detected} of ${all.valid} valid mutants killed, ${all.survived} survived or not covered.`, '',
    '| Package | Score | Killed | Survived |', '|---|---:|---:|---:|']
  for (const name of [...new Set(files.map(f => pkg(f.file)))].sort()) {
    const s = score(Object.entries(report.files).filter(([f]) => pkg(f) === name).flatMap(([, f]) => f.mutants))
    lines.push(`| ${name} | ${pct(s.score)} | ${s.detected} | ${s.survived} |`)
  }
  const worst = files.filter(f => f.survived > 0).sort((a, b) => b.survived - a.survived || a.file.localeCompare(b.file)).slice(0, top)
  if (worst.length > 0) {
    lines.push('', '| File | Score | Survived |', '|---|---:|---:|')
    for (const f of worst) lines.push(`| ${f.file} | ${pct(f.score)} | ${f.survived} |`)
  }
  const below = floor === null ? [] : filesBelow(report, floor)
  if (below.length > 0) {
    lines.push('', `**Under the ${floor}% floor:** ${below.map(f => `${f.file} (${pct(f.score)})`).join(', ')}`)
  }
  return lines.join('\n') + '\n'
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const file = process.argv[2] ?? 'reports/mutation/mutation.json'
  const skipped = path.join(path.dirname(file), SKIPPED_NOTE)
  if (!fs.existsSync(file) && fs.existsSync(skipped)) {
    console.log(`## Mutation score\n\nSkipped. ${fs.readFileSync(skipped, 'utf8').trim()}\n`)
  } else if (!fs.existsSync(file)) {
    console.log(`## Mutation score\n\nNo report at ${file}: the run did not get as far as testing mutants.\n`)
  } else {
    console.log(summarise(JSON.parse(fs.readFileSync(file, 'utf8')), Number(process.argv[3] ?? 15), breakThreshold()))
  }
}
