import fs from 'fs'
import path from 'path'
import ts from 'typescript'

/**
 * Reads the project's source the way the compiler does, so the architecture tests see every
 * import (static, side-effect, re-export, dynamic and require) and every use of an ambient global.
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

export interface ImportRef {
  /** The module specifier as written. */
  spec: string
  /** Named bindings it brings in (empty for default, namespace or side-effect imports). */
  names: string[]
  /** True when every binding is type-only, so nothing is loaded at run time. */
  typeOnly: boolean
}

function parse(file: string, code = fs.readFileSync(file, 'utf8')): ts.SourceFile {
  return ts.createSourceFile(file, code, ts.ScriptTarget.ES2022, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

/** Every module a file refers to: import and export declarations, import(), require() and import types. */
export function importsOf(file: string, code?: string): ImportRef[] {
  const out: ImportRef[] = []
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const names: string[] = []
      let typeOnly: boolean
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause
        typeOnly = !!clause?.isTypeOnly
        const bindings = clause?.namedBindings
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) names.push((el.propertyName ?? el.name).text)
          if (!typeOnly && !clause?.name && bindings.elements.length > 0) typeOnly = bindings.elements.every(el => el.isTypeOnly)
        }
      } else {
        typeOnly = node.isTypeOnly
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) names.push((el.propertyName ?? el.name).text)
        }
      }
      out.push({ spec: node.moduleSpecifier.text, names, typeOnly })
    } else if (ts.isCallExpression(node)) {
      const [arg] = node.arguments
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if ((isDynamic || (isRequire && ts.isStringLiteralLike(arg ?? node))) && arg) {
        const spec = ts.isStringLiteralLike(arg) ? arg.text : `<computed ${arg.getText()}>`
        out.push({ spec, names: [], typeOnly: false })
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      out.push({ spec: node.argument.literal.text, names: [], typeOnly: true })
    }
    ts.forEachChild(node, visit)
  }
  visit(parse(file, code))
  return out
}

/** Ambient, non-deterministic or I/O globals the core must take through a port instead. */
const BANNED_GLOBALS = new Set([
  'process', 'console', 'Buffer', 'require', 'module', '__dirname', '__filename', 'global', 'globalThis', 'window', 'document',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'performance', 'crypto',
  'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask'
])

/** Uses of the clock, randomness and host globals, as `file:line what`. */
export function ambientUses(file: string, code?: string): string[] {
  const sf = parse(file, code)
  const declared = new Set<string>()
  const collect = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ||
      ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isBindingElement(node)) && node.name && ts.isIdentifier(node.name)) {
      declared.add(node.name.text)
    }
    ts.forEachChild(node, collect)
  }
  collect(sf)
  const out: string[] = []
  const at = (node: ts.Node, what: string) => out.push(`${path.relative(root, file).split(path.sep).join('/')}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${what}`)
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date' && (node.arguments?.length ?? 0) === 0) {
      at(node, 'new Date() reads the clock')
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const call = `${node.expression.text}.${node.name.text}`
      if (call === 'Date.now') at(node, 'Date.now reads the clock')
      if (call === 'Math.random') at(node, 'Math.random is not deterministic')
    }
    if (ts.isIdentifier(node) && BANNED_GLOBALS.has(node.text) && !declared.has(node.text)) {
      const parent = node.parent
      const isMemberName = (ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isPropertyAssignment(parent) && parent.name === node) ||
        ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent) ||
        (ts.isBindingElement(parent) && parent.propertyName === node) || ts.isEnumMember(parent)
      if (!isMemberName) at(node, `${node.text} is a host global`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

export const rel = (file: string) => path.relative(root, file).split(path.sep).join('/')

/** The file a relative specifier points at, relative to the repo root (no extension resolution needed for prefix checks). */
export function target(file: string, spec: string): string {
  return rel(path.resolve(path.dirname(file), spec))
}

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs', 'fs/promises', 'http', 'https', 'net',
  'os', 'path', 'perf_hooks', 'process', 'readline', 'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm',
  'worker_threads', 'zlib'
])

export function isNodeBuiltin(spec: string): boolean {
  return spec.startsWith('node:') || NODE_BUILTINS.has(spec)
}
