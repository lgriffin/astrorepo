import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')
const PORTS = path.join(root, 'packages/application/src/ports')
const CONTRACTS = path.join(root, 'packages/testkit/src/contracts')
const RUNS = path.join(root, 'tests/contracts')

/**
 * Exported interfaces of the ports folder that are not ports: values a port takes or gives, and
 * nothing an adapter implements. Each needs a reason; anything else exported there is a port and
 * needs a contract suite.
 */
const NOT_PORTS: Record<string, string> = {
  ArchiveRecord: 'what ArchiveStore saves',
  GalleryImage: 'what GalleryCatalogue lists',
  RunningProcess: 'the handle ProcessRunner.run returns; covered by the ProcessRunner suite',
  FrameDetail: 'what SirilWorkspace.frameDetails returns',
  WorkAreaSpace: 'what SirilWorkspace.workAreaSpace returns',
  SolveRun: 'what SolveIO.run returns',
  SolveIO: 'lent to a PlateSolver by the job runner, not implemented by an adapter; the PlateSolver suite drives it',
  StoredSolve: 'what SolveStore saves',
  MosaicTarget: 'what MosaicStore.target returns',
  SavedMosaic: 'what MosaicStore saves',
  TargetPosition: 'what TargetPositions lists',
  StackFile: 'what StackCatalogue lists',
  ProbeResult: 'what ToolProbe.run returns',
  PictureFile: 'what PictureFolder lists',
  Picture: 'what PictureFolder.read returns',
  ObjectFacts: 'what ObjectCatalogue.objectFacts returns'
}

const read = (dir: string, suffix: string) =>
  fs
    .readdirSync(dir)
    .filter(f => f.endsWith(suffix))
    .sort()
    .map(f => ({ file: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }))

/** Every interface the ports folder exports, with the file it is in. */
function exportedInterfaces(): { name: string; file: string }[] {
  return read(PORTS, '.ts').flatMap(({ file, text }) => [...text.matchAll(/^export interface (\w+)/gm)].map(m => ({ name: m[1], file })))
}

/**
 * Each exported contract function and the ports its suites are named for: a suite is
 * `describe(\`<Port> contract: ${adapterName}\`)`, and one suite may name several ports joined by "and".
 */
function contractSuites(): { fn: string; ports: string[] }[] {
  return read(CONTRACTS, '.contract.ts').flatMap(({ text }) =>
    text
      .split(/^(?=export function )/m)
      .map(chunk => ({ fn: /^export function (\w+)/.exec(chunk)?.[1], titles: [...chunk.matchAll(/describe\(`([^`$]+?) contract:/g)].map(m => m[1]) }))
      .filter((c): c is { fn: string; titles: string[] } => Boolean(c.fn))
      .map(c => ({ fn: c.fn, ports: c.titles.flatMap(t => t.split(/\s*(?:,|\band\b)\s*/).filter(Boolean)) }))
  )
}

/** Names a file imports, by where they come from: the contract suites, the testkit's fakes or the app's real adapters. */
function importedNames(sf: ts.SourceFile) {
  const from = { contracts: new Set<string>(), fakes: new Set<string>(), real: new Set<string>() }
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.importClause?.isTypeOnly) continue
    const spec = st.moduleSpecifier.text
    const into = /\/contracts\//.test(spec) ? from.contracts : /testkit/.test(spec) ? from.fakes : /(^|\/)src\/main\/|^@main\//.test(spec) ? from.real : null
    const clause = st.importClause
    if (clause?.name) into?.add(clause.name.text)
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const el of clause.namedBindings.elements) if (!el.isTypeOnly) into?.add(el.name.text)
  }
  return from
}

/**
 * Each run of a contract suite in tests/contracts, with whether its harness builds a testkit fake,
 * a real adapter or both. Helpers the harness calls, declared in the same file, count as its own code.
 */
function contractRuns(files = read(RUNS, '.test.ts')): { fn: string; fake: boolean; real: boolean }[] {
  return files.flatMap(({ file, text }) => {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true)
    const names = importedNames(sf)
    const declared = new Map<string, ts.Node>()
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name) declared.set(st.name.text, st)
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) declared.set(d.name.text, d)
    }
    const uses = (node: ts.Node, seen: Set<ts.Node>, out: Set<string>): Set<string> => {
      if (ts.isIdentifier(node)) {
        out.add(node.text)
        const decl = declared.get(node.text)
        if (decl && !seen.has(decl)) uses(decl, seen.add(decl), out)
      }
      ts.forEachChild(node, child => void uses(child, seen, out))
      return out
    }
    const found: { fn: string; fake: boolean; real: boolean }[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.contracts.has(node.expression.text)) {
        const ids = [...node.arguments.reduce((out, arg) => uses(arg, new Set(), out), new Set<string>())]
        found.push({ fn: node.expression.text, fake: ids.some(i => names.fakes.has(i)), real: ids.some(i => names.real.has(i)) })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    return found
  })
}

describe('Port contract coverage', () => {
  const interfaces = exportedInterfaces()
  const suites = contractSuites()
  const ports = interfaces.filter(i => !(i.name in NOT_PORTS))

  it('[NFR-006] Given the ports the use cases need, When their contract suites are listed, Then every port has a suite named for it', () => {
    const named = new Set(suites.flatMap(s => s.ports))
    expect(ports.length).toBeGreaterThan(30)
    expect(ports.filter(p => !named.has(p.name)).map(p => `${p.name} (ports/${p.file})`)).toEqual([])
  })

  it('[NFR-006] Given each port contract suite, When the contract tests run, Then it runs against a testkit fake and against a real adapter from the app', () => {
    const portNames = new Set(ports.map(p => p.name))
    const runs = contractRuns()
    const missing = suites
      .filter(s => s.ports.some(p => portNames.has(p)))
      .flatMap(s => {
        const mine = runs.filter(r => r.fn === s.fn)
        return [
          ...(mine.some(r => r.fake) ? [] : [`${s.fn} never runs on a testkit fake`]),
          ...(mine.some(r => r.real) ? [] : [`${s.fn} never runs on a real adapter`])
        ]
      })
    expect(missing).toEqual([])
  })

  it('[NFR-006] Given the list of interfaces that are not ports, When checked, Then each is still exported by the ports and none has a suite of its own', () => {
    const exported = new Set(interfaces.map(i => i.name))
    const named = new Set(suites.flatMap(s => s.ports))
    expect(Object.keys(NOT_PORTS).filter(n => !exported.has(n) || named.has(n))).toEqual([])
  })

  it('[NFR-006] Given a suite whose two runs both use testkit fakes, When the gate reads them, Then it reports no real-adapter run', () => {
    const text = [
      "import { InMemoryRunArea } from '@astro/testkit'",
      "import { runAreaContract } from '@astro/testkit/contracts/run-area.contract'",
      "import { NodeRunArea } from '../../src/main/adapters/node-run-area'",
      "const harness = () => ({ area: new InMemoryRunArea() })",
      "runAreaContract('in-memory', async () => ({ area: new InMemoryRunArea() }))",
      "runAreaContract('again', async () => harness())"
    ].join('\n')
    expect(contractRuns([{ file: 'probe.test.ts', text }])).toEqual([
      { fn: 'runAreaContract', fake: true, real: false },
      { fn: 'runAreaContract', fake: true, real: false }
    ])
    const fixed = text.replace("async () => harness()", "async () => ({ area: new NodeRunArea() })")
    expect(contractRuns([{ file: 'probe.test.ts', text: fixed }])[1]).toEqual({ fn: 'runAreaContract', fake: false, real: true })
  })
})
