import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, it } from 'vitest'
import { DataTable } from './data-table'
import { compileFeature, type CompiledFeature, type CompiledGroup, type CompiledScenario, type CompiledStep } from './feature'
import type { StepLibrary, StepMatch } from './steps'

const stepLine = (s: CompiledStep) => `${s.written} ${s.text}`

/** Thrown before any step runs when a scenario has undefined or ambiguous steps. */
export class StepDefinitionError extends Error {
  override name = 'StepDefinitionError'
}

function resolve<W>(scenario: CompiledScenario, library: StepLibrary<W>): StepMatch<W>[] {
  const problems: string[] = []
  const matches = scenario.steps.map(step => {
    const found = library.match(step.text)
    const at = `${scenario.uri}:${step.line}`
    if (found.length === 0) {
      const argument = step.argument instanceof DataTable ? 'table' : typeof step.argument === 'string' ? 'docString' : null
      problems.push(`Undefined step at ${at}: ${stepLine(step)}\nAdd a step definition such as:\n\n${library.snippet(step.keyword, step.text, argument)}`)
    } else if (found.length > 1) {
      const list = found.map(m => `  ${m.definition.keyword}('${m.definition.expression.source}') at ${m.definition.where}`)
      problems.push(`Ambiguous step at ${at}: ${stepLine(step)}\nIt matches ${found.length} step definitions:\n${list.join('\n')}`)
    }
    return found[0]
  })
  if (problems.length > 0) throw new StepDefinitionError(`Scenario "${scenario.name}" cannot run.\n\n${problems.join('\n\n')}`)
  return matches
}

/**
 * Runs one scenario: checks every step has exactly one definition, creates a fresh World, then
 * runs the steps in order, awaiting each. A failing step stops the scenario; the error names the
 * step and the steps skipped after it. Resolves to the World, for tests of the runner.
 */
export async function runScenario<W>(scenario: CompiledScenario, library: StepLibrary<W>): Promise<W> {
  const matches = resolve(scenario, library)
  const world = await library.createWorld()
  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i]
    const { definition, args } = matches[i]
    try {
      await definition.fn(world, ...args, ...(step.argument === null ? [] : [step.argument]))
    } catch (e) {
      const skipped = scenario.steps.slice(i + 1).map(s => `  skipped: ${stepLine(s)}`)
      const context = [`Step failed at ${scenario.uri}:${step.line}: ${stepLine(step)}`, ...skipped].join('\n')
      if (e instanceof Error) {
        e.message = `${context}\n\n${e.message}`
        throw e
      }
      throw new Error(`${context}\n\n${String(e)}`, { cause: e })
    }
  }
  return world
}

/** The parts of vitest the runner registers tests with; tests of the runner pass their own. */
export interface TestApi {
  describe: (title: string, body: () => void) => void
  it: (title: string, body: () => Promise<unknown>) => void
}

const vitest: TestApi = { describe, it }

function registerGroup<W>(group: CompiledGroup, library: StepLibrary<W>, api: TestApi): void {
  api.describe(group.title, () => {
    for (const scenario of group.scenarios) api.it(scenario.title, () => runScenario(scenario, library))
    for (const rule of group.rules) registerGroup(rule, library, api)
  })
}

/** Registers one describe per feature (and rule) and one it per scenario and outline row. */
export function registerFeature<W>(feature: CompiledFeature, library: StepLibrary<W>, api: TestApi = vitest): void {
  registerGroup(feature, library, api)
}

/** Parses Gherkin text and registers its scenarios as tests. */
export function runFeatureSource<W>(source: string, uri: string, library: StepLibrary<W>, api: TestApi = vitest): CompiledFeature {
  const feature = compileFeature(source, uri)
  registerFeature(feature, library, api)
  return feature
}

/**
 * Reads a .feature file and registers its scenarios as tests. Pass a path relative to the
 * working directory, or new URL('./x.feature', import.meta.url).
 */
export function runFeature<W>(file: string | URL, library: StepLibrary<W>, api: TestApi = vitest): CompiledFeature {
  const full = typeof file === 'string' ? path.resolve(file) : fileURLToPath(file)
  const uri = path.relative(process.cwd(), full).split(path.sep).join('/')
  return runFeatureSource(fs.readFileSync(full, 'utf8'), uri, library, api)
}
