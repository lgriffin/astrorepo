/**
 * The rules of `npm run new:slice` (specs/045-developer-experience, D5): what a new slice starts
 * with, so its first commit already passes every gate. A slice is a spec folder with an EARS
 * requirement, a pure rule in the domain package, and a test that cites the requirement.
 */

export interface SlicePlan {
  /** The spec folder, number and name: 047-dark-sites. */
  spec: string
  /** The requirement ID prefix, two to four capitals: DSK. */
  prefix: string
  /** What the slice is called, in sentence case: Dark sites. */
  title: string
}

/** What already exists, so a plan does not clash with it. */
export interface Existing {
  specFolders: readonly string[]
  /** Every ID prefix any spec uses. */
  prefixes: readonly string[]
  /** Paths, relative to the checkout, that already exist. */
  files: readonly string[]
}

export interface SliceFile {
  path: string
  content: string
}

const SPEC = /^(\d{3})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/
const PREFIX = /^[A-Z]{2,4}$/

/** The flags given to the command, read into a plan; a name without a number takes the next free one. */
export function parseSliceArgs(argv: readonly string[], specFolders: readonly string[]): Partial<SlicePlan> {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    const v = i >= 0 ? argv[i + 1] : undefined
    return v && !v.startsWith('--') ? v.trim() : undefined
  }
  const name = value('--name') ?? value('--spec')
  const spec = name && !/^\d{3}-/.test(name) ? `${nextSpecNumber(specFolders)}-${name}` : name
  return { spec, prefix: value('--prefix'), title: value('--title') }
}

/** The number after the highest spec folder's, three digits. */
export function nextSpecNumber(specFolders: readonly string[]): string {
  const numbers = specFolders.map(f => /^(\d{3})-/.exec(f)?.[1]).filter((n): n is string => !!n).map(Number)
  return String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, '0')
}

/** Every ID prefix a spec's requirements table uses. */
export function prefixesIn(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/^\|\s*([A-Z]{2,4})-\d{3}\s*\|/gm)].map(m => m[1]))]
}

/** Why a plan cannot be written; none means it can. */
export function sliceProblems(plan: Partial<SlicePlan>, existing: Existing): string[] {
  const problems: string[] = []
  if (!plan.spec) problems.push('Name the slice: --name dark-sites (or --spec 047-dark-sites).')
  else if (!SPEC.test(plan.spec)) problems.push(`The spec folder ${plan.spec} should be three digits, a dash and lower-case words joined by dashes, as 047-dark-sites.`)
  else {
    const number = plan.spec.slice(0, 3)
    const taken = existing.specFolders.find(f => f.slice(0, 3) === number)
    if (taken) problems.push(`Spec number ${number} is taken by ${taken}.`)
  }
  if (!plan.prefix) problems.push('Give the requirement prefix: --prefix DSK (two to four capitals).')
  else if (!PREFIX.test(plan.prefix)) problems.push(`The prefix ${plan.prefix} should be two to four capitals, as DSK.`)
  else if (existing.prefixes.includes(plan.prefix)) problems.push(`The prefix ${plan.prefix} is already used by another spec.`)
  if (!plan.title) problems.push('Give the slice a title: --title "Dark sites".')
  if (problems.length === 0) {
    for (const f of sliceFiles(plan as SlicePlan)) if (existing.files.includes(f.path)) problems.push(`${f.path} already exists; nothing was written.`)
  }
  return problems
}

/** The slice's name without its number: dark-sites. */
export function sliceName(plan: SlicePlan): string {
  return plan.spec.replace(/^\d{3}-/, '')
}

const pascal = (name: string): string => name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')

/** The files a new slice starts with. */
export function sliceFiles(plan: SlicePlan): SliceFile[] {
  const name = sliceName(plan)
  const type = pascal(name)
  const rule = `${type[0].toLowerCase()}${type.slice(1)}Problems`
  const id = `${plan.prefix}-001`
  return [
    {
      path: `specs/${plan.spec}/requirements.md`,
      content: `# ${plan.spec.slice(0, 3)} ${plan.title}: requirements

Who asked, when, and in their words. Then what this slice delivers, in plain words, and what it
leaves out. Replace the example requirement below with the slice's own; every ID needs a test
whose title cites it (\`npm run ears\`).

## What this slice delivers

- **The example rule.** ${plan.title} is described by a name, and a name that is blank is refused.

## Out of scope

- 

## Requirements

| ID | Pattern | Requirement |
|----|---------|-------------|
| ${id} | Unwanted | If a ${plan.title.toLowerCase()} is given a blank name, then the system shall refuse it and say that a name is needed. |
`
    },
    {
      path: `packages/domain/src/${name}.ts`,
      content: `/**
 * ${plan.title} (specs/${plan.spec}): the rules, pure and without I/O. Use cases in
 * packages/application reach the world through ports; this file only decides.
 */

/** An example of what the slice works on: replace it with the slice's own. */
export interface ${type} {
  name: string
}

/** Why a ${plan.title.toLowerCase()} cannot be used; none means it can (${id}). */
export function ${rule}(item: ${type}): string[] {
  return item.name.trim() ? [] : ['A name is needed.']
}
`
    },
    {
      path: `packages/domain/test/${name}.test.ts`,
      content: `import { describe, expect, it } from 'vitest'
import { ${rule} } from '../src'

describe('${plan.title} (specs/${plan.spec})', () => {
  it('[${id}] Given a blank name, When it is checked, Then it is refused as missing a name', () => {
    expect(${rule}({ name: '  ' })).toEqual(['A name is needed.'])
    expect(${rule}({ name: 'M 31' })).toEqual([])
  })
})
`
    }
  ]
}

/** The domain index with the slice's file exported, or as it was when it already is. */
export function withExport(index: string, plan: SlicePlan): string {
  const line = `export * from './${sliceName(plan)}'`
  return index.split(/\r?\n/).includes(line) ? index : `${index.replace(/\s*$/, '')}\n${line}\n`
}

/** What to do once the files are written. */
export function nextSteps(plan: SlicePlan): string[] {
  return [
    `Write the request and the requirements in specs/${plan.spec}/requirements.md (EARS: Ubiquitous, Event, State, Unwanted, Optional, Complex).`,
    `Replace the example rule in packages/domain/src/${sliceName(plan)}.ts and its test; cite each ID as [${plan.prefix}-001] in a test title.`,
    'Add use cases and ports in packages/application, adapters in src/main/adapters with a contract suite in packages/testkit.',
    'Add a row to docs/roadmap.md, a line to CHANGELOG.md and the guide the change touches, in the same pull request.',
    'Run npm run verify before pushing.'
  ]
}
