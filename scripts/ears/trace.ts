/**
 * EARS traceability: every requirement in specs/<feature>/requirements.md must be cited by at
 * least one test, every cited ID must exist, and every requirement must read as its declared
 * EARS pattern. A citation counts only where a person reads it as the name of a test: the title
 * of an it/test/describe call, or a tag on a Gherkin feature or scenario. Pure functions here;
 * cli.ts does the file I/O.
 */

import { compileFeature, type CompiledGroup, type CompiledScenario } from '../../packages/testkit/src/bdd/feature'

export type EarsPattern = 'Ubiquitous' | 'Event' | 'State' | 'Unwanted' | 'Optional' | 'Complex'

export interface Requirement {
  id: string
  pattern: EarsPattern
  text: string
  source: string
}

/** test: an it/test/describe title. scenario, feature: a tag on that Gherkin element. */
export type CitationKind = 'test' | 'scenario' | 'feature'

export interface Citation {
  id: string
  file: string
  title: string
  kind: CitationKind
}

export interface SpecFolder {
  name: string
  hasRequirements: boolean
}

export interface TraceReport {
  requirements: Requirement[]
  /** Requirement ID to the files that cite it. */
  coverage: Map<string, string[]>
  /** Requirement ID to every citation of it (one per test title or Gherkin tag). */
  citations: Map<string, Citation[]>
  uncited: Requirement[]
  unknown: Citation[]
  duplicates: string[]
  patternErrors: { requirement: Requirement; reason: string }[]
  /** Unwanted requirements whose citing tests none name a failure, and none is a Gherkin scenario. */
  unwantedUntested: Requirement[]
  /** Spec folders numbered 009 or later that have no requirements.md. */
  missingRequirementFiles: string[]
  /** Feature files no test file runs, so none of their scenarios ever runs. */
  unrunFeatures: string[]
}

const ID = '[A-Z]{2,4}-\\d{3}'
const ROW = new RegExp(`^\\|\\s*(${ID})\\s*\\|\\s*([A-Za-z]+)\\s*\\|\\s*(.+?)\\s*\\|\\s*$`)
const CITATION = new RegExp(`\\[(${ID}(?:\\s*,\\s*${ID})*)\\]`, 'g')
const TAG_ID = new RegExp(`^@(${ID})$`)
const PATTERNS: EarsPattern[] = ['Ubiquitous', 'Event', 'State', 'Unwanted', 'Optional', 'Complex']

/** Words that show a test title is about the failure an Unwanted requirement handles. */
export const FAILURE_WORDS =
  /\b(?:fail|refus|reject|error|invalid|missing|cannot|not\b|warn|quarantin|skip|stop|cancel|unknown|empty|corrupt|throw)/i

/** Reads the requirement rows of a markdown table: | ID | Pattern | Requirement | */
export function parseRequirements(markdown: string, source: string): Requirement[] {
  const out: Requirement[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const m = ROW.exec(line.trim())
    if (!m) continue
    out.push({ id: m[1], pattern: m[2] as EarsPattern, text: m[3], source })
  }
  return out
}

interface StringLiteral {
  end: number
  value: string
}

const REGEX_AFTER = new Set('(,=:[!&|?{};+-*%<>~^')
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'new', 'yield', 'await'])

/**
 * A small TypeScript lexer: blanks comments, string, template and regex contents out of the code
 * (so calls inside them are not seen) and remembers each string literal by its opening quote.
 */
