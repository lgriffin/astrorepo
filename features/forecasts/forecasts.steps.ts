import { expect } from 'vitest'
import { makeDescribeIntegration, makeFrameGrading, type TargetIntegration } from '@astro/application'
import { FakeFrameMeasurer, FixedClock, FixedGradeLimits, InMemoryFrameGradeStore, InMemoryIntegrationGoalSource } from '@astro/testkit'
import { defineSteps } from '@astro/testkit/bdd'
import { formatDuration } from '../../src/main/adapters/job-presenter'

const idOf = (name: string) => name.toLowerCase().replace(/\s+/g, '')

class Forecasts {
  readonly store = new InMemoryFrameGradeStore()
  readonly grading = makeFrameGrading({ store: this.store, measurer: new FakeFrameMeasurer(), limits: new FixedGradeLimits(), clock: new FixedClock(new Date('2026-10-26T20:00:00Z')) })
  readonly goals: { targetId: string; filter: string; seconds: number }[] = []
  readonly kept = new Map<string, string[]>()
  integration: TargetIntegration | null = null
  private n = 0

  add(target: string, count: number, seconds: number, filter: string, rejected: boolean) {
    for (let i = 0; i < count; i++) {
      const fileId = `f${++this.n}`
      this.store.add(idOf(target), { fileId, path: `D:/${idOf(target)}/L${this.n}.fit`, capturedAt: new Date('2026-10-01T22:00:00Z'), filter, exposureSec: seconds, measurement: null, override: rejected ? 'reject' : null })
      if (!rejected) this.kept.set(filter, [...(this.kept.get(filter) ?? []), fileId])
    }
  }

  async describe(target: string, minutes?: number) {
    this.integration = await makeDescribeIntegration({ grading: this.grading, goals: new InMemoryIntegrationGoalSource(this.goals) })(idOf(target), minutes ? [minutes] : undefined)
  }

  filter(name: string) {
    const f = this.integration?.filters.find(x => x.summary.filter === name)
    if (!f) throw new Error(`no filter ${name}`)
    return f
  }
}

export const forecastSteps = defineSteps(() => new Forecasts(), ({ Given, When, Then }) => {
  Given('{string} has {int} kept and {int} rejected lights of {int} s in {string}', (w, target: string, kept: number, rejected: number, seconds: number, filter: string) => {
    w.add(target, kept, seconds, filter, false)
    w.add(target, rejected, seconds, filter, true)
  })
  Given('{string} has {int} rejected lights of {int} s in {string}', (w, target: string, count: number, seconds: number, filter: string) => w.add(target, count, seconds, filter, true))
  Given('{string} has {int} kept lights of {int} s in {string}', (w, target: string, count: number, seconds: number, filter: string) => w.add(target, count, seconds, filter, false))
  Given('the goal for {string} in {string} is {int} h', (w, target: string, filter: string, hours: number) => {
    w.goals.push({ targetId: idOf(target), filter, seconds: hours * 3600 })
  })

  When('the integration of {string} is described', (w, target: string) => w.describe(target))
  When('the integration of {string} is described for {int} minutes', (w, target: string, minutes: number) => w.describe(target, minutes))
  When('I reject one more {string} light by hand', async (w, filter: string) => {
    const [first] = w.kept.get(filter) ?? []
    await w.grading.setOverride(first, 'reject')
  })

  Then('{string} has {int} h acquired and {int} min accepted', (w, filter: string, hours: number, minutes: number) => {
    const s = w.filter(filter).summary
    expect([s.acquiredSec, s.acceptedSec]).toEqual([hours * 3600, minutes * 60])
  })
  Then('{string} is forecast {string} with an expected {int} min accepted', (w, filter: string, kind: string, minutes: number) => {
    const [f] = w.filter(filter).forecasts
    expect(f.kind).toBe(kind)
    expect(f.expectedAcceptedSec).toBeCloseTo(minutes * 60)
  })
  Then('the forecast says new capture is accepted at {string}', (w, rate: string) => {
    expect(w.integration?.filters[0].forecasts[0].assumptions).toContain(`New capture is accepted at the rate so far: ${rate}.`)
  })
  Then('{string} is forecast {string} with no number', (w, filter: string, kind: string) => {
    expect(w.filter(filter).forecasts[0]).toMatchObject({ kind, snrGain: null, range: null })
  })
  Then('{string} still needs {string} of accepted light', (w, filter: string, need: string) => {
    expect(formatDuration(w.filter(filter).toGoal?.needSec ?? 0)).toBe(need)
  })
  Then('the best filter for the next hour is {string}', (w, filter: string) => {
    expect(w.integration?.best[0].id).toBe(filter)
  })
})
