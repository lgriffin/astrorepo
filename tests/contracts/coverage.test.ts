import fs from 'fs'
import path from 'path'
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
  ProbeResult: 'what ToolProbe.run returns'
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

/** How often each contract function is run from tests/contracts, outside imports and comments. */
function runs(fn: string): number {
  const call = new RegExp(`(^|[^\\w.])${fn}\\(`, 'g')
  const code = (text: string) =>
    text
      .split('\n')
      .filter(l => !/^\s*(import\b|\/\/|\/?\*)/.test(l))
      .join('\n')
  return read(RUNS, '.test.ts').reduce((n, { text }) => n + (code(text).match(call)?.length ?? 0), 0)
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

  it('[NFR-006] Given each port contract suite, When the contract tests run, Then it runs against at least two adapters: the testkit fake and a real adapter', () => {
    const portNames = new Set(ports.map(p => p.name))
    const once = suites.filter(s => s.ports.some(p => portNames.has(p))).filter(s => runs(s.fn) < 2).map(s => `${s.fn} runs ${runs(s.fn)} time(s)`)
    expect(once).toEqual([])
  })

  it('[NFR-006] Given the list of interfaces that are not ports, When checked, Then each is still exported by the ports and none has a suite of its own', () => {
    const exported = new Set(interfaces.map(i => i.name))
    const named = new Set(suites.flatMap(s => s.ports))
    expect(Object.keys(NOT_PORTS).filter(n => !exported.has(n) || named.has(n))).toEqual([])
  })
})
