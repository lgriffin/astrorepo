import fs from 'fs'
import path from 'path'
import ts from 'typescript'

/** One JSX element of the renderer, as the keyboard and naming checks need it (spec 046, U4). */
export interface JsxElementInfo {
  file: string
  line: number
  tag: string
  /** Each attribute by name, with its initializer's source text ('' when it has none). */
  attrs: Map<string, string>
  /** The source text of each {...spread} attribute. */
  spreads: string[]
  /** The tags of the elements it sits inside, nearest first. */
  ancestors: string[]
  /** The tags of every element inside it. */
  descendants: string[]
}

/** Every .tsx file under a folder. */
export function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...tsxFiles(full))
    else if (e.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** The JSX elements of one TSX source. */
export function jsxElementsOf(rel: string, code: string): JsxElementInfo[] {
  const source = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: JsxElementInfo[] = []
  const tagsInside = (node: ts.Node): string[] => {
    const found: string[] = []
    const walk = (n: ts.Node): void => {
      if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) found.push(n.tagName.getText(source))
      ts.forEachChild(n, walk)
    }
    ts.forEachChild(node, walk)
    return found
  }
  const visit = (node: ts.Node, ancestors: string[]): void => {
    let opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement | null = null
    if (ts.isJsxElement(node)) opening = node.openingElement
    else if (ts.isJsxSelfClosingElement(node)) opening = node
    if (opening) {
      const tag = opening.tagName.getText(source)
      const attrs = new Map<string, string>()
      const spreads: string[] = []
      for (const p of opening.attributes.properties) {
        if (ts.isJsxAttribute(p)) attrs.set(p.name.getText(source), p.initializer ? p.initializer.getText(source) : '')
        else spreads.push(p.expression.getText(source))
      }
      out.push({
        file: rel,
        line: source.getLineAndCharacterOfPosition(opening.getStart()).line + 1,
        tag,
        attrs,
        spreads,
        ancestors,
        descendants: ts.isJsxElement(node) ? node.children.flatMap(c => [...(ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) ? [(ts.isJsxElement(c) ? c.openingElement : c).tagName.getText(source)] : []), ...tagsInside(c)]) : []
      })
      const inner = [tag, ...ancestors]
      if (ts.isJsxElement(node)) for (const c of node.children) visit(c, inner)
      for (const p of opening.attributes.properties) ts.forEachChild(p, n => visit(n, inner))
      return
    }
    ts.forEachChild(node, n => visit(n, ancestors))
  }
  visit(source, [])
  return out
}

/** Every JSX element of the .tsx files under a folder, with paths relative to it. */
export function jsxElements(dir: string): JsxElementInfo[] {
  return tsxFiles(dir).flatMap(file => jsxElementsOf(path.relative(dir, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8')))
}
