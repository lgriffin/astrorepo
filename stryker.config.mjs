// @ts-check
import { breakThreshold, listMutable } from './scripts/mutation/scope.mjs'

/**
 * Mutation testing for the hexagonal core (packages/domain and packages/application).
 * See docs/testing/mutation.md for how to run it and read the report.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'npm',
  // Every core source file except the index.ts barrels and interface-only ports (scope.mjs).
  // test:mutation:changed overrides this with --mutate.
  mutate: listMutable(),
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.mutation.config.ts',
    // Run every test that covers a mutant, not only those vitest's import graph calls related.
    related: false
  },
  coverageAnalysis: 'perTest',
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.mutation.json',
  ignoreStatic: true,
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['html', 'json', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  clearTextReporter: { allowColor: false, logTests: false, reportScoreTable: true, reportMutants: false },
  // break: MUTATION_BREAK, or the floor the core has reached (DEFAULT_BREAK in scope.mjs).
  thresholds: { high: 90, low: 80, break: breakThreshold() },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
  timeoutMS: 10000
}
