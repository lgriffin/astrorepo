import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { OBJECT_TYPE_FILTERS, TARGET_SCOPES, TARGET_SORTS, stageWords, targetCountLine } from '../../src/shared/target-list'

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../src/renderer', rel), 'utf8')
const page = read('pages/TargetList.tsx')

describe('Targets page (specs/041-look-and-feel V4)', () => {
  it('[LF-020] Given the Targets page, When it opens, Then it lists yours first with the whole catalogue as the second tab', () => {
    expect(TARGET_SCOPES.map(s => s.label)).toEqual(['Yours', 'Whole catalogue'])
    expect(page).toContain("useState<TargetScope>('mine')")
    expect(page).toMatch(/'targets:search', \{[\s\S]*scope,/)
  })

  it('[LF-020] Given a count, When the line under the title is written, Then it says whose targets and whether they match a search', () => {
    expect(targetCountLine(12, 'mine', false)).toBe('12 targets of yours')
    expect(targetCountLine(1, 'mine', false)).toBe('1 target of yours')
    expect(targetCountLine(3, 'mine', true)).toBe('3 of your targets match')
    expect(targetCountLine(1, 'mine', true)).toBe('1 of your targets matches')
    expect(targetCountLine(13970, 'all', false)).toBe('13,970 in the catalogue')
    expect(targetCountLine(2, 'all', true)).toBe('2 in the catalogue match')
  })

  it('[LF-020] Given the filters, When they are listed, Then their words are in sentence case', () => {
    // Only the first word is capitalised; single letters such as "A to Z" are names of letters.
    for (const label of [...OBJECT_TYPE_FILTERS, ...TARGET_SORTS].map(f => f.label)) {
      for (const word of label.split(/[\s,]+/).slice(1).filter(w => w.length > 1)) expect(word).toBe(word.toLowerCase())
    }
    expect(stageWords('not_observed')).toBe('Not observed')
  })

  it('[LF-021] Given a search none of your targets match, When the list is empty, Then it fails over to an offer to search the whole catalogue, and with no targets at all to scan the library', () => {
    expect(page).toContain('Search the whole catalogue')
    expect(page).toContain('Scan your library')
    expect(page).toContain('Browse the whole catalogue')
  })

  it('[LF-022] Given choosing targets, When the cards are drawn, Then each has a real checkbox named after its target beside the card, and none otherwise', () => {
    expect(page).toContain('type="checkbox"')
    expect(page).toContain('aria-label={`Choose ${target.canonicalName}`}')
    expect(page).toMatch(/\{choosing && \(\s*<label/)
    // The old box drawn over the card's title is gone.
    expect(page).not.toMatch(/absolute top-2 left-2/)
  })

  it('[LF-023] Given chosen targets, When the bar shows, Then it sits at the bottom of the page in shared controls and asks before deleting', () => {
    expect(page).toContain('sticky bottom-0')
    // Fixed to the old sidebar's width, it ran under a folded sidebar.
    expect(page).not.toContain('left-56')
    expect(page).toContain('Delete {selected.size} targets?')
    expect(page).not.toMatch(/<button/)
  })
})
