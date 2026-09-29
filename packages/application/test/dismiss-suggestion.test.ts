import { describe, it, expect } from 'vitest'
import { makeDismissSuggestion, makeListStackingSuggestions } from '@astro/application'
import { FixedClock, InMemoryDismissalStore, InMemoryFrameCatalogue, subs, target } from '@astro/testkit'

function setup() {
  const frames = new InMemoryFrameCatalogue()
    .add(target('M 81', { subs: subs(1440, 10, '2026-03-01T21:00:00Z') }))
    .add(target('M 51', { subs: subs(1080, 10, '2026-03-01T21:00:00Z') }))
  const dismissals = new InMemoryDismissalStore()
  const clock = new FixedClock(new Date('2026-09-29T20:00:00Z'))
  return {
    frames,
    dismissals,
    list: makeListStackingSuggestions({ frames, dismissals }),
    dismiss: makeDismissSuggestion({ frames, dismissals, clock })
  }
}

describe('DismissSuggestion', () => {
  it('[DSC-008] Given a suggestion, When the user dismisses it, Then it is hidden and the others remain', async () => {
    const { list, dismiss, dismissals } = setup()
    expect(await dismiss('ready-to-stack:target-m-81')).toEqual({ dismissed: true })
    expect((await list()).map(s => s.targetName)).toEqual(['M 51'])
    expect((await dismissals.listDismissals())[0].dismissedAt.toISOString()).toBe('2026-09-29T20:00:00.000Z')
  })

  it('[DSC-008] Given a dismissed suggestion, When the target gets new subs, Then the suggestion comes back', async () => {
    const { list, dismiss, frames } = setup()
    await dismiss('ready-to-stack:target-m-81')
    frames.add(target('M 81', { subs: [...subs(1440, 10, '2026-03-01T21:00:00Z'), ...subs(360, 10, '2026-03-09T21:00:00Z')] }))
    expect((await list()).map(s => s.targetName)).toEqual(['M 81', 'M 51'])
  })

  it('[DSC-008] Given an id that matches no live suggestion, When dismissed, Then nothing is stored', async () => {
    const { dismiss, dismissals } = setup()
    expect(await dismiss('ready-to-stack:target-nope')).toEqual({ dismissed: false })
    expect(await dismissals.listDismissals()).toEqual([])
  })

  it('[DSC-008] Given a custom policy, When dismissing, Then suggestions are matched under that policy', async () => {
    const frames = new InMemoryFrameCatalogue().add(target('M 1', { subs: subs(10, 10, '2026-03-01T21:00:00Z') }))
    const dismissals = new InMemoryDismissalStore()
    const dismiss = makeDismissSuggestion({ frames, dismissals, clock: new FixedClock() }, { readyToStackSec: 60, restackSec: 60 })
    expect(await dismiss('ready-to-stack:target-m-1')).toEqual({ dismissed: true })
  })
})
