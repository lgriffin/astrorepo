import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { setupSteps, showSetup, type SetupState } from '../../src/shared/setup'

const renderer = path.resolve(__dirname, '../../src/renderer')
const read = (rel: string) => fs.readFileSync(path.join(renderer, rel), 'utf8')

const fresh: SetupState = { latitude: null, longitude: null, homeFolder: null, lastLibraryScan: null, sirilFound: false }
const ready: SetupState = { latitude: '51.5', longitude: '-0.12', homeFolder: 'D:/Astro', lastLibraryScan: '2026-09-30 07:00:00', sirilFound: true }

describe('Setting up', () => {
  it('[UX-013] Given the site, When a page needs it, Then it is set only in Settings > Your site and the pages link there', () => {
    const sky = read('pages/SkyPlanner.tsx')
    expect(sky).not.toContain("'settings:set'")
    expect(sky).toContain("settingsLink('location')")
    expect(read('components/cockpit/ComingNightsCard.tsx')).toContain("settingsLink('location')")
    expect(read('pages/Settings.tsx')).toContain('id="settings-location"')
  })

  it('[UX-014] Given a fresh install, When Home is drawn, Then the checklist shows four steps in order, each linking where it is done', () => {
    const steps = setupSteps(fresh)
    expect(steps.map(s => [s.id, s.done, s.link])).toEqual([
      ['site', false, '/settings?section=location'],
      ['folder', false, '/settings?section=folders'],
      ['scan', false, '/library'],
      ['siril', false, '/settings?section=tools']
    ])
    expect(showSetup(steps, false)).toBe(true)
    expect(read('pages/Dashboard.tsx')).toContain('<SetupCard />')
  })

  it('[UX-014] Given every step done, or the checklist hidden, When Home is drawn, Then the checklist is not shown', () => {
    expect(setupSteps(ready).every(s => s.done)).toBe(true)
    expect(showSetup(setupSteps(ready), false)).toBe(false)
    expect(showSetup(setupSteps(fresh), true)).toBe(false)
  })

  it('[UX-014] Given half-set values, When the steps are worked out, Then only complete ones count, and an unknown Siril is not a step left', () => {
    const steps = setupSteps({ ...ready, longitude: '  ', homeFolder: '', sirilFound: null })
    expect(steps.filter(s => !s.done).map(s => s.id)).toEqual(['site', 'folder'])
    expect(setupSteps({ ...ready, latitude: 'north' }).find(s => s.id === 'site')?.done).toBe(false)
  })

  it('[UX-015] Given an empty Library, FITS files or Images page, When it is drawn, Then it says what would be there and links to the step that fills it', () => {
    expect(read('pages/Library.tsx')).toContain("settingsLink('folders')")
    for (const page of ['pages/FitsAnalyzer.tsx', 'pages/Images.tsx']) {
      const source = read(page)
      expect(source, page).toContain('<EmptyState')
      expect(source, page).toContain('href="#/library"')
    }
  })

  it('[UX-014] Given a setting that cannot be read, When Home is drawn, Then the checklist stays away rather than list the step as left', () => {
    const card = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/components/cockpit/SetupCard.tsx'), 'utf8')
    expect(card).toContain('.catch(() => UNREAD)')
    expect(card).toContain('hide === UNREAD) return')
  })
})
