import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { CATALOGUE_KINDS, OBJECT_KINDS, PRIMERS, SOLAR_CAUTION, primerFor } from '@astro/domain'
import { CONCEPT_PLACES, TRAIL_MAX, parseTrail, withOpened, FULL_MOON_ARCMIN, HEADER_LINES_MAX, HEADER_VALUE_MAX, LEARNING_SETTING_KEY, headerLinesForLearning, SAFETY_CAUTIONS, conceptAtLevel, makeSaveQueue, parseLearningLevel, safetyCaution, sizeAgainstMoon } from '../../src/shared/learning'
import { SETTINGS_SECTIONS, locate } from '../../src/shared/navigation'
import { conceptEntry } from '../../src/shared/command-palette'
import { angleText, latitudeText, toFilterLightView, toLookbackStopView, toFitsLearningView, toLearningLibraryView, toObjectNumbersView, toTonightSkyView } from '../../src/main/adapters/learning-presenter'
import { explainHeaders, filterLight, lookbackStrip, objectNumbers, tonightSky } from '@astro/domain'

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

  it('[LRN-011] Given a long header, When sent to be explained, Then notes are left out and long values cut, so it is never refused', () => {
    const rows = [
      { keyword: 'COMMENT', value: 'x' },
      { keyword: 'HISTORY', value: 'y' },
      { keyword: '  ', value: null },
      { keyword: ' FOCALLEN ', value: '400' },
      { keyword: 'LONGSTR', value: 'z'.repeat(5000) },
      { keyword: 'BLANK', value: null }
    ]
    expect(headerLinesForLearning(rows)).toEqual([
      { keyword: 'FOCALLEN', value: '400' },
      { keyword: 'LONGSTR', value: 'z'.repeat(HEADER_VALUE_MAX) },
      { keyword: 'BLANK', value: null }
    ])
    const many = Array.from({ length: HEADER_LINES_MAX + 50 }, (_, i) => ({ keyword: `K${i}`, value: '1' }))
    const sent = headerLinesForLearning(many)
    expect(sent).toHaveLength(HEADER_LINES_MAX)
    expect(sent[HEADER_LINES_MAX - 1].keyword).toBe(`K${HEADER_LINES_MAX - 1}`)
    // Above the FITS parser's 7,200 cards, and the schema takes exactly these limits.
    expect(HEADER_LINES_MAX).toBeGreaterThan(7200)
    const schema = read('src/main/ipc/schemas.ts')
    expect(schema).toMatch(/value: z\.string\(\)\.max\(HEADER_VALUE_MAX\)\.nullable\(\) \}\)\)\.max\(HEADER_LINES_MAX\)/)
    expect(read('src/renderer/components/fits/HeaderLearning.tsx')).toMatch(/\{ headers: headerLinesForLearning\(headers\) \}/)
  })

  it('[LRN-011] Given a Why? inside a scrolling table, When it opens, Then its panel is placed against the window and scrolling shuts it', () => {
    const src = read('src/renderer/components/ui/Explain.tsx')
    expect(src).toMatch(/className="fixed z-50/)
    expect(src).toMatch(/addEventListener\('scroll', onScroll, true\)/)
    expect(src).toMatch(/const down = h - box\.bottom >= box\.top/)
    // A file switch drops the last file's headers before its own arrive.
    const page = read('src/renderer/components/fits/FileDetail.tsx')
    expect(page.indexOf('setHeaders([])')).toBeLessThan(page.indexOf("'fits:get-headers'"))
    expect(page).toMatch(/if \(current\) setHeaders\(r\.headers\)/)
  })
})

