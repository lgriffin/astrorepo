// Fails when any file in a Stryker report scores below the break threshold (MUT-010). Stryker's own
// break looks only at the run's overall score, so one well-tested file could carry a weak one.
//
//   node scripts/mutation/floor.mjs [reports/mutation/mutation.json]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SKIPPED_NOTE, breakThreshold } from './scope.mjs'
import { filesBelow } from './summary.mjs'

/**
 * Checks the report at `file` against `threshold`: ok with nothing below it, or the lines naming
 * each file under it. A run the changed-files mode skipped passes; a missing report does not.
 */
export function checkFloor(file, threshold = breakThreshold()) {
  if (!fs.existsSync(file)) {
    if (fs.existsSync(path.join(path.dirname(file), SKIPPED_NOTE))) return { ok: true, lines: ['The mutation run was skipped: no file to hold to the floor.'] }
    return { ok: false, lines: [`No mutation report at ${file}: nothing to check against the ${threshold}% floor.`] }
  }
  const below = filesBelow(JSON.parse(fs.readFileSync(file, 'utf8')), threshold)
  if (below.length === 0) return { ok: true, lines: [`Every mutated file scores at least ${threshold}%.`] }
  return {
    ok: false,
    lines: [`${below.length} ${below.length === 1 ? 'file scores' : 'files score'} below the ${threshold}% floor:`, ...below.map(f => `  ${f.file}: ${f.score.toFixed(2)}%`)]
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const result = checkFloor(process.argv[2] ?? 'reports/mutation/mutation.json')
  for (const line of result.lines) (result.ok ? console.log : console.error)(line)
  process.exit(result.ok ? 0 : 1)
}
