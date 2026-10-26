import { expect } from 'vitest'
import { makeCreateProject, makeDescribeProject, makeUpdateProject, type ProjectDescription, type ProjectResult } from '@astro/application'
import type { CompletionRule, TargetFrames } from '@astro/domain'
import { FixedClock, InMemoryFrameCatalogue, InMemoryMosaicWorkspaceStore, InMemoryProjectSources, InMemoryProjectStore } from '@astro/testkit'
import { defineSteps } from '@astro/testkit/bdd'

const idOf = (name: string) => name.toLowerCase().replace(/\s+/g, '')

class Projects {
  readonly store = new InMemoryProjectStore()
  sources = new InMemoryProjectSources()
  readonly frames = new InMemoryFrameCatalogue()
  readonly clock = new FixedClock(new Date('2026-10-26T20:00:00Z'))
  readonly held = new Map<string, TargetFrames>()
  projectId = ''
  result: ProjectResult | null = null
  description: ProjectDescription | null = null

  get deps() {
    const workspaces = new InMemoryMosaicWorkspaceStore()
    return { store: this.store, sources: this.sources, frames: this.frames, workspaces, coverage: async () => null, clock: this.clock }
  }

  async start(name: string, kind: 'catalogue' | 'custom' | 'target-depth', rule: CompletionRule, targets: string[] = []) {
    this.result = await makeCreateProject(this.deps)({ name, kind, rule, catalogueId: kind === 'catalogue' ? 'messier' : null, targetIds: targets.map(idOf) })
    if (this.result.ok) this.projectId = this.result.project.id
  }

  /** Adds light, a stack or an image to what the index holds for a target. */
  gain(name: string, change: { hours?: number; filter?: string; stack?: boolean; image?: boolean }) {
    const id = idOf(name)
    const t = this.held.get(id) ?? { targetId: id, targetName: name, subs: [], stacks: [], goalSec: null, filterGoals: [], processedCount: 0, finalCount: 0 }
    if (change.hours) t.subs.push({ exposureSec: change.hours * 3600, capturedAt: null, filter: change.filter ?? 'L', scope: null, rejected: false })
    if (change.stack) t.stacks.push({ producedAt: new Date('2026-10-02T00:00:00Z') })
    if (change.image) t.finalCount += 1
    this.held.set(id, t)
    this.frames.add(t)
  }

  task(name: string) {
    return this.description?.progress.tasks.find(t => t.label === name)
  }
}

const rule = (over: Partial<CompletionRule>): CompletionRule => ({ integration: { kind: 'none' }, coverage: false, stacked: false, processed: false, published: false, ...over })
const names = (list: string) => [...list.matchAll(/"([^"]+)"/g)].map(m => m[1])

export const projectSteps = defineSteps(() => new Projects(), ({ Given, When, Then }) => {
  Given('the Messier catalogue holds {string}, {string} and {string}', (w, a: string, b: string, c: string) => {
    const targets = [a, b, c]
    w.sources = new InMemoryProjectSources(new Map(targets.map(t => [idOf(t), t])), [{ id: 'messier', name: 'Messier', targetIds: targets.map(idOf) }])
  })

  When('I start a catalogue campaign {string} asking for a finished image', (w, name: string) => w.start(name, 'catalogue', rule({ published: true })))

  Given('I started a personal collection {string} of {string} asking for {int} h of {string} and a finished image', (w, name: string, target: string, hours: number, filter: string) =>
    w.start(name, 'custom', rule({ integration: { kind: 'per filter', goals: [{ filter, seconds: hours * 3600 }] }, published: true }), [target])
  )

  Given('I started a personal collection {string} of {string} and {string} asking for a finished image', (w, name: string, a: string, b: string) => w.start(name, 'custom', rule({ published: true }), [a, b]))

  Given('I started a personal collection {string} of {string} asking for a finished image', (w, name: string, target: string) => w.start(name, 'custom', rule({ published: true }), [target]))

  Given('{string} has {int} h of usable {string} light', (w, target: string, hours: number, filter: string) => w.gain(target, { hours, filter }))
  Given('{string} has a stack', (w, target: string) => w.gain(target, { stack: true }))
  When('{string} gains {int} h of usable {string} light and a finished image', (w, target: string, hours: number, filter: string) => w.gain(target, { hours, filter, image: true }))

  When('the project is worked out', async w => {
    w.description = await makeDescribeProject(w.deps)(w.projectId)
  })

  When('I pause it and the project is worked out', async w => {
    await makeUpdateProject(w.deps)(w.projectId, { status: 'paused' })
    w.description = await makeDescribeProject(w.deps)(w.projectId)
  })

  When('I try to start a target depth project {string} of {string} and {string}', (w, name: string, a: string, b: string) => w.start(name, 'target-depth', rule({ processed: true }), [a, b]))

  Then('the project has {int} targets and {int} of {int} are done', async (w, count: number, done: number, total: number) => {
    w.description = await makeDescribeProject(w.deps)(w.projectId)
    expect(w.description?.project.targetIds).toHaveLength(count)
    expect([w.description?.progress.done, w.description?.progress.total]).toEqual([done, total])
  })

  Then('the next step for {string} is {string}', (w, target: string, step: string) => expect(w.task(target)?.next?.text).toBe(step))

  Then('{string} has integration not met and published not met', (w, target: string) => {
    expect(w.task(target)?.parts.integration?.met).toBe(false)
    expect(w.task(target)?.parts.published?.met).toBe(false)
  })

  Then('{string} is done and {int} of {int} are done', (w, target: string, done: number, total: number) => {
    expect(w.task(target)?.done).toBe(true)
    expect([w.description?.progress.done, w.description?.progress.total]).toEqual([done, total])
  })

  Then('the next steps are {string} then {string}', (w, first: string, second: string) => expect(w.description?.next.map(n => n.text)).toEqual(names(`"${first}" "${second}"`)))

  Then('it is refused because {string}', (w, problem: string) => expect(w.result).toEqual({ ok: false, problems: [problem] }))

  Then('there are no next steps', w => expect(w.description?.next).toEqual([]))
})
