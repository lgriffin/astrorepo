import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import coreGlobals from './core-globals.json'

/**
 * Reads the project's source the way the compiler does, so the architecture tests see every
 * import (static, side-effect, re-export, dynamic and require, written relative or through a path
 * alias) and every use of an ambient global, resolved by scope.
 */

export const root = path.resolve(__dirname, '../..')

export function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(full)
    return /\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [full] : []
  })
}

export const rel = (file: string) => path.relative(root, file).split(path.sep).join('/')

/** A specifier the code builds at run time, so no rule can tell where it leads. */
export const COMPUTED = '<computed>'

export interface ImportRef {
  /** The module specifier as written, or COMPUTED. */
  spec: string
  /** Named bindings it brings in (empty for default, namespace or side-effect imports). */
  names: string[]
  /** Local names bound to the module's exports: named, default and namespace bindings. */
  locals: string[]
  /** A namespace (`* as x`), default or whole-module binding, through which any export can be reached. */
  whole: boolean
  /** True when every binding is type-only, so nothing is loaded at run time. */
  typeOnly: boolean
}

function parse(file: string, code = fs.readFileSync(file, 'utf8')): ts.SourceFile {
  return ts.createSourceFile(file, code, ts.ScriptTarget.ES2022, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

/** Every module a file refers to: import and export declarations, import(), require() and import types. */
export function importsOf(file: string, code?: string): ImportRef[] {
  const out: ImportRef[] = []
  const sf = parse(file, code)
  // A file that declares its own `require` (a helper, say) is not calling Node's.
  const ownRequire = /\b(?:const|let|var|function)\s+require\b/.test(sf.text)
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const names: string[] = []
      const locals: string[] = []
      let whole = false
      let typeOnly: boolean
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause
        typeOnly = !!clause?.isTypeOnly
        if (clause?.name) {
          locals.push(clause.name.text)
          whole = true
        }
        const bindings = clause?.namedBindings
        if (bindings && ts.isNamespaceImport(bindings)) {
          locals.push(bindings.name.text)
          whole = true
        }
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            names.push((el.propertyName ?? el.name).text)
            locals.push(el.name.text)
          }
          if (!typeOnly && !clause?.name && bindings.elements.length > 0) typeOnly = bindings.elements.every(el => el.isTypeOnly)
        }
      } else {
        typeOnly = node.isTypeOnly
        whole = !node.exportClause || ts.isNamespaceExport(node.exportClause)
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) names.push((el.propertyName ?? el.name).text)
        }
      }
      out.push({ spec: node.moduleSpecifier.text, names, locals, whole, typeOnly })
    } else if (ts.isCallExpression(node)) {
      const [arg] = node.arguments
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = !ownRequire && ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if ((isDynamic || isRequire) && arg) {
        out.push({ spec: ts.isStringLiteralLike(arg) ? arg.text : COMPUTED, names: [], locals: [], whole: true, typeOnly: false })
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      out.push({ spec: node.argument.literal.text, names: [], locals: [], whole: true, typeOnly: true })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** Path aliases from tsconfig.json, vitest.config.ts and electron.vite.config.ts. */
const ALIASES: [RegExp, string][] = [
  [/^@main(\/|$)/, 'src/main$1'],
  [/^@shared(\/|$)/, 'src/shared$1'],
  [/^@renderer(\/|$)/, 'src/renderer$1'],
  [/^@astro\/(domain|application|testkit)(\/|$)/, 'packages/$1/src$2']
]

/**
 * Where a specifier leads, relative to the repo root, for relative and aliased specifiers; null for
 * packages and Node built-ins. A computed specifier leads to COMPUTED.
 */
export function target(file: string, spec: string): string | null {
  if (spec === COMPUTED) return COMPUTED
  if (spec.startsWith('.')) return rel(path.resolve(path.dirname(file), spec))
  for (const [pattern, to] of ALIASES) if (pattern.test(spec)) return spec.replace(pattern, to).replace(/\/$/, '')
  return null
}

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs', 'fs/promises', 'http', 'https', 'net',
  'os', 'path', 'perf_hooks', 'process', 'readline', 'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm',
  'worker_threads', 'zlib'
])

export function isNodeBuiltin(spec: string): boolean {
  return spec.startsWith('node:') || NODE_BUILTINS.has(spec)
}

/** Ambient, non-deterministic or I/O globals the core must take through a port instead (the list ESLint uses too). */
export const BANNED_GLOBALS = new Set<string>(coreGlobals)

