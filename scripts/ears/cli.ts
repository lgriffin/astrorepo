import fs from 'fs'
import path from 'path'
import { formatReport, parseCitations, parseRequirements, passes, trace } from './trace'

const root = process.cwd()
const TEST_FILE = /\.(test|contract)\.tsx?$/

function walk(dir: string, keep: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'node_modules') return []
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full, keep) : keep(full) ? [full] : []
  })
}

const rel = (f: string) => path.relative(root, f).split(path.sep).join('/')

const specFiles = fs.readdirSync(path.join(root, 'specs'), { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => path.join(root, 'specs', e.name, 'requirements.md'))
  .filter(f => fs.existsSync(f))

const requirements = specFiles.flatMap(f => parseRequirements(fs.readFileSync(f, 'utf8'), rel(f)))
const citations = ['tests', 'packages']
  .flatMap(d => walk(path.join(root, d), f => TEST_FILE.test(f)))
  .flatMap(f => parseCitations(fs.readFileSync(f, 'utf8'), rel(f)))

const report = trace(requirements, citations)
console.log(formatReport(report))
process.exit(passes(report) ? 0 : 1)