describe('Why tonight looks like this', () => {
  it('[LRN-015] [LRN-016] Given nights through the year, When told in words, Then the Sun’s depth, the darkness and the change read plainly', () => {
    expect(latitudeText(53.3)).toBe('53.3° N')
    expect(latitudeText(-33.86)).toBe('33.9° S')
    expect(latitudeText(0)).toBe('0.0° N')
    expect(toTonightSkyView(tonightSky(53.3, '2026-10-28'))).toEqual({
      darkness: 'full',
      text: 'At 53.3° N on 28 Oct, the Sun sinks to about 51° below your horizon at its lowest, past the 18° that full darkness needs.',
      change: 'Nights stay fully dark until around 15 May.'
    })
    expect(toTonightSkyView(tonightSky(53.3, '2026-06-21'))).toEqual({
      darkness: 'nautical',
      text: 'At 53.3° N on 21 Jun, the Sun gets only about 13° below your horizon at its lowest, short of the 18° that full darkness needs: the sky reaches astronomical twilight but never full darkness.',
      change: 'Fully dark nights return around 30 Jul.'
    })
    expect(toTonightSkyView(tonightSky(58, '2026-06-21')).text).toBe('At 58.0° N on 21 Jun, the Sun gets only about 8° below your horizon at its lowest, so the sky gets no darker than nautical twilight.')
    expect(toTonightSkyView(tonightSky(62, '2026-06-21')).text).toBe('At 62.0° N on 21 Jun, the Sun gets only about 4° below your horizon at its lowest, so civil twilight lasts all night.')
    expect(toTonightSkyView(tonightSky(70, '2026-06-21')).text).toBe('At 70.0° N on 21 Jun, the Sun stays above your horizon all night: the midnight sun.')
    expect(toTonightSkyView(tonightSky(-33.9, '2026-12-21')).change).toBeNull()
    // Just short of a threshold the depth rounds down, so it never reads as the depth it lacks.
    const edge = { latitudeDeg: 53.3, night: '2026-08-01', lowestSunDeg: 17.7, darkness: 'nautical' as const, fullDarkReturns: '2026-08-02', fullDarkEnds: null }
    expect(toTonightSkyView(edge).text).toMatch(/about 17° below/)
    expect(toTonightSkyView({ ...edge, lowestSunDeg: 18.6, darkness: 'full', fullDarkReturns: null }).text).toMatch(/about 19° below/)
  })

  it('[LRN-017] Given Home and the Sky planner, When learning is on, Then tonight’s dark, moon, bright-moon note, best targets, twilight and seasons each offer their idea', () => {
    const hero = read('src/renderer/components/cockpit/TonightHero.tsx')
    expect(hero).toMatch(/concept="twilight">/)
    expect(hero).toMatch(/<Fact label="Moon" concept="moon-phase">/)
    expect(hero).toMatch(/\/\^The moon is\/\.test\(n\) && <> <Explain concept="moonlight" \/><\/>/)
    expect(hero).toMatch(/Best to shoot <Explain concept="airmass"/)
    expect(hero).toMatch(/\{site && <WhyTonight site=\{site\} \/>\}/)
    const planner = read('src/renderer/pages/SkyPlanner.tsx')
    expect(planner).toMatch(/Twilight times <Explain concept="twilight" \/>/)
    expect(planner).toMatch(/Seasons for targets with work left <Explain concept="seasons" \/>/)
    const home = read('src/renderer/pages/Dashboard.tsx')
    expect(home).toMatch(/site=\{tonightSite\}/)
    // The plan's own night and judgement of tonight are passed on, never the renderer's calendar date.
    expect(home).toMatch(/plan\.tonight\?\.night \?\? plan\.night \?\? null/)
    expect(home).not.toMatch(/toLocaleDateString/)
    expect(home).toMatch(/planned: !plan\.tonight \? \('short' as const\)/)
  })

  it('[LRN-017] Given learning is off, When Home opens, Then tonight’s darkness is not worked out or shown', () => {
    const src = read('src/renderer/components/cockpit/WhyTonight.tsx')
    const off = src.indexOf("if (level === 'off') return")
    expect(off).toBeGreaterThan(-1)
    expect(off).toBeLessThan(src.indexOf("invoke<TonightSkyView>('learning:tonight'"))
    expect(src).toMatch(/if \(level === 'off' \|\| !sky\) return null/)
  })
})

