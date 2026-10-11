import { defineConfig } from 'vitest/config'
import base from './vitest.config'

/**
 * The test set Stryker runs against each mutant: only the core's own unit tests. The contract
 * suites under tests/contracts exercise adapters (SQLite, the file system) rather than the core's
 * rules, so they would only slow every mutant down. Built by spreading rather than mergeConfig,
 * which would concatenate the include lists instead of replacing them.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['packages/*/test/**/*.test.ts'],
    coverage: { enabled: false }
  }
})
