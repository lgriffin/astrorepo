import {
  CucumberExpressionGenerator, ExpressionFactory, ParameterType, ParameterTypeRegistry, type Expression
} from '@cucumber/cucumber-expressions'

export type StepKeyword = 'Given' | 'When' | 'Then'

/**
 * A step body. It gets the scenario's World first, then the expression's parameters, then the
 * step's data table or doc string when it has one. It may be async.
 */
export type StepFn<W> = (world: W, ...args: any[]) => unknown

export interface StepDefinition<W> {
  keyword: StepKeyword
  expression: Expression
  fn: StepFn<W>
  /** Where the definition was written, for ambiguity reports. */
  where: string
}

export interface StepMatch<W> {
  definition: StepDefinition<W>
  args: unknown[]
}

type Define<W> = (expression: string | RegExp, fn: StepFn<W>) => void

export interface ParameterTypeOptions<T> {
  name: string
  regexp: RegExp | string
  transform: (...match: string[]) => T
}

export interface StepApi<W> {
  Given: Define<W>
  When: Define<W>
  Then: Define<W>
  /** Registers a parameter type such as {filter}; register it before steps that use it. */
  defineParameterType: <T>(options: ParameterTypeOptions<T>) => void
}

function callerLocation(): string {
  const frames = (new Error().stack ?? '').split('\n').slice(1)
  const frame = frames.find(f => !/[\\/]bdd[\\/]/.test(f) && /\.[cm]?[tj]s/.test(f))
  const m = frame && /\(?((?:file:\/\/)?[^()\s]+:\d+):\d+\)?\s*$/.exec(frame)
  return m ? m[1].replace(/^file:\/\//, '') : 'unknown location'
}

/**
 * Step definitions plus the World factory each scenario starts from. Matching ignores the step's
 * keyword, as in Cucumber, so "And" and "But" steps find their definition like any other.
 */
export class StepLibrary<W> {
  readonly definitions: StepDefinition<W>[] = []
  readonly registry = new ParameterTypeRegistry()
  private readonly factory = new ExpressionFactory(this.registry)

  constructor(readonly createWorld: () => W | Promise<W>) {}

  add(keyword: StepKeyword, expression: string | RegExp, fn: StepFn<W>): void {
    this.definitions.push({ keyword, expression: this.factory.createExpression(expression), fn, where: callerLocation() })
  }

  /** Every definition whose expression matches the step text, with its parameter values. */
  match(text: string): StepMatch<W>[] {
    const out: StepMatch<W>[] = []
    for (const definition of this.definitions) {
      const args = definition.expression.match(text)
      if (args) out.push({ definition, args: args.map(a => a.getValue(null)) })
    }
    return out
  }

  /** A step definition to paste for a step no definition matches. */
  snippet(keyword: StepKeyword, text: string, argument: 'table' | 'docString' | null): string {
    const generated = new CucumberExpressionGenerator(() => this.registry.parameterTypes).generateExpressions(text)[0]
    const source = (generated?.source ?? text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const params = ['world', ...(generated?.parameterNames ?? [])]
    if (argument === 'table') params.push('table')
    if (argument === 'docString') params.push('docString')
    return `${keyword}('${source}', (${params.join(', ')}) => {\n  throw new Error('Step not written yet')\n})`
  }
}

/** Defines the steps for one area of features, and the World each scenario gets fresh. */
export function defineSteps<W>(world: () => W | Promise<W>, register: (api: StepApi<W>) => void): StepLibrary<W> {
  const library = new StepLibrary(world)
  register({
    Given: (e, fn) => library.add('Given', e, fn),
    When: (e, fn) => library.add('When', e, fn),
    Then: (e, fn) => library.add('Then', e, fn),
    defineParameterType: ({ name, regexp, transform }) => {
      library.registry.defineParameterType(new ParameterType(name, regexp, null, transform, true, false))
    }
  })
  return library
}
