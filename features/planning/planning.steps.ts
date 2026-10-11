import { expect } from 'vitest'
import { makePlanForward, type ForwardPlan } from '@astro/application'
import {
  FakeEphemeris, FixedClock, InMemoryFrameCatalogue, InMemoryPlanningSettings, InMemoryTargetPositions, subs, target
} from '@astro/testkit'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'
import { targetName } from '../support/words'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TONIGHT = '2026-09-29'

class Planner {
  readonly frames = new InMemoryFrameCatalogue()
  readonly positions = new InMemoryTargetPositions()
  readonly settings = new InMemoryPlanningSettings()
  readonly ephemeris = new FakeEphemeris()
  readonly clock = new FixedClock()
  result: ForwardPlan | null = null
}

type Plan = Extract<ForwardPlan, { status: 'ok' }>
const ok = (w: Planner): Plan => {
  if (w.result?.status !== 'ok') throw new Error(`No plan was made: ${w.result?.status}`)
  return w.result
}
const names = (items: { targetName: string }[]) => items.map(i => i.targetName)

export const planningSteps = defineSteps(() => new Planner(), ({ Given, When, Then, defineParameterType }) => {
  defineParameterType(targetName)

  Given('my site is London', w => { w.settings.setSite({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }) })
  Given('no observing site is set', w => { w.settings.setSite(null) })
  Given('I have a dual-band filter', w => { w.settings.setNarrowband(true) })
  Given('I have no dual-band or narrowband filter', w => { w.settings.setNarrowband(false) })

  Given('these targets have work left:', (w, table: DataTable) => {
    for (const row of table.hashes()) {
      const t = target(row.target, {
        subs: subs(Number(row['subs of 5 min']), 300, row['first night']),
        goalSec: row['goal hours'] ? Number(row['goal hours']) * 3600 : null
      })
      w.frames.add(t)
      w.positions.add({ targetId: t.targetId, raHours: Number(row['RA hours']), decDeg: Number(row.Dec), objectType: row.type })
    }
  })
  Given('{target} is already past its {int} hour goal', (w, name: string, hours: number) => {
    const t = target(name, { subs: subs(hours * 12 + 1, 300, '2026-09-10T21:00:00Z'), goalSec: hours * 3600 })
    w.frames.add(t)
    w.positions.add({ targetId: t.targetId, raHours: 3.79, decDeg: 24.12, objectType: 'open_cluster' })
  })
  Given('the new moons fall at {string}, {string} and {string}', (w, ...instants: string[]) => { w.ephemeris.setNewMoons(instants) })
  Given('it is {int}:{int} UTC on {int} {word} {int}', (w, h: number, m: number, day: number, month: string, year: number) => {
    w.clock.set(new Date(Date.UTC(year, MONTHS.indexOf(month), day, h, m)).toISOString())
  })
  Given('tonight the moon is up and {int}% lit', (w, lit: number) => {
    w.ephemeris.setMoon(TONIGHT, { altitudeDeg: 35, illumination: lit / 100, raHours: 2.9, decDeg: 21 })
  })
  Given('tonight the sun only gets 12° below the horizon', w => { w.ephemeris.nauticalOnly(TONIGHT) })
  Given('tonight the sun never gets 12° below the horizon', w => { w.ephemeris.noDarkness(TONIGHT) })

  When('I open the plan', async w => {
    w.result = await makePlanForward({ frames: w.frames, positions: w.positions, settings: w.settings, ephemeris: w.ephemeris, clock: w.clock })()
  })

  Then('it asks me to set my site', w => { expect(w.result).toEqual({ status: 'no-site' }) })
  Then("no night's sky was worked out", w => { expect(w.ephemeris.nightsRequested).toEqual([]) })
  Then('tonight is the night of {word}', (w, night: string) => { expect(ok(w).tonight?.night).toBe(night) })
  Then("tonight's list holds {target}, {target} and {target}, most usable hours first", (w, ...expected: string[]) => {
    const choices = ok(w).tonight?.choices ?? []
    expect(names(choices).sort()).toEqual(expected)
    const hours = choices.map(c => c.usableHours)
    expect([...hours].sort((a, b) => b - a)).toEqual(hours)
  })
  Then("{target} is not on tonight's list", (w, name: string) => { expect(names(ok(w).tonight?.choices ?? [])).not.toContain(name) })
  Then("tonight's list is only {target}", (w, name: string) => {
    expect(names(ok(w).tonight?.choices ?? [])).toEqual([name])
    expect(ok(w).tonight?.noFilterForBrightMoon).toBe(false)
  })
  Then("tonight's list is empty", w => { expect(ok(w).tonight?.choices).toEqual([]) })
  Then('the plan says a narrowband filter is missing for the bright moon', w => { expect(ok(w).tonight?.noFilterForBrightMoon).toBe(true) })
  Then("only {target}'s season is closing, within {int} days", (w, name: string, days: number) => {
    const closing = ok(w).closing
    expect(names(closing)).toEqual([name])
    expect(closing[0].daysLeft).toBeLessThanOrEqual(days)
    expect(closing[0].hoursTonight).toBeGreaterThanOrEqual(1)
  })
  Then('the dark windows are:', (w, table: DataTable) => {
    expect(ok(w).windows.map(x => [x.newMoon, x.start, x.end])).toEqual(table.rows())
    for (const window of ok(w).windows) expect(window.bestTargets.length).toBeLessThanOrEqual(3)
  })
  Then('the best target in the December window is {target}', (w, name: string) => {
    expect(ok(w).windows.find(x => x.newMoon.startsWith('2026-12'))?.bestTargets[0].targetName).toBe(name)
  })
  Then("tonight's darkness is {string}", (w, darkness: string) => { expect(ok(w).tonight?.darkness).toBe(darkness) })
  Then('there is no plan for tonight', w => { expect(ok(w).tonight).toBeNull() })
  Then('the seasons are shown for {target}, {target} and {target}', (w, ...expected: string[]) => {
    expect(names(ok(w).seasons)).toEqual(expected)
  })
})