function lex(code: string): { masked: string; strings: Map<number, StringLiteral> } {
  const n = code.length
  const out = code.split('')
  const strings = new Map<number, StringLiteral>()
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' '
  }

  const regexAllowed = (i: number): boolean => {
    let p = i - 1
    while (p >= 0 && /\s/.test(out[p])) p--
    if (p < 0) return true
    if (REGEX_AFTER.has(out[p])) return true
    if (!/[\w$]/.test(out[p])) return false
    let s = p
    while (s > 0 && /[\w$]/.test(out[s - 1])) s--
    return REGEX_AFTER_WORD.has(out.slice(s, p + 1).join(''))
  }

  const scanTemplate = (i: number): number => {
    let j = i + 1
    while (j < n) {
      if (code[j] === '\\') { j += 2; continue }
      if (code[j] === '`') return j + 1
      if (code[j] === '$' && code[j + 1] === '{') { j = scanCode(j + 2, true); continue }
      j++
    }
    return n
  }

  function scanCode(start: number, untilBrace: boolean): number {
    let i = start
    let depth = 0
    while (i < n) {
      const c = code[i]
      const next = code[i + 1]
      if (c === '/' && next === '/') {
        const e = code.indexOf('\n', i)
        const end = e < 0 ? n : e
        blank(i, end)
        i = end
      } else if (c === '/' && next === '*') {
        const e = code.indexOf('*/', i + 2)
        const end = e < 0 ? n : e + 2
        blank(i, end)
        i = end
      } else if (c === '\'' || c === '"') {
        let j = i + 1
        while (j < n && code[j] !== c && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1
        strings.set(i, { end: j + 1, value: code.slice(i + 1, j) })
        blank(i + 1, j)
        i = j + 1
      } else if (c === '`') {
        const end = scanTemplate(i)
        strings.set(i, { end, value: code.slice(i + 1, end - 1) })
        blank(i + 1, end - 1)
        i = end
      } else if (c === '/' && regexAllowed(i)) {
        let j = i + 1
        let inClass = false
        while (j < n && code[j] !== '\n') {
          if (code[j] === '\\') { j += 2; continue }
          if (code[j] === '[') inClass = true
          else if (code[j] === ']') inClass = false
          else if (code[j] === '/' && !inClass) break
          j++
        }
        blank(i + 1, j)
        i = j + 1
      } else {
        if (untilBrace && c === '{') depth++
        else if (untilBrace && c === '}') {
          if (depth === 0) return i + 1
          depth--
        }
        i++
      }
    }
    return n
  }

  scanCode(0, false)
  return { masked: out.join(''), strings }
}

const TEST_CALL = /(?<![\w$.])(?:it|test|describe)\b/g
/** Chained modifiers that take their own arguments before the title: it.each([...])('title'). */
const TAKES_ARGS = new Set(['each', 'for', 'runIf', 'skipIf'])

/**
 * Returns the title of every it/test/describe call (and chained forms such as it.each, test.skip,
 * describe.skipIf(x)) whose first argument is a string or template literal. Calls in comments or
 * strings are ignored.
 */
export function extractTestTitles(code: string): string[] {
  const { masked, strings } = lex(code)
  const skipWs = (k: number) => {
    while (k < masked.length && /\s/.test(masked[k])) k++
    return k
  }
  const titles: string[] = []
  for (const m of masked.matchAll(TEST_CALL)) {
    let k = m.index! + m[0].length
    let last = m[0]
    for (;;) {
      k = skipWs(k)
      if (masked[k] === '.') {
        const name = /^[\w$]+/.exec(masked.slice(skipWs(k + 1)))
        if (!name) break
        last = name[0]
        k = skipWs(k + 1) + name[0].length
      } else if (masked[k] === '`' && TAKES_ARGS.has(last)) {
        const s = strings.get(k)
        if (!s) break
        k = s.end
        last = ''
      } else if (masked[k] === '(') {
        const s = strings.get(skipWs(k + 1))
        if (s) { titles.push(s.value); break }
        if (!TAKES_ARGS.has(last)) break
        let depth = 0
        do {
          if (masked[k] === '(') depth++
          else if (masked[k] === ')') depth--
          k++
        } while (depth > 0 && k < masked.length)
        last = ''
      } else break
    }
  }
  return titles
}

const idsIn = (title: string): string[] =>
  [...title.matchAll(CITATION)].flatMap(m => m[1].split(',').map(id => id.trim()))

/** Finds every [ABC-123] or [ABC-123, DEF-456] citation in the test titles of a test file. */
export function parseCitations(code: string, file: string): Citation[] {
  return extractTestTitles(code).flatMap(title =>
    idsIn(title).map(id => ({ id, file, title, kind: 'test' as const })))
}


/**
 * One citation per runnable scenario (each Scenario Outline row is one) for every requirement tag
 * that applies to it: its own and its examples' tags as "scenario", and the feature's or rule's
 * tags it inherits as "feature". Read with the same Gherkin compiler the runner uses, so tags in
 * comments, doc strings or step text never count and a feature without scenarios cites nothing.
 */
export function parseFeatureCitations(text: string, file: string): Citation[] {
  const feature = compileFeature(text, file)
  const scenarios = (g: CompiledGroup): CompiledScenario[] => [...g.scenarios, ...g.rules.flatMap(scenarios)]
  return scenarios(feature).flatMap(sc => {
    // The title lists the scenario's own and its examples' requirement tags; the rest are inherited.
    const own = new Set([...sc.title.matchAll(/\[([A-Z]+-\d+)\]/g)].map(m => m[1]))
    const seen = new Set<string>()
    return sc.tags.flatMap(tag => {
      const id = TAG_ID.exec(tag)?.[1]
      if (!id || seen.has(id)) return []
      seen.add(id)
      return [{ id, file, title: sc.name, kind: (own.has(id) ? 'scenario' : 'feature') as CitationKind }]
    })
  })
}

