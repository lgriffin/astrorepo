import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { CATALOGUE_KINDS, OBJECT_KINDS, PRIMERS, SOLAR_CAUTION, primerFor } from '@astro/domain'
import { FULL_MOON_ARCMIN, LEARNING_SETTING_KEY, SAFETY_CAUTIONS, conceptAtLevel, makeSaveQueue, parseLearningLevel, safetyCaution, sizeAgainstMoon } from '../../src/shared/learning'
import { SETTINGS_SECTIONS } from '../../src/shared/navigation'
import { angleText, toFitsLearningView, toLearningLibraryView, toObjectNumbersView } from '../../src/main/adapters/learning-presenter'
import { explainHeaders, objectNumbers } from '@astro/domain'

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('Learning while you observe', () => {
  it('[LRN-003] Given the shared object types, When the knowledge base is built, Then every type has a primer kind', () => {
    const union = /export type ObjectType =([\s\S]*?)\r?\n\r?\n/.exec(read('src/shared/types.ts'))![1]
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

  it('[LRN-004] Given a saved level, When it is read, Then off, short or deep is kept and anything else is deep', () => {
    expect(LEARNING_SETTING_KEY).toBe('learning_level')
    expect(parseLearningLevel('deep')).toBe('deep')
    expect(parseLearningLevel(' OFF ')).toBe('off')
    expect(parseLearningLevel('short')).toBe('short')
    expect(parseLearningLevel(null)).toBe('deep')
    expect(parseLearningLevel('loud')).toBe('deep')
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

  it('[LRN-008] Given Andromeda, When it is shown in numbers, Then its distance, travel time, lookback and true size read in words', () => {
    const v = toObjectNumbersView(objectNumbers({ names: ['Andromeda Galaxy', 'M31'], angularSizeArcmin: 178, thisYear: 2026 }))!
    expect(v.designation).toBe('M31')
    expect(v.distance).toBe('about 2.5 million light years')
    expect(v.range).toBe('2.4 to 2.6 million light years')
    expect(v.travel).toBe('2.5 million years')
    expect(v.size).toBe('about 130,000 light years across')
    expect(v.lookback).toBe('It set out before our species, Homo sapiens, appeared, which was about 300,000 years ago.')
    expect(v.sources).toEqual(['wiki-messier-object', 'wiki-homo-sapiens'])
    expect(v.approx).toBe(false)
    // Ranges across a scale word keep both words.
    expect(toObjectNumbersView(objectNumbers({ names: ['M109'], angularSizeArcmin: null, thisYear: 2026 }))!.range).toBe('60 to 110 million light years')
    expect(toObjectNumbersView(objectNumbers({ names: ['M7'], angularSizeArcmin: null, thisYear: 2026 }))!.range).toBe('650 to 1,300 light years')
  })

  it('[LRN-009] Given a single published value, When shown, Then no range is given; and with no size, no true size', () => {
    const v = toObjectNumbersView(objectNumbers({ names: ['M13'], angularSizeArcmin: null, thisYear: 2026 }))!
    expect(v.range).toBeNull()
    expect(v.size).toBeNull()
    expect(toObjectNumbersView(null)).toBeNull()
    expect(toObjectNumbersView(objectNumbers({ names: ['M24'], angularSizeArcmin: null, thisYear: 2026 }))!.approx).toBe(true)
  })

  it('[LRN-009] Given a target page, When its physics card shows, Then the numbers come from learning:object for that target', () => {
    expect(read('src/renderer/components/target/PhysicsCard.tsx')).toMatch(/<InNumbers targetId=\{target\.id\} \/>/)
    const src = read('src/renderer/components/target/InNumbers.tsx')
    expect(src).toMatch(/invoke<ObjectNumbersView \| null>\('learning:object', \{ target_id: targetId \}\)/)
    expect(src).toMatch(/if \(!numbers\) return null/)
    expect(read('src/main/ipc/handlers.ts')).toMatch(/handle\('learning:object'[\s\S]{0,160}\.objectNumbers\(args\.target_id\)/)
  })
})

describe('Your FITS header, in words', () => {
  it('[LRN-012] Given angles on the sky, When written, Then arcminutes below two degrees and degrees with arcminutes above', () => {
    expect(angleText(48.4)).toBe('48′')
    expect(angleText(119.4)).toBe('119′')
    expect(angleText(120)).toBe('2°')
    expect(angleText(126.2)).toBe('2° 6′')
    expect(angleText(179.6)).toBe('3°')
  })

  it('[LRN-011] [LRN-012] Given a Seestar-like header, When shown, Then its keywords, setup and sampling read in words', () => {
    const v = toFitsLearningView(explainHeaders([
      { keyword: 'NAXIS1', value: '1080' },
      { keyword: 'NAXIS2', value: '1920' },
      { keyword: 'FOCALLEN', value: '250' },
      { keyword: 'XPIXSZ', value: '2.9' },
      { keyword: 'GAIN', value: '80' }
    ]))
    expect(v.keywords.map(k => k.keyword)).toEqual(['NAXIS1', 'NAXIS2', 'FOCALLEN', 'XPIXSZ', 'GAIN'])
    const gain = v.keywords[4]
    expect(gain.concept).toBe('noise')
    expect(gain.standard).toBe(false)
    expect(gain.meaning).toMatch(/amplification/)
    expect(gain.why).toMatch(/read noise/)
    expect(v.keywords[0].standard).toBe(true)
    expect(v.setup).toEqual({
      inputs: '250 mm focal length, 2.9 µm pixels',
      scale: '2.39″ per pixel',
      field: '43′ × 77′',
      sampling: 'under',
      samplingText: 'Under-sampled: fewer than two pixels span a star’s blur, so stars can look square and fine detail is lost. (Against 2″ seeing, typical at an amateur site.)'
    })
    expect(v.solved).toBeNull()
  })

  it('[LRN-012] [LRN-013] Given finer sampling and a solve, When shown, Then the words follow and the measured scale is given', () => {
    const matched = toFitsLearningView(explainHeaders([{ keyword: 'FOCALLEN', value: '1000' }, { keyword: 'XPIXSZ', value: '4.5' }, { keyword: 'CDELT1', value: '0.000255' }]))
    expect(matched.setup!.sampling).toBe('matched')
    expect(matched.setup!.samplingText).toMatch(/^Well matched: two to three pixels/)
    expect(matched.setup!.field).toBeNull()
    expect(matched.solved).toBe('A plate solve measured 0.92″ per pixel.')
    const over = toFitsLearningView(explainHeaders([{ keyword: 'FOCALLEN', value: '2000' }, { keyword: 'XPIXSZ', value: '3.76' }]))
    expect(over.setup!.sampling).toBe('over')
    expect(over.setup!.samplingText).toMatch(/^Over-sampled: more than three pixels/)
    expect(over.setup!.inputs).toBe('2000 mm focal length, 3.76 µm pixels')
    expect(toFitsLearningView(explainHeaders([])).setup).toBeNull()
  })

  it('[LRN-014] Given learning is off, When a file opens, Then its header is not explained and no setup shows', () => {
    const src = read('src/renderer/components/fits/HeaderLearning.tsx')
    const off = src.indexOf("if (level === 'off' || headers.length === 0) return")
    expect(off).toBeGreaterThan(-1)
    expect(off).toBeLessThan(src.indexOf("invoke<FitsLearningView>('learning:fits'"))
    expect(src).toMatch(/if \(!entry \|\| level === 'off'\) return null/)
    expect(src).toMatch(/if \(level === 'off' \|\| !learning \|\| \(!learning\.setup && !learning\.solved\)\) return null/)
    const page = read('src/renderer/components/fits/FileDetail.tsx')
    expect(page).toMatch(/const explaining = level !== 'off' && learning !== null/)
    expect(page).toMatch(/<YourSetup learning=\{learning\} \/>/)
    expect(page).toMatch(/\{explaining && <th className="px-2 py-1">What it means<\/th>\}/)
  })
})

