import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { titleCaseWords, uiTexts } from '../helpers/ui-text'

const root = path.resolve(__dirname, '../..')

/** Every `actionLabel: '…'` a suggestion is given in the main process. */
function actionLabels(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = []
  for (const dir of ['src/main', 'packages']) {
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name)
        if (e.isDirectory()) {
          if (e.name !== 'node_modules') walk(full)
        } else if (e.name.endsWith('.ts')) {
          for (const m of fs.readFileSync(full, 'utf8').matchAll(/actionLabel:\s*'([^']+)'/g)) out.push({ file: path.relative(root, full), text: m[1] })
        }
      }
    }
    walk(path.join(root, dir))
  }
  return out
}

describe('Consistent wording (specs/017-unified-ux, U5)', () => {
  it('[UX-016] Given every button, labelled figure and card title in the renderer, When their words are read, Then none is in title case', () => {
    const texts = uiTexts(path.join(root, 'src/renderer'))
    expect(texts.length).toBeGreaterThan(200)
    const offenders = texts.filter(t => titleCaseWords(t.text).length > 0).map(t => `${t.file}:${t.line} ${t.text}`)
    expect(offenders).toEqual([])
  })

  it('[UX-016] Given names, acronyms, places and numbered steps, When the checker reads them, Then it allows them and still catches title case', () => {
    expect(titleCaseWords('Export FITS data CSV')).toEqual([])
    expect(titleCaseWords('Open the Sky planner')).toEqual([])
    expect(titleCaseWords('1 · Stack')).toEqual([])
    expect(titleCaseWords('Find Siril')).toEqual([])
    expect(titleCaseWords('Pixel size X')).toEqual([])
    expect(titleCaseWords('Save Location')).toEqual(['Location'])
    expect(titleCaseWords('Most Imaged Target')).toEqual(['Imaged', 'Target'])
  })

  it('[UX-017] Given every suggestion the main process builds, When its action is labelled, Then the label is in sentence case', () => {
    const labels = actionLabels()
    expect(labels.map(l => l.text)).toContain('Open target')
    expect(labels.filter(l => titleCaseWords(l.text).length > 0)).toEqual([])
  })
})
