import fs from 'fs'
import path from 'path'
import { nextSteps, parseSliceArgs, prefixesIn, sliceFiles, sliceProblems, withExport, type SlicePlan } from './rules'

// Usage: npm run new:slice -- --name dark-sites --prefix DSK --title "Dark sites"
// Writes a spec with an EARS requirement, a domain rule and a test citing it (specs/045, D5).

const root = path.resolve(__dirname, '../..')
const specsDir = path.join(root, 'specs')
const specFolders = fs.readdirSync(specsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
const prefixes = specFolders.flatMap(f => {
  const file = path.join(specsDir, f, 'requirements.md')
  return fs.existsSync(file) ? prefixesIn(fs.readFileSync(file, 'utf8')) : []
})
const plan = parseSliceArgs(process.argv.slice(2), specFolders)
// The files are worked out only for a plan that is otherwise sound, so a malformed name is refused, not thrown on.
const sound = sliceProblems(plan, { specFolders, prefixes, files: [] }).length === 0
const planned = sound ? sliceFiles(plan as SlicePlan).map(f => f.path) : []
const problems = sliceProblems(plan, { specFolders, prefixes, files: planned.filter(p => fs.existsSync(path.join(root, p))) })
if (problems.length) {
  console.error(problems.join('\n'))
  console.error('\nUsage: npm run new:slice -- --name dark-sites --prefix DSK --title "Dark sites"')
  process.exit(1)
}
const ready = plan as SlicePlan
for (const f of sliceFiles(ready)) {
  fs.mkdirSync(path.dirname(path.join(root, f.path)), { recursive: true })
  fs.writeFileSync(path.join(root, f.path), f.content, { flag: 'wx' })
  console.log(`  wrote ${f.path}`)
}
const index = path.join(root, 'packages/domain/src/index.ts')
fs.writeFileSync(index, withExport(fs.readFileSync(index, 'utf8'), ready))
console.log('  exported it from packages/domain/src/index.ts')
console.log(`\nNext:\n${nextSteps(ready).map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`)
