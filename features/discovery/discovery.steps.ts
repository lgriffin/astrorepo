import { expect } from 'vitest'
import {
  makeDiscoverTargets, makeDismissSuggestion, makeListNextActions, makeListStackingSuggestions, makePlanForward,
  type DiscoveryOverview, type PlanForward
} from '@astro/application'
import type { NextAction, StackingSuggestion, TargetFrames } from '@astro/domain'
import {
  FakeEphemeris, FixedClock, InMemoryDismissalStore, InMemoryFrameCatalogue, InMemoryPlanningSettings, InMemoryTargetPositions,
  stackAt, subs, target
} from '@astro/testkit'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'
import { hoursMinutes, targetName } from '../support/words'

class Cockpit {
  readonly targets = new Map<string, TargetFrames>()
  readonly frames = new InMemoryFrameCatalogue()
  readonly dismissals = new InMemoryDismissalStore()
  readonly clock = new FixedClock(new Date('2026-04-12T12:00:00Z'))
  settings = new InMemoryPlanningSettings({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 })
  planForward: PlanForward | null = null
  suggestions: StackingSuggestion[] = []
  overview: DiscoveryOverview | null = null
  actions: NextAction[] = []
  planErrors: unknown[] = []
  dismissed: boolean | null = null

  /** The target as the index would now report it, created on first mention. */
  update(name: string, change: (t: TargetFrames) => void): void {
    const t = this.targets.get(name) ?? target(name)
    change(t)
    this.targets.set(name, t)
    this.frames.add(t)
  }

  readonly list = makeListStackingSuggestions({ frames: this.frames, dismissals: this.dismissals })
  readonly dismiss = makeDismissSuggestion({ frames: this.frames, dismissals: this.dismissals, clock: this.clock })

  async open(): Promise<void> {
    this.suggestions = await this.list()
    this.overview = await makeDiscoverTargets({ frames: this.frames })()
  }

  suggestionFor(name: string): StackingSuggestion | undefined {
    return this.suggestions.find(s => s.targetName === name)
  }
}

const shoot = (w: Cockpit, count: number, exposure: number, name: string, from: string) =>
  w.update(name, t => t.subs.push(...subs(count, exposure, from)))

export const discoverySteps = defineSteps(() => new Cockpit(), ({ Given, When, Then, defineParameterType }) => {
  defineParameterType(targetName)

  Given('I shot {int} subs of {int} seconds of {target} from {string}', (w, n: number, sec: number, name: string, from: string) =>
    shoot(w, n, sec, name, from))

  Given('I have shot:', (w, table: DataTable) => {
    for (const row of table.hashes()) shoot(w, Number(row.subs), Number(row.exposure), row.target, row.from)
  })

  Given('Siril wrote a stack of {target} on {string}', (w, name: string, at: string) =>
    w.update(name, t => t.stacks.push(stackAt(at))))

  Given(
    '{target} has a goal of {int} hours, {int} subs of 10 seconds, {int} stacks, {int} processed and {int} finished images',
    (w, name: string, goal: number, n: number, stacks: number, processed: number, finished: number) =>
      w.update(name, t => {
        t.goalSec = goal > 0 ? goal * 3600 : null
        t.subs = subs(n, 10, '2026-03-01T21:00:00Z')
        t.stacks = Array.from({ length: stacks }, () => stackAt('2026-04-01T09:00:00Z'))
        t.processedCount = processed
        t.finalCount = finished
      })
  )

  Given('no observing site is set', w => { w.settings = new InMemoryPlanningSettings(null) })
  Given('the forward plan fails with {string}', (w, message: string) => {
    w.planForward = () => Promise.reject(new Error(message))
  })

  When('I open the cockpit', w => w.open())

  When('I dismiss the suggestion to stack {target}', async (w, name: string) => {
    w.dismissed = (await w.dismiss(`ready-to-stack:${target(name).targetId}`)).dismissed
    await w.open()
  })

  When('I look at next actions', async w => {
    const planForward = w.planForward ?? makePlanForward({
      frames: w.frames,
      positions: new InMemoryTargetPositions(),
      settings: w.settings,
      ephemeris: new FakeEphemeris(),
      clock: w.clock
    })
    w.actions = await makeListNextActions({ listStackingSuggestions: w.list, planForward, onPlanError: e => w.planErrors.push(e) })()
  })

  Then('it suggests stacking {target}: {int} h {int} m from {int} subs over {int} nights',
    (w, name: string, h: number, m: number, n: number, nights: number) => {
      const s = w.suggestionFor(name)
      expect(s).toMatchObject({ kind: 'ready-to-stack', integrationSec: h * 3600 + m * 60, subCount: n, nights })
    })
  Then('it suggests stacking {target}: {int} h from {int} subs over {int} night', (w, name: string, h: number, n: number, nights: number) => {
    expect(w.suggestionFor(name)).toMatchObject({ kind: 'ready-to-stack', integrationSec: h * 3600, subCount: n, nights })
  })

  Then('it suggests restacking {target} with {int} h {int} m added since that stack', (w, name: string, h: number, m: number) => {
    const s = w.suggestionFor(name)
    expect(s?.kind).toBe('restack')
    expect(s?.kind === 'restack' && hoursMinutes(s.addedSec)).toBe(`${h} h ${m} m`)
  })

  Then('it does not suggest anything for {target}', (w, name: string) => {
    expect(w.suggestionFor(name)).toBeUndefined()
  })

  Then('the suggestions are in this order: {}', async (w, names: string) => {
    await w.open()
    expect(w.suggestions.map(s => s.targetName)).toEqual(names.split(', '))
  })

  Then('nothing was set aside', async w => {
    expect(w.dismissed).toBe(false)
    expect(await w.dismissals.listDismissals()).toEqual([])
  })

  Then('{target} is shown as {string}', (w, name: string, state: string) => {
    expect(w.overview?.targets.find(t => t.targetName === name)?.progress).toBe(state)
  })

  Then('next actions are: {}', (w, expected: string) => {
    const described = w.actions.map(a => (a.kind === 'stack' ? `stack ${a.suggestion.targetName}` : a.kind === 'capture' ? `shoot ${a.targetName}` : a.kind))
    expect(described.join(', ')).toBe(expected)
  })

  Then('no planning failure is recorded', w => { expect(w.planErrors).toEqual([]) })
  Then('the planning failure {string} is recorded', (w, message: string) => {
    expect(w.planErrors.map(e => (e as Error).message)).toEqual([message])
  })
})
