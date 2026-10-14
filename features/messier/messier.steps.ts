import { expect } from 'vitest'
import { MessierRefusedError, makeListNextActions, makeMessierMosaic, type MessierMosaic, type MessierTile } from '@astro/application'
import type { NextAction } from '@astro/domain'
import { FakeEphemeris, FakeTilePictures, FixedClock, InMemoryFrameCatalogue, InMemoryMessierCatalogue, InMemoryPlanningSettings, messierObject, stackAt, subs, target } from '@astro/testkit'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'
import { targetName } from '../support/words'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TONIGHT = '2026-09-29'

class Mosaic {
  readonly messier = new InMemoryMessierCatalogue()
  readonly frames = new InMemoryFrameCatalogue()
  readonly pictures = new FakeTilePictures()
  readonly settings = new InMemoryPlanningSettings()
  readonly ephemeris = new FakeEphemeris()
  readonly clock = new FixedClock()
  readonly service = makeMessierMosaic({ messier: this.messier, frames: this.frames, pictures: this.pictures, settings: this.settings, ephemeris: this.ephemeris, clock: this.clock })
  result: MessierMosaic | null = null
  drawn: string | null = null
  refused: unknown = null
  actions: NextAction[] = []
}

const numberOf = (name: string) => Number(name.replace(/\D/g, ''))
const targetIdOf = (name: string) => `target-m-${numberOf(name)}`
const tileOf = (w: Mosaic, name: string): MessierTile => {
  const t = w.result?.tiles.find(x => x.number === numberOf(name))
  if (!t) throw new Error(`${name} is not on the mosaic`)
  return t
}
const at = (iso: string) => new Date(iso)

