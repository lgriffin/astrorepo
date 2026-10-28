import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { CATALOGUE_KINDS, OBJECT_KINDS, PRIMERS, SOLAR_CAUTION, primerFor } from '@astro/domain'
import { FULL_MOON_ARCMIN, LEARNING_SETTING_KEY, SAFETY_CAUTIONS, conceptAtLevel, makeSaveQueue, parseLearningLevel, safetyCaution, sizeAgainstMoon } from '../../src/shared/learning'
import { SETTINGS_SECTIONS } from '../../src/shared/navigation'
import { toLearningLibraryView } from '../../src/main/adapters/learning-presenter'

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('Learning while you observe', () => {
  it('[LRN-003] Given the shared object types, When the knowledge base is built, Then every type has a primer kind', () => {
    const union = /export type ObjectType =([\s\S]*?)\n\n/.exec(read('src/shared/types.ts'))![1]
    const types = [...union.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect([...OBJECT_KINDS].sort()).toEqual(types.sort())
    expect(toLearningLibraryView().primers.map(p => p.kind).sort()).toEqual([...types, ...CATALOGUE_KINDS].sort())
  })

  it('[LRN-003] Given every kind the shipped catalogues store, When its primer is looked up, Then it has its own, not the not yet known one', () => {
    const dir = path.join(root, 'data/catalogues')
    const kinds = new Set(fs.readdirSync(dir).flatMap(f => (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).objects as { type: string }[]).map(o => o.type)))
    expect(kinds.size).toBeGreaterThan(5)
    for (const kind of kinds) expect(primerFor(kind).kind, kind).toBe(kind)
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
    expect(src).toMatch(/onKeyDown=\{e => \{\s*if \(open && e\.key === 'Escape'\)/)
    // The handler sits on the wrapper, so Escape works with focus still on the Why? itself.
    expect(src.indexOf("e.key === 'Escape'")).toBeLessThan(src.indexOf('<button'))
    // A click outside also goes back to the concept the button names.
    expect(src).toMatch(/setOpen\(false\)\s*setShown\(id\)\s*\}/)
    // Phrasing elements only, so it can sit inside a sentence.
    expect(src).not.toMatch(/<(div|p|ul|li)[\s>]/)
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
    const off = src.indexOf("if (level === 'off' || !p)")
    expect(caution).toBeGreaterThan(-1)
    expect(off).toBeGreaterThan(caution)
    expect(src.slice(off, off + 120)).toMatch(/caution \? <Card title="Safety">\{caution\}<\/Card>/)
    // From the shared list, so it shows before the library has loaded, or if it never does.
    expect(src).toMatch(/const warning = safetyCaution\(target\.objectType\) \?\? p\?\.caution/)
  })

  it('[LRN-007] Given the shared warnings, When compared with the knowledge base, Then every primer warning is the same words', () => {
    expect(safetyCaution('solar_object')).toBe(SOLAR_CAUTION)
    expect(safetyCaution('galaxy')).toBeNull()
    expect(safetyCaution(null)).toBeNull()
    expect(safetyCaution('toString')).toBeNull()
    for (const p of Object.values(PRIMERS)) expect(safetyCaution(p.kind), p.kind).toBe(p.caution)
    expect(Object.keys(SAFETY_CAUTIONS)).toEqual(['solar_object'])
  })

  it('[LRN-004] Given quick changes of level, When they are saved, Then the saves run one after another in the order chosen', async () => {
    const landed: string[] = []
    const delays: Record<string, number> = { deep: 30, off: 0 }
    const save = makeSaveQueue(v => new Promise<void>((resolve, reject) => setTimeout(() => (v === 'bad' ? reject(new Error('no')) : (landed.push(v), resolve())), delays[v] ?? 0)))
    const results = await Promise.all([save('deep'), save('bad'), save('off')])
    expect(landed).toEqual(['deep', 'off'])
    expect(results).toEqual([true, false, true])
    const provider = read('src/renderer/contexts/LearningContext.tsx')
    expect(provider).toMatch(/if \(current && !chosen\.current\) setLevel/)
    expect(provider).toMatch(/chosen\.current = true/)
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
