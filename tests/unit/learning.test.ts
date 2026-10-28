import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { OBJECT_KINDS } from '@astro/domain'
import { FULL_MOON_ARCMIN, LEARNING_SETTING_KEY, conceptAtLevel, parseLearningLevel, sizeAgainstMoon } from '../../src/shared/learning'
import { SETTINGS_SECTIONS } from '../../src/shared/navigation'
import { toLearningLibraryView } from '../../src/main/adapters/learning-presenter'

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('Learning while you observe', () => {
  it('[LRN-003] Given the shared object types, When the knowledge base is built, Then every type has a primer kind', () => {
    const union = /export type ObjectType =([\s\S]*?)\n\n/.exec(read('src/shared/types.ts'))![1]
    const types = [...union.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect([...OBJECT_KINDS].sort()).toEqual(types.sort())
    expect(toLearningLibraryView().primers.map(p => p.kind).sort()).toEqual(types.sort())
  })

  it('[LRN-005] Given the library sent to the page, When it is read, Then no source carries an address', () => {
    const view = toLearningLibraryView()
    expect(view.sources.length).toBeGreaterThan(0)
    for (const s of view.sources) expect(Object.keys(s).sort()).toEqual(['id', 'publisher', 'title'])
    const handlers = read('src/main/ipc/handlers.ts')
    expect(handlers).toMatch(/learning:open-source[\s\S]{0,200}sourceUrl\(args\.source_id\)[\s\S]{0,80}if \(!url\) return \{ opened: false \}/)
  })

  it('[LRN-004] Given a saved level, When it is read, Then off, short or deep is kept and anything else is short', () => {
    expect(LEARNING_SETTING_KEY).toBe('learning_level')
    expect(parseLearningLevel('deep')).toBe('deep')
    expect(parseLearningLevel(' OFF ')).toBe('off')
    expect(parseLearningLevel('short')).toBe('short')
    expect(parseLearningLevel(null)).toBe('short')
    expect(parseLearningLevel('loud')).toBe('short')
    expect(SETTINGS_SECTIONS.find(s => s.id === 'learning')?.group).toBe('This app')
    expect(read('src/renderer/pages/Settings.tsx')).toMatch(/learning: \(\) => <LearningSettings \/>/)
  })

  it('[LRN-001] Given a concept, When it is shown at each level, Then off shows nothing, short the answer and deep the paragraph and formula too', () => {
    const c = { short: 'S', detail: 'D', formula: 'F' }
    expect(conceptAtLevel(c, 'off')).toBeNull()
    expect(conceptAtLevel(c, 'short')).toEqual({ short: 'S', detail: null, formula: null })
    expect(conceptAtLevel(c, 'deep')).toEqual({ short: 'S', detail: 'D', formula: 'F' })
  })

  it('[LRN-001] Given the Why? control, When it opens, Then Escape, Close and a click outside close it and focus goes back', () => {
    const src = read('src/renderer/components/ui/Explain.tsx')
    expect(src).toMatch(/aria-expanded=\{open\}/)
    expect(src).toMatch(/e\.key === 'Escape'/)
    expect(src).toMatch(/aria-label="Close"/)
    expect(src).toMatch(/addEventListener\('mousedown'/)
    expect(src).toMatch(/button\.current\?\.focus\(\)/)
    expect(src).toMatch(/onClick=\{\(\) => setShown\(r\)\}/)
    expect(src).toMatch(/openSource\(s\)/)
  })

  it('[LRN-003] Given a target page, When its Overview opens, Then it shows The physics card', () => {
    expect(read('src/renderer/pages/TargetDetail.tsx')).toMatch(/<PhysicsCard target=\{target\} \/>/)
  })

  it('[LRN-007] Given learning is off, When a target with a warning opens, Then the warning still shows', () => {
    const src = read('src/renderer/components/target/PhysicsCard.tsx')
    const caution = src.indexOf('const caution')
    const off = src.indexOf("if (level === 'off')")
    expect(caution).toBeGreaterThan(-1)
    expect(off).toBeGreaterThan(caution)
    expect(src.slice(off, off + 120)).toMatch(/caution \? <Card title="Safety">\{caution\}<\/Card>/)
  })

  it('[LRN-006] Given an angular size, When it is told against the full Moon, Then it reads in Moons or fractions of one', () => {
    expect(FULL_MOON_ARCMIN).toBe(31)
    expect(sizeAgainstMoon(178)).toBe('about 6 full Moons across')
    expect(sizeAgainstMoon(46.5)).toBe('about 2 full Moons across')
    expect(sizeAgainstMoon(46.4)).toBe('about as wide as the full Moon')
    expect(sizeAgainstMoon(31)).toBe('about as wide as the full Moon')
    expect(sizeAgainstMoon(23.25)).toBe('about as wide as the full Moon')
    expect(sizeAgainstMoon(20)).toBe('about half the width of the full Moon')
    expect(sizeAgainstMoon(6)).toBe('about 1/5 of the full Moon’s width')
    expect(sizeAgainstMoon(0.31)).toBe('about 1/100 of the full Moon’s width')
    expect(sizeAgainstMoon(0.1)).toBe('far smaller than the full Moon')
    expect(sizeAgainstMoon(0)).toBeNull()
    expect(sizeAgainstMoon(-3)).toBeNull()
    expect(sizeAgainstMoon(null)).toBeNull()
    expect(sizeAgainstMoon(Number.NaN)).toBeNull()
  })
})
