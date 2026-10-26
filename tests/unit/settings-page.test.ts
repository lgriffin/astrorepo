import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { NAV_PLACES, SETTINGS_GROUPS, SETTINGS_SECTIONS, settingsLink } from '../../src/shared/navigation'
import { matchEntries, paletteEntries } from '../../src/shared/command-palette'

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../src/renderer', rel), 'utf8')

describe('Settings as pages (specs/041-look-and-feel V5)', () => {
  it('[LF-024] Given Settings, When it is drawn, Then its sections are listed by group, every group has some, and the open one is marked', () => {
    for (const g of SETTINGS_GROUPS) expect(SETTINGS_SECTIONS.some(s => s.group === g)).toBe(true)
    expect(SETTINGS_SECTIONS.filter(s => s.group === 'Your observatory').map(s => s.label)).toEqual(['Your site', 'Equipment', 'Weather'])
    // The list follows the groups' order, so a section never sits under another group's heading.
    const order = SETTINGS_SECTIONS.map(s => SETTINGS_GROUPS.indexOf(s.group))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    const page = read('pages/Settings.tsx')
    expect(page).toContain("aria-current={s.id === active ? 'page' : undefined}")
    expect(page).toContain('<View key={active} />')
    // Moving between sections adds to the history, so Back returns to the section before.
    expect(page).toContain('void navigate(settingsLink(id)) }')
    expect(page).not.toContain('settingsLink(id), { replace: true }')
  })

  it('[LF-024] Given the Settings place, When the sidebar lists it, Then Settings is its only page', () => {
    expect(NAV_PLACES.find(p => p.id === 'settings')?.pages.map(p => p.label)).toEqual(['Settings'])
  })

  it('[LF-025] Given an old link to the Equipment page, When it is opened, Then it fails over to Settings > Equipment', () => {
    expect(read('App.tsx')).toContain(`<Route path="/equipment" element={<Navigate to={settingsLink('equipment')} replace />} />`)
    expect(settingsLink('equipment')).toBe('/settings?section=equipment')
    expect(read('components/sky/MosaicPlanner.tsx')).toContain("settingsLink('equipment')")
  })

  it('[LF-026] Given a piece of equipment, When it is listed, Then it is opened, changed and deleted with buttons named after it, and deleting asks first', () => {
    const eq = read('components/settings/EquipmentSettings.tsx')
    expect(eq).toContain('aria-label={`Change ${eq.name}`}')
    expect(eq).toContain('aria-label={`Delete ${eq.name}`}')
    expect(eq).toContain('aria-expanded={selectedId === eq.id}')
    expect(eq).toContain('Delete {eq.name}?')
    // The card is no longer a clickable div with the actions inside it.
    expect(eq).not.toMatch(/<div[^>]*onClick/)
    // A camera without a sensor size has no field, but its image scale is still shown.
    expect(eq).toContain('Promise.allSettled')
    expect(eq).toContain('(fovResult || imageScale) && (')
  })

  it('[LF-027] Given a word for a Settings section, When it is typed into Go to, Then that section is offered first', () => {
    const entries = paletteEntries()
    expect(matchEntries(entries, 'telescope')[0]?.to).toBe(settingsLink('equipment'))
    expect(matchEntries(entries, 'theme')[0]?.to).toBe(settingsLink('appearance'))
    expect(matchEntries(entries, 'latitude')[0]?.to).toBe(settingsLink('location'))
  })
})
