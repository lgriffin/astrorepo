import fs from 'fs'
import path from 'path'
import {
  formatMarkdown, formatReport, parseCitations, parseFeatureCitations, parseRequirements, passes, toJson, trace
} from './trace'

// Usage: npm run ears [-- --json <path>]
// Writes a markdown summary to $GITHUB_STEP_SUMMARY when that variable is set.

const root = process.cwd()
const TEST_FILE = /\.(test|contract)\.tsx?$/
const FEATURE_FILE = /\.feature$/

function walk(dir: string, keep: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'node_modules') return []
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full, keep) : keep(full) ? [full] : []
  })
}

const rel = (f: string) => path.relative(root, f).split(path.sep).join('/')

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  if (i < 0) return undefined
  const value = process.argv[i + 1]
  if (!value || value.startsWith('--')) {
    console.error(`${flag} needs a file path`)
    process.exit(2)
  }
  return value
}

const specDirs = fs.readdirSync(path.join(root, 'specs'), { withFileTypes: true }).filter(e => e.isDirectory())
const specFolders = specDirs.map(e => ({
  name: e.name,
  hasRequirements: fs.existsSync(path.join(root, 'specs', e.name, 'requirements.md'))
}))
const specFiles = specFolders.filter(f => f.hasRequirements).map(f => path.join(root, 'specs', f.name, 'requirements.md'))

const requirements = specFiles.flatMap(f => parseRequirements(fs.readFileSync(f, 'utf8'), rel(f)))
const citations = [
  ...['tests', 'packages', 'features']
    .flatMap(d => walk(path.join(root, d), f => TEST_FILE.test(f)))
    .flatMap(f => parseCitations(fs.readFileSync(f, 'utf8'), rel(f))),
  ...walk(path.join(root, 'features'), f => FEATURE_FILE.test(f))
    .flatMap(f => parseFeatureCitations(fs.readFileSync(f, 'utf8'), rel(f)))
]

const report = trace(requirements, citations, specFolders)
console.log(formatReport(report))

const jsonPath = argValue('--json')
if (jsonPath) {
  fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true })
  fs.writeFileSync(jsonPath, JSON.stringify(toJson(report), null, 2) + '\n')
  console.log(`Wrote ${jsonPath}`)
}

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) fs.appendFileSync(summary, formatMarkdown(report))

process.exit(passes(report) ? 0 : 1)
