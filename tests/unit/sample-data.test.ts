import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { DEMO_MARKER, DEMO_SITE, demoFiles, demoLoggedNights } from '../../src/main/sample/library'
import {
  SAMPLE_SEEDED_KEY, leaveSample, sampleActive, samplePlaces, seedLibrary, startSample, tidyAfterSample, type SeedInvoke
} from '../../src/main/sample/sample-data'
import { ChannelRouter } from '../../src/main/transport/router'
import { registerSampleHandlers } from '../../src/main/ipc/sample-handlers'
import { SAMPLE_BANNER, SAMPLE_LEAVE_LABEL, SAMPLE_TRY_LABEL, offersSample } from '../../src/shared/sample'
import { jsxElementsOf } from '../helpers/jsx-elements'

const repo = path.resolve(__dirname, '../..')
const read = (rel: string): string => fs.readFileSync(path.join(repo, rel), 'utf8')
const appData = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'astrorepo-sample-'))

/** A fake of the app's channels: records each call and answers as a scan that finishes on the second look. */
function fakeApp(scanEnd: { status: string; error: string | null } = { status: 'done', error: null }, logged: string[] = []) {
  const calls: Array<[string, unknown]> = []
  let looks = 0
  const invoke: SeedInvoke = async <T>(channel: string, args?: unknown): Promise<T> => {
    calls.push([channel, args])
    const answer = (() => {
      if (channel === 'home:scan-start') return { started: true }
      if (channel === 'home:scan-progress') return ++looks < 2 ? { status: 'scanning', error: null, totalTargetsFound: 0 } : { ...scanEnd, totalTargetsFound: 6 }
      if (channel === 'sessions:list') return { total: logged.filter(d => d === (args as { from_date: string }).from_date).length }
      if (channel === 'targets:search') return { targets: ['M31', 'M42', 'M45'].map((f, i) => ({ id: `t${i}`, canonicalName: f.replace('M', 'M '), aliases: [] })) }
      return null
    })()
    return answer as T
  }
  return { invoke, calls }
}

