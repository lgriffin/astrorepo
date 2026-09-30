import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import { NAV_ITEMS, SETTINGS_SECTIONS, TARGET_TABS } from '../../src/shared/navigation'

/** A piece of text the user reads on a button, a tab or a labelled figure. */
export interface UiText {
  file: string
  line: number
  text: string
}

/** Names that keep their capitals: products, catalogues, acronyms, and the app's own places. */
const PROPER = new Set([
  'Siril', 'Siril_Scripts', 'Seestar', 'Vespera', 'Git', 'Bash', 'RC', 'Astro', 'NINA', 'SIMBAD', 'NED', 'Messier', 'NGC', 'Command', 'Prompt',
  'Windows', 'Linux', 'Bayer', 'Ha', 'OIII', 'SII', 'Dec', 'RA', 'I'
])
const PLACES = [...NAV_ITEMS.map(i => i.label), ...TARGET_TABS.map(t => t.label), ...SETTINGS_SECTIONS.map(s => s.label)].sort((a, b) => b.length - a.length)

/** The words after the first that are capitalised without being a name, an acronym or a place. */
export function titleCaseWords(text: string): string[] {
  // A numbered step such as "1 · Stack" starts after its number.
  const body = text.replace(/^\d+\s*·\s*/, '')
  let rest = body
  for (const place of PLACES) rest = rest.split(place).join(' ')
  const words = rest.split(/\s+/).filter(Boolean)
  const firstWord = body.trim().split(/\s+/)[0]
  return words.filter((w, i) => {
    const bare = w.replace(/^[^A-Za-z_]+|[^A-Za-z_]+$/g, '')
    if (!bare || !/^[A-Z]/.test(bare)) return false
    if (i === 0 && w === firstWord) return false
    if (PROPER.has(bare) || /^[A-Z0-9]{2,}s?$/.test(bare) || /^[A-Z]$/.test(bare)) return false
    // A word that opens a new sentence may be capitalised.
    const before = words[i - 1]
    return !(before && /[.!?:]$/.test(before))
  })
}

const LABEL_PROPS = new Set(['label', 'title'])

/** Button text, and label and title props given to components, across the renderer's sources. */
export function uiTexts(rendererDir: string): UiText[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.tsx')) files.push(full)
    }
  }
  walk(rendererDir)

  return files.flatMap(file =>
    uiTextsOf(path.relative(rendererDir, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8'))
  )
}

/** Components whose children are the text of a button they render. */
const BUTTON_TAGS = new Set(['button', 'LinkButton', 'Link'])

/** The UI texts of one TSX source. */
export function uiTextsOf(rel: string, code: string): UiText[] {
  const source = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: UiText[] = []
  const add = (node: ts.Node, text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (/[A-Za-z]/.test(clean)) out.push({ file: rel, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: clean })
  }
  // Strings a button can show: its text, and the literals of a {cond ? 'A' : 'B'} inside it.
  const collectShown = (node: ts.Node): void => {
    if (ts.isJsxText(node)) add(node, node.getText(source))
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!ts.isCallExpression(node.parent) && !ts.isBinaryExpression(node.parent) && !ts.isElementAccessExpression(node.parent)) add(node, node.text)
    } else if (ts.isJsxAttributes(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return
    ts.forEachChild(node, collectShown)
  }
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && BUTTON_TAGS.has(node.openingElement.tagName.getText(source))) {
      for (const child of node.children) collectShown(child)
    }
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && /^[A-Z]/.test(node.tagName.getText(source))) {
      for (const p of node.attributes.properties) {
        if (!ts.isJsxAttribute(p) || !LABEL_PROPS.has(p.name.getText(source)) || !p.initializer) continue
        if (ts.isStringLiteral(p.initializer)) add(p, p.initializer.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return out
}
