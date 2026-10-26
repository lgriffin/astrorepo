import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { projectNextActions, projectProgress, targetTask, type CompletionRule, type TargetEvidence } from '@astro/domain'
import { propertyParams } from './arbitraries'

const FILTERS = ['L', 'Ha', 'OIII', 'No filter']
const light = fc.array(fc.record({ filter: fc.constantFrom(...FILTERS), seconds: fc.integer({ min: 0, max: 20_000 }) }), { maxLength: 4 })
const rules = fc.record({
  integration: fc.oneof(
    fc.constant({ kind: 'none' as const }),
    fc.constant({ kind: 'target goals' as const }),
    fc.record({ kind: fc.constant('per filter' as const), goals: fc.uniqueArray(fc.record({ filter: fc.constantFrom(...FILTERS), seconds: fc.integer({ min: 1, max: 20_000 }) }), { minLength: 1, maxLength: 3, selector: g => g.filter }) })
  ),
  coverage: fc.constant(false),
  stacked: fc.boolean(),
  processed: fc.boolean(),
  published: fc.boolean()
}) as fc.Arbitrary<CompletionRule>
const evidence = fc.record({
  targetId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 8 }),
  acquired: light,
  usable: light,
  stacks: fc.nat(3),
  processed: fc.nat(3),
  published: fc.nat(3),
  goals: fc.uniqueArray(fc.record({ filter: fc.constantFrom(...FILTERS), seconds: fc.integer({ min: 1, max: 20_000 }) }), { maxLength: 3, selector: g => g.filter })
}) as fc.Arbitrary<TargetEvidence>

describe('project properties', () => {
  it('[AP-003] Given any targets and rule, When tallied, Then done never exceeds the total, each part met never exceeds its count, and only unfinished tasks have a step', () => {
    fc.assert(
      fc.property(rules, fc.array(evidence, { maxLength: 6 }), (rule, targets) => {
        const tasks = targets.map(t => targetTask(t, rule))
        const p = projectProgress(tasks)
        expect(p.done).toBeLessThanOrEqual(p.total)
        for (const part of p.parts) expect(part.met).toBeLessThanOrEqual(part.of)
        for (const t of tasks) expect(t.done).toBe(t.next === null)
        expect(projectNextActions(tasks)).toHaveLength(tasks.filter(t => !t.done).length)
      }),
      propertyParams()
    )
  })

  it('[AP-002] Given a target, When more usable light, a stack, a processed file or an image is added, Then no part it had met becomes unmet', () => {
    fc.assert(
      fc.property(rules, evidence, light, fc.nat(2), (rule, target, more, extra) => {
        const before = targetTask(target, rule)
        const after = targetTask({ ...target, usable: [...target.usable, ...more], stacks: target.stacks + extra, processed: target.processed + extra, published: target.published + extra }, rule)
        for (const [part, state] of Object.entries(before.parts)) if (state?.met) expect(after.parts[part as keyof typeof after.parts]?.met).toBe(true)
        if (before.done) expect(after.done).toBe(true)
      }),
      propertyParams()
    )
  })
})
