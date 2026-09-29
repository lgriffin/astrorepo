/**
 * EARS traceability: every requirement in specs/<feature>/requirements.md must be cited by at
 * least one test, every cited ID must exist, and every requirement must read as its declared
 * EARS pattern. Pure functions here; cli.ts does the file I/O.
 */

export type EarsPattern = 'Ubiquitous' | 'Event' | 'State' | 'Unwanted' | 'Optional' | 'Complex'

export interface Requirement {
  id: string
  pattern: EarsPattern
  text: string
  source: string
}

export interface Citation {
  id: string
  file: string
}

export interface TraceReport {
  requirements: Requirement[]
  coverage: Map<string, string[]>
  uncited: Requirement[]
  unknown: Citation[]
  duplicates: string[]
  patternErrors: { requirement: Requirement; reason: string }[]
}

const ID = '[A-Z]{2,4}-\\d{3}'
const ROW = new RegExp(`^\\|\\s*(${ID})\\s*\\|\\s*([A-Za-z]+)\\s*\\|\\s*(.+?)\\s*\\|\\s*$`)
const CITATION = new RegExp(`\\[(${ID}(?:\\s*,\\s*${ID})*)\\]`, 'g')
const PATTERNS: EarsPattern[] = ['Ubiquitous', 'Event', 'State', 'Unwanted', 'Optional', 'Complex']

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

/** Finds every [ABC-123] or [ABC-123, DEF-456] citation in a test file. */
export function parseCitations(code: string, file: string): Citation[] {
  const out: Citation[] = []
  for (const m of code.matchAll(CITATION)) {
    for (const id of m[1].split(',')) out.push({ id: id.trim(), file })
  }
  return out
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

export function trace(requirements: Requirement[], citations: Citation[]): TraceReport {
  const coverage = new Map<string, string[]>()
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const r of requirements) {
    if (seen.has(r.id)) duplicates.push(r.id)
    seen.add(r.id)
    coverage.set(r.id, [])
  }
  const unknown: Citation[] = []
  for (const c of citations) {
    const files = coverage.get(c.id)
    if (!files) unknown.push(c)
    else if (!files.includes(c.file)) files.push(c.file)
  }
  return {
    requirements,
    coverage,
    uncited: requirements.filter(r => coverage.get(r.id)!.length === 0),
    unknown,
    duplicates,
    patternErrors: requirements
      .map(requirement => ({ requirement, reason: checkPattern(requirement) }))
      .filter((e): e is { requirement: Requirement; reason: string } => e.reason !== null)
  }
}

export function passes(report: TraceReport): boolean {
  return report.uncited.length === 0 && report.unknown.length === 0 &&
    report.duplicates.length === 0 && report.patternErrors.length === 0
}

export function formatReport(report: TraceReport): string {
  const lines: string[] = []
  const cited = report.requirements.length - report.uncited.length
  lines.push(`EARS traceability: ${cited}/${report.requirements.length} requirements cited by tests`)
  for (const r of report.uncited) lines.push(`  UNCITED   ${r.id} (${r.source}) has no test naming [${r.id}]`)
  for (const c of report.unknown) lines.push(`  UNKNOWN   ${c.file} cites ${c.id}, which no requirements.md defines`)
  for (const id of report.duplicates) lines.push(`  DUPLICATE ${id} is defined more than once`)
  for (const e of report.patternErrors) lines.push(`  PATTERN   ${e.requirement.id}: ${e.reason}`)
  lines.push(passes(report) ? 'OK' : 'FAILED')
  return lines.join('\n')
}