export const messierSteps = defineSteps(() => new Mosaic(), ({ Given, When, Then, defineParameterType }) => {
  defineParameterType(targetName)

  Given('my site is London', w => { w.settings.setSite({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }) })
  Given('no observing site is set', w => { w.settings.setSite(null) })
  Given('I have no dual-band or narrowband filter', w => { w.settings.setNarrowband(false) })
  Given('it is {int}:{int} UTC on {int} {word} {int}', (w, h: number, m: number, day: number, month: string, year: number) => {
    w.clock.set(new Date(Date.UTC(year, MONTHS.indexOf(month), day, h, m)).toISOString())
  })
  Given('tonight the moon is up and {int}% lit', (w, lit: number) => {
    w.ephemeris.setMoon(TONIGHT, { altitudeDeg: 35, illumination: lit / 100, raHours: 10, decDeg: 10 })
  })

  Given('the Messier catalogue holds:', (w, table: DataTable) => {
    for (const row of table.hashes()) {
      const n = Number(row.number)
      w.messier.add(messierObject(n, { targetId: `target-m-${n}`, name: row.name, objectType: row.type.trim(), raHours: Number(row['RA hours']), decDeg: Number(row.Dec) }))
    }
  })

  Given('{target} has a finished JPEG {string} and a colour master {string}', (w, name: string, jpeg: string, master: string) => {
    w.messier.picture(
      targetIdOf(name),
      { path: `/images/${jpeg}`, kind: 'finished', colour: null, modifiedAt: at('2026-03-01T00:00:00Z') },
      { path: `/fits/${master}`, kind: 'master', colour: true, modifiedAt: at('2026-02-01T00:00:00Z') }
    )
    w.pictures.add(`/images/${jpeg}`, { width: 3000, height: 2000 }).add(`/fits/${master}`, { width: 1000, height: 1000 })
    w.frames.add(target(name, { subs: subs(48, 300, '2026-09-01T21:00:00Z'), stacks: [stackAt('2026-09-02T10:00:00Z')], finalCount: 1 }))
  })
  Given('{target} has {int} hours of lights and a mono master {string}', (w, name: string, hours: number, master: string) => {
    w.messier.picture(targetIdOf(name), { path: `/fits/${master}`, kind: 'master', colour: false, modifiedAt: at('2026-08-02T00:00:00Z') })
    w.pictures.add(`/fits/${master}`, { width: 800, height: 800 })
    w.frames.add(target(name, { subs: subs(hours * 12, 300, '2026-08-01T21:00:00Z'), stacks: [stackAt('2026-08-02T10:00:00Z')] }))
  })
  Given('{target} has {int} minutes of lights', (w, name: string, minutes: number) => {
    w.frames.add(target(name, { subs: subs(minutes / 5, 300, '2026-09-25T01:00:00Z') }))
  })
  Given('{string} cannot be decoded', (w, name: string) => { w.pictures.failures.set(`/images/${name}`, 'The image could not be decoded here.') })

  When('I open the Messier mosaic', async w => { w.result = await w.service.mosaic() })
  When('the pictures of {target} and {target} are drawn', async (w, a: string, b: string) => {
    await w.service.picture(numberOf(a))
    await w.service.picture(numberOf(b))
  })
  When('the picture of {target} is drawn', async (w, name: string) => {
    const drawn = await w.service.picture(numberOf(name))
    w.drawn = drawn?.ok ? drawn.name : null
  })
  When('Home works out the next actions', async w => {
    const noPlan = async () => ({ status: 'no-site' as const })
    w.actions = await makeListNextActions({ listStackingSuggestions: async () => [], planForward: noPlan, listMessierGaps: () => w.service.gapsTonight(3) })()
  })
  When('the window asks for the picture of Messier {int}', async (w, n: number) => {
    w.refused = await w.service.picture(n).then(() => null, (error: unknown) => error)
  })

  Then('the tiles run {target}, {target}, {target}, {target}, {target}, {target}', (w, ...names: string[]) => {
    expect(w.result?.tiles.map(t => t.number)).toEqual(names.map(numberOf))
  })
  Then('{target} is imaged and shows {string}', (w, name: string, picture: string) => {
    expect(tileOf(w, name)).toMatchObject({ state: 'imaged', picture: { name: picture, kind: 'finished' } })
  })
  Then('{target} is stacked and shows {string}', (w, name: string, picture: string) => {
    expect(tileOf(w, name)).toMatchObject({ state: 'stacked', picture: { name: picture, kind: 'master' } })
  })
  Then('{target} is captured with no picture', (w, name: string) => {
    expect(tileOf(w, name)).toMatchObject({ state: 'captured', picture: null })
  })
  Then('{target} is not captured', (w, name: string) => { expect(tileOf(w, name).state).toBe('gap') })
  Then('the counts are {int} imaged, {int} stacked, {int} captured and {int} not captured of {int}', (w, imaged: number, stacked: number, captured: number, gaps: number, total: number) => {
    expect(w.result?.summary).toMatchObject({ imaged, stacked, captured, gaps, total })
  })
  Then('{string} is drawn as it is', (w, name: string) => {
    expect(w.pictures.asked.find(a => a.path.endsWith(name))?.stretch).toBe(false)
  })
  Then('{string} is drawn stretched', (w, name: string) => {
    expect(w.pictures.asked.find(a => a.path.endsWith(name))?.stretch).toBe(true)
  })
  Then('the tile shows {string}', (w, name: string) => { expect(w.drawn).toBe(name) })
  Then('{target} is up tonight', (w, name: string) => { expect(tileOf(w, name).outlook?.kind).toBe('tonight') })
  Then('{target} is up tonight with its season closing within {int} days', (w, name: string, days: number) => {
    const o = tileOf(w, name).outlook
    expect(o?.kind).toBe('tonight')
    expect(o?.kind === 'tonight' ? o.closesInDays : null).toBeLessThanOrEqual(days)
  })
  Then('{target} is in season from a later month', (w, name: string) => { expect(tileOf(w, name).outlook?.kind).toBe('later') })
  Then('{target} is never high enough from my site', (w, name: string) => { expect(tileOf(w, name).outlook).toEqual({ kind: 'never' }) })
  Then('{target} is held back by the moon tonight', (w, name: string) => { expect(tileOf(w, name).outlook?.kind).toBe('moon') })
  Then('no tile says when it is up', w => { expect(w.result?.tiles.every(t => t.outlook === null)).toBe(true) })
  Then('the next actions name the Messier gaps {target}, {target} and {target}', (w, ...names: string[]) => {
    expect(w.actions.map(a => (a.kind === 'messier-gap' ? a.number : a.kind))).toEqual(names.map(numberOf))
  })
  Then('no captured object is named as a Messier gap', async w => {
    const captured = new Set((await w.frames.listTargetFrames()).map(t => t.targetId))
    const named = w.actions.flatMap(a => (a.kind === 'messier-gap' ? [a.targetId] : []))
    expect(named.length).toBeGreaterThan(0)
    for (const id of named) expect(captured.has(id)).toBe(false)
  })
  Then('it is refused and no file is read', w => {
    expect(w.refused).toBeInstanceOf(MessierRefusedError)
    expect(w.pictures.asked).toEqual([])
  })
})
