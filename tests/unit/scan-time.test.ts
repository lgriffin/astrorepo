import { describe, it, expect } from 'vitest'
import { timeLeftText } from '../../src/shared/scan-time'

describe('time left in words', () => {
  it('[ING-016] Given seconds left, When shown on the Library page, Then they read as rounded minutes and hours', () => {
    expect(timeLeftText(20)).toBe('less than a minute left')
    expect(timeLeftText(65)).toBe('about 1 minute left')
    expect(timeLeftText(170)).toBe('about 3 minutes left')
    expect(timeLeftText(3600)).toBe('about 1 hour left')
    expect(timeLeftText(3660)).toBe('about 1 hour 1 minute left')
    expect(timeLeftText(2 * 3600 + 25 * 60)).toBe('about 2 hours 25 minutes left')
  })

  it('[ING-016] Given no estimate yet, or one that is not a number, When shown, Then nothing is said', () => {
    expect(timeLeftText(null)).toBeNull()
    expect(timeLeftText(Number.NaN)).toBeNull()
    expect(timeLeftText(-5)).toBeNull()
  })
})
