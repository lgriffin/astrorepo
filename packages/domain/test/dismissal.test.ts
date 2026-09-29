import { describe, it, expect } from 'vitest'
import { isDismissed } from '@astro/domain'

describe('isDismissed', () => {
  const d = { suggestionId: 'ready-to-stack:t', targetId: 't', fingerprint: 'a', dismissedAt: new Date('2026-09-29T20:00:00Z') }

  it('[DSC-008] Given a dismissal made while the data looked the same, When checked, Then the suggestion stays hidden', () => {
    expect(isDismissed(d, 'a')).toBe(true)
  })

  it('[DSC-008] Given the data changed since the dismissal, or no dismissal, When checked, Then the suggestion shows again', () => {
    expect(isDismissed(d, 'b')).toBe(false)
    expect(isDismissed(undefined, 'a')).toBe(false)
  })
})