describe('Sample data on first run (spec 046, U5)', () => {
  it('[EUX-014] Given a fresh app, When the sample is started, Then the demo library is built in a sample folder of its own and the next start opens the sample\'s own database', () => {
    const data = appData()
    expect(sampleActive(data)).toBe(false)
    const built = startSample(data)
    const places = samplePlaces(data)
    expect(built).toEqual({ ok: true, files: demoFiles().length })
    expect(sampleActive(data)).toBe(true)
    expect(fs.existsSync(path.join(places.root, DEMO_MARKER))).toBe(true)
    for (const f of demoFiles().filter((_, i) => i % 97 === 0)) expect(fs.existsSync(path.join(places.library, ...f.path.split('/'))), f.path).toBe(true)
    // The sample's database and files sit inside its own folder, apart from the app's own data.
    expect(path.dirname(places.data)).toBe(places.root)
    expect(path.dirname(places.library)).toBe(places.root)
    // Started again, a sample from before is rebuilt rather than refused.
    expect(startSample(data).ok).toBe(true)
    fs.rmSync(data, { recursive: true, force: true })
  })

  it('[EUX-014] Given the sample\'s database, When it is indexed, Then the site and home folder are set, the scan runs to the end and the logged nights go on the targets it found', async () => {
    const { invoke, calls } = fakeApp()
    expect(await seedLibrary(invoke, '/sample/library', { everyMs: 1 })).toEqual({ targets: 6 })
    expect(calls.slice(0, 3)).toEqual([
      ['settings:set', { key: 'home_folder_path', value: '/sample/library' }],
      ['settings:set-site', DEMO_SITE],
      ['home:scan-start', undefined]
    ])
    const nights = calls.filter(([c]) => c === 'sessions:create').map(([, a]) => a as { date: string; target_ids: string[] })
    expect(nights.map(n => n.date)).toEqual(demoLoggedNights().map(n => n.date))
    expect(nights.map(n => n.target_ids)).toEqual([['t0'], ['t1'], ['t2']])
    // The desktop app indexes the sample once, on its first start, through its own router.
    const main = read('src/main/index.ts')
    expect(main.indexOf("app.setPath('userData', samplePlaces(appData).data)")).toBeGreaterThan(-1)
    expect(main.indexOf("app.setPath('userData', samplePlaces(appData).data)")).toBeLessThan(main.indexOf("initDatabase(app.getPath('userData'))"))
    expect(main).toContain(`getSetting(SAMPLE_SEEDED_KEY) === null`)
    expect(SAMPLE_SEEDED_KEY).toBe('sample_seeded')
    // npm run demo builds and indexes the same library the same way.
    expect(read('scripts/demo/demo.ts')).toContain('seedLibrary(invoke, library)')
  })

  it('[EUX-014] Given a seed cut short after some nights were logged, When it runs again, Then the nights already logged are not logged twice', async () => {
    const first = demoLoggedNights()[0].date
    const { invoke, calls } = fakeApp(undefined, [first])
    await seedLibrary(invoke, '/sample/library', { everyMs: 1 })
    const created = calls.filter(([c]) => c === 'sessions:create').map(([, a]) => (a as { date: string }).date)
    expect(created).toEqual(demoLoggedNights().slice(1).map(n => n.date))
    expect(calls.find(([c]) => c === 'sessions:list')?.[1]).toEqual({ target_id: 't0', from_date: first, to_date: first })
  })

  it('[EUX-014] Given a scan that errors or never ends, When the sample is indexed, Then it fails with the reason', async () => {
    await expect(seedLibrary(fakeApp({ status: 'error', error: 'disk gone' }).invoke, '/x', { everyMs: 1 })).rejects.toThrow('ended error: disk gone')
    await expect(seedLibrary(fakeApp().invoke, '/x', { tries: 1, everyMs: 1 })).rejects.toThrow('did not finish')
  })

  it('[EUX-015] Given the sample is on, When any page is shown, Then the layout carries a band saying it is sample data with a way to use your own data', () => {
    const layout = jsxElementsOf('Layout.tsx', read('src/renderer/components/common/Layout.tsx'))
    const banner = layout.find(e => e.tag === 'SampleBanner')
    expect(banner).toBeDefined()
    // Beside the page itself, so every route shows it.
    expect(banner?.ancestors).not.toContain('main')
    expect(layout.find(e => e.tag === 'main')?.attrs.get('id')).toBe('"main"')
    expect(SAMPLE_BANNER).toMatch(/sample data/i)
    expect(SAMPLE_BANNER).toMatch(/nothing here is yours/i)
    const source = read('src/renderer/components/common/SampleBanner.tsx')
    expect(source).toContain('SAMPLE_LEAVE_LABEL')
    expect(source).toContain("switchSample('leave')")
    expect(SAMPLE_LEAVE_LABEL).toBe('Use my own data')
  })

  it('[EUX-016] Given the sample is left, When the app starts on your own data, Then the sample folder is removed, and a folder the app did not make is refused and not touched', () => {
    const data = appData()
    startSample(data)
    const { root } = samplePlaces(data)
    // While the sample is on, its folder is never tidied away.
    expect(tidyAfterSample(data)).toBe(false)
    leaveSample(data)
    expect(sampleActive(data)).toBe(false)
    expect(tidyAfterSample(data)).toBe(true)
    expect(fs.existsSync(root)).toBe(false)
    expect(tidyAfterSample(data)).toBe(false)

    // A folder named like the sample's but not made by the app.
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, 'mine.fit'), 'x')
    expect(tidyAfterSample(data)).toBe(false)
    const refused = startSample(data)
    expect(refused.ok).toBe(false)
    expect(refused.ok ? '' : refused.error).toContain('did not make')
    expect(sampleActive(data)).toBe(false)
    expect(fs.readdirSync(root)).toEqual(['mine.fit'])
    // A mode file that cannot be read is not the sample.
    fs.writeFileSync(samplePlaces(data).modeFile, 'not json')
    expect(sampleActive(data)).toBe(false)
    fs.rmSync(data, { recursive: true, force: true })

    // A switch left on for a sample removed by hand does not stop the app, and is turned off.
    const gone = appData()
    startSample(gone)
    fs.rmSync(samplePlaces(gone).root, { recursive: true, force: true })
    expect(sampleActive(gone)).toBe(false)
    expect(tidyAfterSample(gone)).toBe(false)
    expect(fs.existsSync(samplePlaces(gone).modeFile)).toBe(false)

    // A link at the switch's name is replaced, and the file it pointed at is not written.
    const other = path.join(gone, 'other.txt')
    fs.writeFileSync(other, 'keep')
    let linked = true
    try {
      fs.symlinkSync(other, samplePlaces(gone).modeFile)
    } catch {
      linked = false // Windows without the right to make links
    }
    expect(startSample(gone).ok).toBe(true)
    if (linked) expect(fs.lstatSync(samplePlaces(gone).modeFile).isSymbolicLink()).toBe(false)
    expect(fs.readFileSync(other, 'utf8')).toBe('keep')
    fs.rmSync(gone, { recursive: true, force: true })

    const main = read('src/main/index.ts')
    expect(main).toContain('if (!sample) {')
    expect(main).toContain('tidyAfterSample(appData)')
    // The sample in use is never rebuilt under its own open database.
    expect(main.indexOf("if (sample) return { ok: false")).toBeGreaterThan(-1)
    expect(main.indexOf("if (sample) return { ok: false")).toBeLessThan(main.indexOf('startSample(appData)'))
  })

  it('[EUX-017] Given the desktop app and no home folder, When Get set up is shown, Then the sample is offered; not in a browser, a companion screen or once a folder is chosen', () => {
    expect(offersSample('desktop', false, null)).toBe(true)
    expect(offersSample('desktop', false, '  ')).toBe(true)
    expect(offersSample('desktop', false, 'D:\\Astro')).toBe(false)
    expect(offersSample('desktop', true, null)).toBe(false)
    expect(offersSample('browser', false, null)).toBe(false)
    expect(offersSample('companion', false, null)).toBe(false)
    expect(offersSample(undefined, false, null)).toBe(false)
    const card = read('src/renderer/components/cockpit/SetupCard.tsx')
    expect(card).toContain('offersSample(window.astrorepoMode')
    expect(SAMPLE_TRY_LABEL).toBe('Try it with sample data')
  })

  it('[EUX-017] Given the headless server, When its channels are listed, Then it cannot build the sample or restart; only the desktop app\'s router has the sample channels', async () => {
    for (const f of fs.readdirSync(path.join(repo, 'src/main/ipc/channels'))) expect(read(`src/main/ipc/channels/${f}`), f).not.toContain("'sample:")
    expect(read('src/main/ipc/handlers.ts')).not.toContain("'sample:")
    expect(read('src/main/index.ts')).toContain('registerSampleHandlers(router,')
    const router = new ChannelRouter()
    const asked: string[] = []
    registerSampleHandlers(router, {
      status: () => ({ active: true }),
      start: () => { asked.push('start'); return { ok: true } },
      leave: () => { asked.push('leave'); return { ok: true } }
    })
    expect(router.channels()).toEqual(['sample:status', 'sample:start', 'sample:leave'])
    expect(await router.invoke('sample:status')).toEqual({ active: true })
    await router.invoke('sample:start')
    await router.invoke('sample:leave')
    expect(asked).toEqual(['start', 'leave'])
    // The renderer asks only on the desktop app.
    expect(read('src/renderer/hooks/useSample.ts')).toContain("window.astrorepoMode === 'desktop'")
  })
})
