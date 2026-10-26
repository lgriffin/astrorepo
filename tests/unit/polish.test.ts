import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { appIconDataUrl, appIconSvg, MARK_TICKS } from '../../src/shared/logo'
import { PALETTES } from '../../src/shared/themes'
import { RAIL_BELOW_PX, startsAsRail, windowTitle } from '../../src/shared/layout'

const ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return tsxFiles(full)
    return e.name.endsWith('.tsx') ? [full] : []
  })
}

describe('Polish (specs/041-look-and-feel V7)', () => {
  it('[LF-031] Given the mark, When the app icon is drawn, Then it is the sidebar mark on a tile and the committed icon matches it', () => {
    expect(MARK_TICKS).toHaveLength(24)
    const svg = appIconSvg(PALETTES.dark)
    expect(svg).toContain(`fill="${PALETTES.dark.surface}"`)
    expect(svg).toContain(`stroke="${PALETTES.dark.accent}"`)
    expect(read('resources/icon.svg').trim()).toBe(svg)
    // Windows reads the .ico, which wraps the PNG.
    const ico = fs.readFileSync(path.join(ROOT, 'resources/icon.ico'))
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.subarray(22, 26).toString('latin1')).toBe('\u0089PNG')
    expect(read('forge.config.ts')).toContain("icon: 'resources/icon'")
    expect(read('src/main/index.ts')).toContain("icon: path.join(__dirname, '../../resources/icon.png')")
    expect(read('src/renderer/components/atlas/Logo.tsx')).toContain('MARK_TICKS.map')
  })

  it('[LF-031] Given a theme, When it is applied, Then the favicon is the mark in that theme', () => {
    expect(appIconDataUrl(PALETTES.night)).toContain(encodeURIComponent(PALETTES.night.accent))
    expect(read('src/renderer/theme.ts')).toContain('link.href = appIconDataUrl(palette)')
  })

  it('[LF-032] Given a narrow screen such as the 800×480 kiosk, When the sidebar has never been folded there, Then it starts as a rail, and a saved choice wins', () => {
    expect(startsAsRail(null, 800)).toBe(true)
    expect(startsAsRail(null, RAIL_BELOW_PX)).toBe(false)
    expect(startsAsRail(null, 1440)).toBe(false)
    expect(startsAsRail('0', 800)).toBe(false)
    expect(startsAsRail('1', 1440)).toBe(true)
  })

  it('[LF-033] Given any page, When it opens, Then the window is titled after it and a skip link leads past the sidebar', () => {
    expect(windowTitle('Targets')).toBe('Targets · AstroRepo')
    expect(windowTitle('')).toBe('AstroRepo')
    expect(read('src/renderer/components/common/PageContainer.tsx')).toContain('document.title = windowTitle(heading)')
    const layout = read('src/renderer/components/common/Layout.tsx')
    expect(layout).toContain('Skip to the page')
    expect(layout.indexOf('Skip to the page')).toBeLessThan(layout.indexOf('<Sidebar'))
  })

  it('[LF-034] Given a page\'s main action, When it is drawn, Then it is the shared primary button, and the check fails on a hand-styled accent button', () => {
    const handStyled = /<button\b[^>]*className="[^"]*\bbg-astro-accent\s/
    expect(handStyled.test('<button onClick={go} className="px-4 bg-astro-accent text-astro-on-accent">')).toBe(true)
    const offenders = tsxFiles(path.join(ROOT, 'src/renderer')).filter(f => handStyled.test(fs.readFileSync(f, 'utf8')))
    expect(offenders.map(f => path.relative(ROOT, f))).toEqual([])
  })
})
