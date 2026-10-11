/**
 * `npm run test:fuzz`: the fuzz tests alone, with many more runs per property than `npm test`
 * gives them (specs/029-property-fuzz, FUZ-008). FUZZ_RUNS overrides the count; FUZZ_SEED and
 * FUZZ_PATH replay a reported failure. Extra arguments go to vitest, such as `-t parseSirilSolve`.
 */
import { spawnSync } from 'child_process'

const DEFAULT_RUNS = 20_000

const env = { ...process.env, FUZZ_RUNS: process.env.FUZZ_RUNS || String(DEFAULT_RUNS) }
const result = spawnSync('npx', ['vitest', 'run', 'tests/fuzz', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})
process.exit(result.status ?? 1)
