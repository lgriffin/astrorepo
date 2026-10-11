import { expect } from 'vitest'
import {
  makeDescribeTargetGeometry, makePlanMosaic, makePreferredSolver, makeQueueSolves,
  type MosaicPlanResult, type QueueSolves, type TargetGeometry
} from '@astro/application'
import {
  FakeEphemeris, FakePlateSolver, FakeToolHub, FixedClock, InMemoryJobStore, InMemoryMosaicStore, InMemoryPlanningSettings,
  InMemorySolveStore, skyFile, solvedField
} from '@astro/testkit'
import { defineSteps } from '@astro/testkit/bdd'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const idOf = (name: string) => name.toLowerCase().replace(/\s+/g, '-')

class Sky {
  readonly store = new InMemorySolveStore()
  readonly mosaics = new InMemoryMosaicStore()
  readonly jobs = new InMemoryJobStore()
  readonly clock = new FixedClock(new Date('2026-10-09T15:00:00Z'))
  readonly settings = new InMemoryPlanningSettings()
  readonly ephemeris = new FakeEphemeris()
  tools = new FakeToolHub()
  queued: Awaited<ReturnType<QueueSolves>> | null = null
  geometry: TargetGeometry | null = null
  mosaic: MosaicPlanResult | null = null

  queue(targetId: string) {
    return makeQueueSolves({
      store: this.store,
      mosaics: this.mosaics,
      preferred: makePreferredSolver({ tools: this.tools, solvers: [new FakePlateSolver('astap'), new FakePlateSolver('siril')] }),
      jobs: this.jobs,
      clock: this.clock,
      workDir: id => `D:/work/solve/${id}`
    })(targetId)
  }

  lightOn(name: string, day: number, month: string, year: number, over: Parameters<typeof skyFile>[0] | object = {}) {
    const night = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return skyFile({ path: `D:/astro/${name}/${night}/Light_001.fit`, targetId: idOf(name), capturedAt: new Date(`${night}T21:00:00Z`), ...over })
  }

  async solveAs(path: string, raDeg: number, decDeg: number, rotationDeg = 0) {
    await this.store.save({ path, field: solvedField(raDeg, decDeg, { rotationDeg }), source: 'astap', solvedAt: this.clock.now(), error: null })
  }
}

const ok = (w: Sky) => {
  if (w.mosaic?.status !== 'ok') throw new Error(`The mosaic was not planned: ${w.mosaic?.status}`)
  return w.mosaic
}