/**
 * The feature files a test file runs, from each `runFeature(new URL('./x.feature', import.meta.url), ...)`
 * in it, as written: relative to the test file's folder.
 */
export function runFeatureTargets(code: string): string[] {
  return [...code.matchAll(/runFeature\(\s*new URL\(\s*(['"`])([^'"`]+\.feature)\1/g)].map(m => m[2])
}

const LEADS = { When: /\bwhen\b/i, While: /\bwhile\b/i, If: /\bif\b/i, Where: /\bwhere\b/i }

/** Returns why the text does not read as its pattern, or null when it does. */
export function checkPattern(r: Requirement): string | null {
  if (!PATTERNS.includes(r.pattern)) return `unknown pattern "${r.pattern}"`
  if (!/\bshall\b/.test(r.text)) return 'has no "shall"'
  const t = r.text
  const leadsWith = (k: keyof typeof LEADS) => t.startsWith(`${k} `)
  const lead = (Object.keys(LEADS) as (keyof typeof LEADS)[]).find(leadsWith)
  switch (r.pattern) {
    case 'Ubiquitous':
      return lead ? `a Ubiquitous requirement must not start with "${lead}"` : null
    case 'Event':
      return leadsWith('When') ? null : 'an Event requirement starts with "When"'
    case 'State':
      return leadsWith('While') ? null : 'a State requirement starts with "While"'
    case 'Unwanted':
      return leadsWith('If') && /, then\b/.test(t) ? null : 'an Unwanted requirement reads "If <trigger>, then <response>"'
    case 'Optional':
      return leadsWith('Where') ? null : 'an Optional requirement starts with "Where"'
    case 'Complex': {
      if (!lead) return 'a Complex requirement starts with While, Where, When or If'
      const clauses = t.slice(0, t.search(/\bshall\b/))
      const others = (Object.keys(LEADS) as (keyof typeof LEADS)[]).filter(k => k !== lead && LEADS[k].test(clauses))
      return others.length > 0 ? null : 'a Complex requirement combines at least two of While, Where, When and If'
    }
  }
}

/** Spec folders numbered 009 or later (when specs gained requirements.md) that lack one. */
export function checkSpecFolders(folders: SpecFolder[]): string[] {
  return folders
    .filter(f => { const n = /^(\d+)-/.exec(f.name); return n !== null && Number(n[1]) >= 9 && !f.hasRequirements })
    .map(f => f.name)
    .sort()
}

/** True when a citation shows the failure path of an Unwanted requirement. */
export function showsFailure(c: Citation): boolean {
  return c.kind === 'scenario' || (c.kind === 'test' && FAILURE_WORDS.test(c.title))
}

export function trace(requirements: Requirement[], citations: Citation[], specFolders: SpecFolder[] = [], unrunFeatures: string[] = []): TraceReport {
  const coverage = new Map<string, string[]>()
  const byId = new Map<string, Citation[]>()
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const r of requirements) {
    if (seen.has(r.id)) duplicates.push(r.id)
    seen.add(r.id)
    coverage.set(r.id, [])
    byId.set(r.id, [])
  }
  const unknown: Citation[] = []
  for (const c of citations) {
    const files = coverage.get(c.id)
    if (!files) { unknown.push(c); continue }
    byId.get(c.id)!.push(c)
    if (!files.includes(c.file)) files.push(c.file)
  }
  return {
    requirements,
    coverage,
    citations: byId,
    uncited: requirements.filter(r => coverage.get(r.id)!.length === 0),
    unknown,
    duplicates,
    patternErrors: requirements
      .map(requirement => ({ requirement, reason: checkPattern(requirement) }))
      .filter((e): e is { requirement: Requirement; reason: string } => e.reason !== null),
    unwantedUntested: requirements.filter(r => {
      const cs = byId.get(r.id)!
      return r.pattern === 'Unwanted' && cs.length > 0 && !cs.some(showsFailure)
    }),
    missingRequirementFiles: checkSpecFolders(specFolders),
    unrunFeatures
  }
}

export function passes(report: TraceReport): boolean {
  return report.uncited.length === 0 && report.unknown.length === 0 &&
    report.duplicates.length === 0 && report.patternErrors.length === 0 &&
    report.unwantedUntested.length === 0 && report.missingRequirementFiles.length === 0 &&
    report.unrunFeatures.length === 0
}

export interface SpecSummary {
  source: string
  cited: number
  total: number
  requirements: { id: string; pattern: EarsPattern; tests: number; files: string[] }[]
}

/** Cited count per spec, and per requirement how many tests (titles or scenario tags) cite it. */
export function summariseBySpec(report: TraceReport): SpecSummary[] {
  const specs = new Map<string, SpecSummary>()
  for (const r of report.requirements) {
    let s = specs.get(r.source)
    if (!s) { s = { source: r.source, cited: 0, total: 0, requirements: [] }; specs.set(r.source, s) }
    const tests = report.citations.get(r.id)?.length ?? 0
    s.total++
    if (tests > 0) s.cited++
    s.requirements.push({ id: r.id, pattern: r.pattern, tests, files: report.coverage.get(r.id) ?? [] })
  }
  return [...specs.values()]
}

/** The machine-readable form written by `npm run ears -- --json <path>`. */
export function toJson(report: TraceReport) {
  return {
    ok: passes(report),
    requirements: report.requirements.length,
    cited: report.requirements.length - report.uncited.length,
    failures: {
      uncited: report.uncited.map(r => ({ id: r.id, source: r.source })),
      unknown: report.unknown.map(c => ({ id: c.id, file: c.file, title: c.title })),
      duplicates: report.duplicates,
      patternErrors: report.patternErrors.map(e => ({ id: e.requirement.id, reason: e.reason })),
      unwantedUntested: report.unwantedUntested.map(r => ({ id: r.id, source: r.source })),
      missingRequirementFiles: report.missingRequirementFiles,
      unrunFeatures: report.unrunFeatures
    },
    specs: summariseBySpec(report)
  }
}

function failureLines(report: TraceReport): string[] {
  const lines: string[] = []
  for (const r of report.uncited) lines.push(`UNCITED   ${r.id} (${r.source}) has no test naming [${r.id}]`)
  for (const c of report.unknown) lines.push(`UNKNOWN   ${c.file} cites ${c.id}, which no requirements.md defines`)
  for (const id of report.duplicates) lines.push(`DUPLICATE ${id} is defined more than once`)
  for (const e of report.patternErrors) lines.push(`PATTERN   ${e.requirement.id}: ${e.reason}`)
  for (const r of report.unwantedUntested) {
    lines.push(`UNWANTED  ${r.id} (${r.source}) is an "If ..., then ..." requirement but no citing test title names the failure and no Gherkin scenario cites it`)
  }
  for (const f of report.missingRequirementFiles) lines.push(`NOSPEC    specs/${f}/ has no requirements.md`)
  for (const f of report.unrunFeatures) lines.push(`UNRUN     ${f} is run by no test file (runFeature), so its tags cite nothing`)
  return lines
}

export function formatReport(report: TraceReport): string {
  const lines: string[] = []
  const cited = report.requirements.length - report.uncited.length
  lines.push(`EARS traceability: ${cited}/${report.requirements.length} requirements cited by tests`)
  for (const s of summariseBySpec(report)) {
    const thin = s.requirements.filter(r => r.tests === 1).length
    lines.push(`  ${s.source}: ${s.cited}/${s.total} cited${thin ? `, ${thin} by a single test` : ''}`)
  }
  for (const l of failureLines(report)) lines.push(`  ${l}`)
  lines.push(passes(report) ? 'OK' : 'FAILED')
  return lines.join('\n')
}

/** A markdown summary for $GITHUB_STEP_SUMMARY. */
export function formatMarkdown(report: TraceReport): string {
  const cited = report.requirements.length - report.uncited.length
  const lines = [
    `## EARS traceability ${passes(report) ? 'passed' : 'FAILED'}`,
    '',
    `${cited}/${report.requirements.length} requirements cited by tests.`,
    '',
    '| Spec | Cited | Tests per requirement (min / max) |',
    '|---|---|---|'
  ]
  for (const s of summariseBySpec(report)) {
    const counts = s.requirements.map(r => r.tests)
    lines.push(`| ${s.source} | ${s.cited}/${s.total} | ${Math.min(...counts)} / ${Math.max(...counts)} |`)
  }
  const failures = failureLines(report)
  if (failures.length > 0) {
    lines.push('', '### Failures', '', ...failures.map(l => `- \`${l.replace(/\s+/, ' ')}\``))
  }
  return lines.join('\n') + '\n'
}