describe('Stacking physics and emission lines', () => {
  it('[LRN-018] Given a dual-band filter, When shown, Then its lines read with wavelength and colour', () => {
    expect(toFilterLightView(filterLight('L-eXtreme'))).toEqual({
      filter: 'L-eXtreme',
      kind: 'dual-band',
      passes: 'Two narrow windows, hydrogen alpha at 656.3 nm and O III at 500.7 nm, blocking most light pollution and moonlight between them.',
      lines: [
        { name: 'Hydrogen alpha (Hα)', nm: 656.3, colour: 'deep red', origin: 'hydrogen whose electron drops from the third level to the second', concept: 'h-alpha' },
        { name: 'Oxygen III (O III)', nm: 500.7, colour: 'teal', origin: 'oxygen missing two electrons, in hot, very thin gas', concept: 'oiii' }
      ],
      concept: 'emission-lines'
    })
  })

  it('[LRN-019] Given the Stack and process tab, When learning is on, Then stacking, calibration, filters and the Hubble palette each offer their idea', () => {
    const tab = read('src/renderer/components/target/ProcessTab.tsx')
    expect(tab).toMatch(/title="What another hour buys" action=\{<Explain concept="stacking"/)
    expect(tab).toMatch(/<Explain concept="stacking" label="Why stack\?" \/>/)
    expect(tab).toMatch(/<Explain concept="calibration" label="Calibration frames" \/>/)
    expect(read('src/renderer/components/forecast/IntegrationForecast.tsx')).toMatch(/<FilterLights targetId=\{targetId\} filters=\{view\.filters\.filter\(f => f\.rejection !== null\)\.map\(f => f\.filter\)\} \/>/)
    const lights = read('src/renderer/components/forecast/FilterLights.tsx')
    expect(lights).toMatch(/level === 'deep' && lights\.filter\(l => l\.kind === 'narrowband'\)\.length >= 2/)
    expect(lights).toMatch(/<Explain concept="hubble-palette" \/>/)
    expect(lights).toMatch(/<Explain concept=\{line\.concept\} \/>/)
  })

  it('[LRN-020] Given learning is off, When a target’s process tab opens, Then its filters are not explained', () => {
    const src = read('src/renderer/components/forecast/FilterLights.tsx')
    const off = src.indexOf("if (level === 'off' || filters.length === 0) return")
    expect(off).toBeGreaterThan(-1)
    expect(off).toBeLessThan(src.indexOf("invoke<FilterLightView[]>('learning:filters'"))
    expect(src).toMatch(/if \(level === 'off' \|\| lights\.length === 0\) return null/)
  })
})

describe('Sky geometry and the gallery', () => {
  it('[LRN-021] Given pictures of M42 and M31, When the gallery opens, Then the strip reads nearest first with travel time and when the light set out', () => {
    const stops = lookbackStrip(
      [
        { path: '/i/m31.png', designations: ['M31', 'NGC 224'] },
        { path: '/i/m42.png', designations: ['M42', 'NGC 1976'] }
      ],
      2026
    ).map(toLookbackStopView)
    expect(stops.map(s => s.designation)).toEqual(['M42', 'M31'])
    expect(stops[1]).toEqual({
      designation: 'M31',
      distance: 'about 2.5 million light years',
      travel: '2.5 million years',
      lookback: 'It set out before our species, Homo sapiens, appeared, which was about 300,000 years ago.',
      paths: ['/i/m31.png'],
      sources: ['wiki-messier-object', 'wiki-homo-sapiens']
    })
    const strip = read('src/renderer/components/gallery/LookbackStrip.tsx')
    expect(strip).toMatch(/Its light left \{s\.travel\} ago\./)
    expect(strip).toMatch(/s\.sources\.map\(id => \{\r?\n\s+const src = source\(id\)/)
    expect(strip).toMatch(/onClick=\{\(\) => openSource\(id\)\}/)
    expect(strip).toMatch(/level === 'deep' && <span[^>]*>\{s\.lookback\}/)
    expect(read('src/renderer/pages/Images.tsx')).toMatch(/<LookbackStrip pictures=\{view\.pictures\}/)
  })

  it('[LRN-022] Given the mosaic workspace and the Messier mosaic, When learning is on, Then sky geometry and Messier’s history each offer their idea', () => {
    const workspace = read('src/renderer/pages/MosaicWorkspace.tsx')
    expect(workspace).toMatch(/<Explain concept="tangent-plane"/)
    expect(workspace).toMatch(/<Explain concept="celestial-sphere" label="RA and Dec" \/>/)
    expect(workspace).toMatch(/<Explain concept="position-angle" label="Position angle" \/>/)
    expect(read('src/renderer/pages/MessierMosaic.tsx')).toMatch(/<Explain concept="messier-catalogue" label="Who was Messier\?" \/>/)
    const ids = toLearningLibraryView().concepts.map(c => c.id)
    for (const id of ['celestial-sphere', 'tangent-plane', 'position-angle', 'messier-catalogue']) expect(ids).toContain(id)
  })

  it('[LRN-023] Given learning is off, When the gallery opens, Then its pictures are not ordered by lookback', () => {
    const src = read('src/renderer/components/gallery/LookbackStrip.tsx')
    const off = src.indexOf("if (level === 'off' || named.length === 0) return")
    expect(off).toBeGreaterThan(-1)
    expect(off).toBeLessThan(src.indexOf("invoke<LookbackStopView[]>('learning:lookback'"))
    expect(src).toMatch(/if \(level === 'off' \|\| stops\.length === 0\) return null/)
  })
})

describe('The Learn page and the trail', () => {
  it('[LRN-024] Given the knowledge base, When the Learn page lists it, Then every idea sits under one theme and links to a page of the app where it shows', () => {
    const view = toLearningLibraryView()
    const listed = view.themes.flatMap(t => t.concepts)
    expect([...listed].sort()).toEqual(view.concepts.map(c => c.id).sort())
    expect(view.themes.map(t => t.title)).toEqual(['Distance and time', 'Light and colour', 'How stars live', 'The sky above you', 'Your camera and your data'])
    for (const c of view.concepts) {
      const place = CONCEPT_PLACES[c.id]
      expect(place, c.id).toBeDefined()
      expect(locate(place.to)?.detail, `${c.id} → ${place.to}`).toBe(false)
    }
    expect(Object.keys(CONCEPT_PLACES).sort()).toEqual(view.concepts.map(c => c.id).sort())
    expect(locate('/learn')).toMatchObject({ place: { id: 'insights' }, item: { id: 'learn' }, detail: false })
    const page = read('src/renderer/pages/Learn.tsx')
    expect(page).toMatch(/See it: \{place\.label\}/)
    expect(read('src/renderer/App.tsx')).toMatch(/<Route path="\/learn" element=\{<Learn \/>\} \/>/)
  })

  it('[LRN-025] Given ideas opened one after another, When the trail is kept, Then the latest comes first, each once, no more than the limit, with no counts', () => {
    let trail: string[] = []
    for (const id of ['stacking', 'noise', 'stacking', 'airmass']) trail = withOpened(trail, id)
    expect(trail).toEqual(['airmass', 'stacking', 'noise'])
    const long = Array.from({ length: TRAIL_MAX + 5 }, (_, i) => `c${i}`).reduce<string[]>((t, id) => withOpened(t, id), [])
    expect(long).toHaveLength(TRAIL_MAX)
    expect(long[0]).toBe(`c${TRAIL_MAX + 4}`)
    expect(parseTrail(JSON.stringify(['a', 'b', 'a', 3, null]))).toEqual(['a', 'b'])
    expect(parseTrail('not json')).toEqual([])
    expect(parseTrail('{"a":1}')).toEqual([])
    expect(parseTrail(null)).toEqual([])
    expect(parseTrail(JSON.stringify(Array.from({ length: TRAIL_MAX + 3 }, (_, i) => `x${i}`)))).toHaveLength(TRAIL_MAX)
  })

  it('[LRN-025] Given learning is off, When an idea is opened, Then the trail is not added to; and it is kept in this browser only and can be forgotten', () => {
    const ctx = read('src/renderer/contexts/LearningContext.tsx')
    expect(ctx).toMatch(/if \(level === 'off'\) return\r?\n\s+setTrail/)
    expect(ctx).toMatch(/localStorage\.setItem\(TRAIL_KEY/)
    expect(ctx).toMatch(/localStorage\.removeItem\(TRAIL_KEY\)/)
    expect(ctx).not.toMatch(/invoke\([^)]*trail/i)
    expect(read('src/renderer/components/ui/Explain.tsx')).toMatch(/if \(open && concept\(shown\)\) remember\(shown\)/)
    expect(read('src/renderer/pages/Learn.tsx')).toMatch(/onClick=\{forget\}/)
  })

  it('[LRN-026] Given the command palette, When an idea’s name is typed, Then it offers the idea on the Learn page', () => {
    expect(conceptEntry({ id: 'position-angle', title: 'Position angle' })).toEqual({
      id: 'concept:position-angle',
      label: 'Position angle',
      where: 'Learn',
      to: '/learn?concept=position-angle',
      kind: 'concept',
      icon: 'learn',
      keywords: 'position angle'
    })
    const palette = read('src/renderer/components/common/CommandPalette.tsx')
    expect(palette).toMatch(/library\.concepts\.map\(conceptEntry\)/)
    expect(palette).toMatch(/matchEntries\(\[\.\.\.ENTRIES, \.\.\.concepts,/)
  })
})