const NODE_TYPES = path.join(root, 'node_modules', '@types', 'node', 'index.d.ts')

/** A program over the files (and any in-memory ones), with Node and DOM typings, so names resolve by scope. */
function program(files: string[], virtual: Record<string, string>) {
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], noResolve: true, types: [], skipLibCheck: true, noEmit: true }
  const host = ts.createCompilerHost(options, true)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (name, lang, onError, fresh) =>
    name in virtual ? ts.createSourceFile(name, virtual[name], lang, true) : getSourceFile(name, lang, onError, fresh)
  const fileExists = host.fileExists.bind(host)
  host.fileExists = name => name in virtual || fileExists(name)
  return ts.createProgram([...files, ...Object.keys(virtual), NODE_TYPES], options, host)
}

const compilerPath = (file: string) => file.split(path.sep).join('/')

/** True when the name is declared only in a library's typings (the host), not by the project's own code. */
function isHostSymbol(symbol: ts.Symbol | undefined): boolean {
  const decls = symbol?.declarations ?? []
  return decls.length === 0 || decls.every(d => /node_modules[\\/](typescript[\\/]lib|@types)[\\/]/.test(d.getSourceFile().fileName))
}

/** The identifier names what is being declared or a property key, rather than referring to a binding. */
function isDeclarationName(node: ts.Identifier): boolean {
  const p = node.parent as ts.Node & { name?: ts.Node; propertyName?: ts.Node }
  if (ts.isShorthandPropertyAssignment(p) || ts.isPropertyAccessExpression(p)) return false
  return p.name === node || p.propertyName === node
}

/**
 * Uses of the clock, randomness and host globals, as `file:line what`. Names are resolved by scope,
 * so a local or parameter that shadows a global is not a use of it. `virtual` maps a file name to
 * its source, for checking code that is not on disk.
 */
export function ambientUses(diskFiles: string[], virtualFiles: Record<string, string> = {}): string[] {
  // The compiler names files with forward slashes on every OS, so Windows paths are converted first.
  const files = diskFiles.map(compilerPath)
  const virtual = Object.fromEntries(Object.entries(virtualFiles).map(([name, code]) => [compilerPath(name), code]))
  const prog = program(files, virtual)
  const checker = prog.getTypeChecker()
  const out: string[] = []
  for (const name of [...files, ...Object.keys(virtual)]) {
    const sf = prog.getSourceFile(name)
    // A file the program did not load would pass silently, so it is an error instead.
    if (!sf) throw new Error(`The architecture check could not load ${name}`)
    const at = (node: ts.Node, what: string) =>
      out.push(`${name in virtual ? path.posix.basename(name) : rel(name)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${what}`)
    const isGlobal = (id: ts.Identifier) => isHostSymbol(checker.getSymbolAtLocation(id))
    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date' && (node.arguments?.length ?? 0) === 0 && isGlobal(node.expression)) {
        at(node, 'new Date() reads the clock')
      } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && isGlobal(node.expression)) {
        const call = `${node.expression.text}.${node.name.text}`
        if (call === 'Date.now') at(node, 'Date.now reads the clock')
        if (call === 'Math.random') at(node, 'Math.random is not deterministic')
      }
      if (ts.isIdentifier(node) && BANNED_GLOBALS.has(node.text)) {
        const parent = node.parent
        const isMemberName = (ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isQualifiedName(parent) && parent.right === node)
        if (!isMemberName && !isDeclarationName(node) && isGlobal(node)) at(node, `${node.text} is a host global`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}

/**
 * Calls made through bindings a file imports from modules `matches` accepts: `fn()` for a named
 * import and `ns.fn()` for a namespace or default one. Counts call sites, not imports.
 */
export function callsThroughImports(file: string, matches: (target: string) => boolean, code?: string): number {
  const refs = importsOf(file, code).filter(i => !i.typeOnly && matches(target(file, i.spec) ?? i.spec))
  const named = new Set(refs.flatMap(i => (i.whole ? [] : i.locals)))
  const wholes = new Set(refs.flatMap(i => (i.whole ? i.locals : [])))
  let calls = 0
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (ts.isIdentifier(callee) && named.has(callee.text)) calls += 1
      else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && wholes.has(callee.expression.text)) calls += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(parse(file, code))
  return calls
}

/** Calls of a function by its plain name (`getSqlite()`), ignoring comments and strings. */
export function callsTo(file: string, fn: string, code?: string): number {
  let calls = 0
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === fn) calls += 1
    ts.forEachChild(node, visit)
  }
  visit(parse(file, code))
  return calls
}