export const skySteps = defineSteps(() => new Sky(), ({ Given, When, Then, defineParameterType }) => {
  defineParameterType({ name: 'name', regexp: /"[^"]*"|(?:M|NGC|IC) ?\d+/, transform: (s: string) => s.replace(/^"|"$/g, '') })

  Given('the catalogue has {name} at RA {float}° Dec {float}°, {int} arcmin across, with a {int} hour goal',
    (w, name: string, ra: number, dec: number, size: number, goal: number) => {
      w.mosaics.addTarget({ id: idOf(name), name, raHours: ra / 15, decDeg: dec, sizeArcmin: size, goalSec: goal * 3600 })
    })
  Given('the catalogue has {name} with no position', (w, name: string) => { w.mosaics.addTarget({ id: idOf(name), name }) })
  Given('my site is London', w => { w.settings.setSite({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }) })
  Given('no observing site is set', w => { w.settings.setSite(null) })
  Given('ASTAP and Siril are installed', w => { w.tools = new FakeToolHub().installAll() })
  Given('no plate solver is installed', w => { w.tools = new FakeToolHub() })

  Given('{name} has lights from the nights of {int} and {int} {word} {int} and a stacked master',
    (w, name: string, a: number, b: number, month: string, year: number) => {
      w.store.add(
        w.lightOn(name, a, month, year),
        w.lightOn(name, b, month, year),
        skyFile({ path: `D:/astro/${name}/stack.fit`, targetId: idOf(name), kind: 'master', capturedAt: null })
      )
    })
  Given("{name}'s only light already carries a WCS centred at RA {float}° Dec {float}°", (w, name: string, ra: number, dec: number) => {
    w.store.add(w.lightOn(name, 1, 'October', 2026, { wcs: { CRVAL1: ra, CRVAL2: dec, CDELT1: -0.000664, CDELT2: 0.000664 } }))
  })
  Given("{name}'s lights from {int} nights solved at RA {float}° Dec {float}°", async (w, name: string, nights: number, ra: number, dec: number) => {
    for (let day = 1; day <= nights; day++) {
      const light = w.lightOn(name, day, 'October', 2026)
      w.store.add(light)
      await w.solveAs(light.path, ra, dec)
    }
  })
  Given("{name}'s light from {int} {word} {int} solved with rotation {float}°",
    async (w, name: string, day: number, month: string, year: number, rotation: number) => {
      const light = w.lightOn(name, day, month, year)
      w.store.add(light)
      await w.solveAs(light.path, 10.68, 41.27, rotation)
    })

  When('I ask to plate solve {name}', async (w, name: string) => { w.queued = await w.queue(idOf(name)) })
  When("I open {name}'s sky page", async (w, name: string) => {
    w.geometry = await makeDescribeTargetGeometry({ store: w.store, mosaics: w.mosaics })(idOf(name))
  })
  const plan = (w: Sky, name: string, field?: { widthDeg: number; heightDeg: number }) =>
    makePlanMosaic({ store: w.store, mosaics: w.mosaics, settings: w.settings, ephemeris: w.ephemeris, clock: w.clock }, 10)({ targetId: idOf(name), field, rotationDeg: 0 })
  When('I plan a mosaic of {name} with a {float}° by {float}° field', async (w, name: string, widthDeg: number, heightDeg: number) => {
    w.mosaic = await plan(w, name, { widthDeg, heightDeg })
  })
  When('I plan a mosaic of {name} without choosing equipment', async (w, name: string) => { w.mosaic = await plan(w, name) })

  Then('one job is queued in Jobs: {string}', async (w, title: string) => {
    expect(await w.jobs.list()).toHaveLength(1)
    expect(w.queued?.job).toMatchObject({ kind: 'solve', title, state: 'queued' })
  })
  Then('nothing is queued', async w => {
    expect(w.queued?.job).toBeNull()
    expect(await w.jobs.list()).toEqual([])
  })
  Then('it says {string}', (w, message: string) => { expect(w.queued?.message).toBe(message) })
  Then("each file is solved near {name}'s catalogue position", async (w, name: string) => {
    const target = await w.mosaics.target(idOf(name))
    const hints = w.queued?.job?.solve?.files.map(f => f.hint) ?? []
    expect(hints).toHaveLength(3)
    for (const hint of hints) expect(hint).toEqual({ raDeg: expect.closeTo((target?.raHours ?? 0) * 15, 6), decDeg: target?.decDeg })
  })
  Then('the light is placed at RA {float}° from its headers', (w, ra: number) => {
    const [stored] = w.store.stored.values()
    expect(stored).toMatchObject({ source: 'header', error: null, field: { raDeg: ra } })
  })
  Then('it warns that {int} of {int} solved files point far from {name}', (w, far: number, of: number) => {
    expect(w.geometry?.misfiled).toMatchObject({ far, of })
  })
  Then('it does not warn about misfiling', w => { expect(w.geometry?.misfiled).toBeNull() })
  Then('the rotation is {float}° on {word} and {float}° on {word}, a spread of {float}°',
    (w, r1: number, n1: string, r2: number, n2: string, spread: number) => {
      expect(w.geometry?.rotation).toEqual({ nights: [{ night: n1, rotationDeg: r1 }, { night: n2, rotationDeg: r2 }], spreadDeg: spread })
    })
  Then('the plan has {int} columns and {int} rows', (w, columns: number, rows: number) => {
    expect(ok(w).plan).toMatchObject({ columns, rows, fitsOneField: false })
    expect(ok(w).tiles).toHaveLength(columns * rows)
  })
  Then('tile {int} has nothing yet and needs {int} hours', (w, tile: number, hours: number) => {
    expect(ok(w).tiles[tile - 1]).toEqual({ tile, capturedSec: 0, lightCount: 0, neededSec: hours * 3600 })
  })
  Then('the next {int} nights are marked, starting {word}', (w, count: number, first: string) => {
    expect(ok(w).nights).toHaveLength(count)
    expect(ok(w).nights?.[0].night).toBe(first)
  })
  Then('no nights are marked', w => { expect(ok(w).nights).toBeNull() })
  Then('the planner says {string}', (w, status: string) => { expect(w.mosaic?.status).toBe(status) })
})
