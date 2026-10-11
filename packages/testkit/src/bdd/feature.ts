import { generateMessages } from '@cucumber/gherkin'
import {
  IdGenerator, PickleStepType, SourceMediaType,
  type Feature, type Pickle, type Rule, type Scenario, type Step, type Tag, type TableRow
} from '@cucumber/messages'
import { DataTable } from './data-table'
import type { StepKeyword } from './steps'

export interface CompiledStep {
  /** Given, When or Then; And and But take the keyword of the step before them. */
  keyword: StepKeyword
  /** The keyword as written in the file, such as "And". */
  written: string
  text: string
  line: number
  argument: DataTable | string | null
}

export interface CompiledScenario {
  /** The test title: requirement tags in square brackets, then the scenario name. */
  title: string
  name: string
  /** Every tag that applies, inherited ones included, such as "@ING-001". */
  tags: string[]
  uri: string
  line: number
  steps: CompiledStep[]
}

export interface CompiledGroup {
  /** The suite title: the feature's or rule's requirement tags in square brackets, then its name. */
  title: string
  name: string
  tags: string[]
  scenarios: CompiledScenario[]
  rules: CompiledGroup[]
}

export interface CompiledFeature extends CompiledGroup {
  uri: string
}

const REQUIREMENT_TAG = /^@([A-Z]{2,4}-\d{3})$/

/** "[ING-001] [ING-003] name" from the requirement tags among `tags`; other tags are left out. */
export function titled(tags: readonly string[], name: string): string {
  const ids = tags.map(t => REQUIREMENT_TAG.exec(t)?.[1]).filter((id): id is string => !!id)
  return [...ids.map(id => `[${id}]`), name].join(' ').trim()
}

const KEYWORD: Record<string, StepKeyword> = {
  [PickleStepType.CONTEXT]: 'Given',
  [PickleStepType.ACTION]: 'When',
  [PickleStepType.OUTCOME]: 'Then'
}

const names = (tags: readonly Tag[]) => tags.map(t => t.name)

/** Parses Gherkin text into its features, rules and runnable scenarios (one per outline row). */
export function compileFeature(source: string, uri: string): CompiledFeature {
  const envelopes = generateMessages(source, uri, SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    includeGherkinDocument: true,
    includePickles: true,
    newId: IdGenerator.incrementing()
  })
  const errors = envelopes.flatMap(e => (e.parseError ? [e.parseError] : []))
  if (errors.length > 0) {
    const lines = errors.map(e => `  ${uri}:${e.source.location?.line ?? '?'}: ${e.message}`)
    throw new Error(`Cannot parse feature file ${uri}:\n${lines.join('\n')}`)
  }
  const feature = envelopes.find(e => e.gherkinDocument)?.gherkinDocument?.feature
  if (!feature) throw new Error(`Feature file ${uri} has no Feature`)
  const pickles = envelopes.flatMap(e => (e.pickle ? [e.pickle] : []))

  const steps = new Map<string, Step>()
  const rows = new Map<string, { header: TableRow; row: TableRow; tags: string[] }>()
  const indexScenario = (s: Scenario) => {
    for (const step of s.steps) steps.set(step.id, step)
    for (const ex of s.examples) {
      for (const row of ex.tableBody) rows.set(row.id, { header: ex.tableHeader!, row, tags: names(ex.tags) })
    }
  }
  const indexChildren = (children: Feature['children'] | Rule['children']) => {
    for (const c of children) {
      if (c.background) for (const step of c.background.steps) steps.set(step.id, step)
      if (c.scenario) indexScenario(c.scenario)
      if ('rule' in c && c.rule) indexChildren(c.rule.children)
    }
  }
  indexChildren(feature.children)

  const compileScenario = (scenario: Scenario, inherited: string[]): CompiledScenario[] =>
    pickles.filter(p => p.astNodeIds[0] === scenario.id).map(p => compilePickle(p, scenario, inherited))

  const compilePickle = (pickle: Pickle, scenario: Scenario, inherited: string[]): CompiledScenario => {
    const example = pickle.astNodeIds[1] ? rows.get(pickle.astNodeIds[1]) : undefined
    const own = [...names(scenario.tags), ...(example?.tags ?? [])]
    let name = pickle.name
    if (example) {
      const values = example.header.cells.map((h, i) => `${h.value}: ${example.row.cells[i]?.value ?? ''}`)
      name = `${name} (${values.join(', ')})`
    }
    let previous: StepKeyword = 'Given'
    return {
      title: titled(own, name),
      name,
      tags: [...inherited, ...own],
      uri,
      line: example?.row.location.line ?? scenario.location.line,
      steps: pickle.steps.map(ps => {
        const step = steps.get(ps.astNodeIds[0])!
        const keyword = (ps.type && KEYWORD[ps.type]) || previous
        previous = keyword
        const table = ps.argument?.dataTable
        const doc = ps.argument?.docString
        return {
          keyword,
          written: step.keyword.trim(),
          text: ps.text,
          line: step.location.line,
          argument: table ? new DataTable(table.rows.map(r => r.cells.map(c => c.value))) : doc ? doc.content : null
        }
      })
    }
  }

  const group = (name: string, tags: string[], children: Feature['children'] | Rule['children'], inherited: string[]): CompiledGroup => {
    const all = [...inherited, ...tags]
    return {
      title: titled(tags, name),
      name,
      tags,
      scenarios: children.flatMap(c => (c.scenario ? compileScenario(c.scenario, all) : [])),
      rules: children.flatMap(c => ('rule' in c && c.rule ? [group(c.rule.name, names(c.rule.tags), c.rule.children, all)] : []))
    }
  }

  return { uri, ...group(feature.name, names(feature.tags), feature.children, []) }
}
