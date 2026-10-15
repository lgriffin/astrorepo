import { describe, it, expect } from 'vitest'
import {
  COMPANION_SCREENS,
  companionMayCall,
  companionNameProblem,
  formatPairingCode,
  isCompanionScreen,
  LAST_SEEN_STEP_MS,
  pairingExpired,
  readPairingCode,
  shareablePcRoute,
  shouldMarkSeen
} from '@astro/domain'

describe('Companion screens: the rules (specs/035-pi-variant)', () => {
  it('[PI-019] Given what a person typed, When it is read as a pairing code, Then six digits with spaces or dashes count and anything else does not', () => {
    expect(readPairingCode('123456')).toBe('123456')
    expect(readPairingCode(' 123 456 ')).toBe('123456')
    expect(readPairingCode('123-456')).toBe('123456')
    expect(readPairingCode('012345')).toBe('012345')
    expect(readPairingCode('12345')).toBeNull()
    expect(readPairingCode('1234567')).toBeNull()
    expect(readPairingCode('12a456')).toBeNull()
    expect(readPairingCode('')).toBeNull()
    expect(readPairingCode('x123456')).toBeNull()
    expect(readPairingCode('123456x')).toBeNull()
  })

  it('[PI-018] Given a code, When it is shown on the companion, Then it reads as two groups of three', () => {
    expect(formatPairingCode('012345')).toBe('012 345')
  })

  it('[PI-019] Given a name for a screen, When it is checked, Then an empty, overlong or control-character name is refused with what to do', () => {
    expect(companionNameProblem('Pi by the scope')).toBeNull()
    expect(companionNameProblem('  Pi  ')).toBeNull()
    expect(companionNameProblem('x'.repeat(40))).toBeNull()
    expect(companionNameProblem('   ')).toBe('Give the screen a name, such as "Pi by the scope".')
    expect(companionNameProblem('x'.repeat(41))).toBe("A screen's name has at most 40 characters.")
    expect(companionNameProblem('Pi\nscope')).toBe("A screen's name cannot hold control characters.")
    expect(companionNameProblem('Pi\u007f')).toBe("A screen's name cannot hold control characters.")
    expect(companionNameProblem('\u001fPi')).toBe("A screen's name cannot hold control characters.")
  })

  it('[PI-019] Given a waiting pairing, When the time is checked, Then it expires at its expiry time and not before', () => {
    const expiresAt = new Date('2026-10-15T21:05:00Z')
    expect(pairingExpired(expiresAt, new Date('2026-10-15T21:04:59.999Z'))).toBe(false)
    expect(pairingExpired(expiresAt, new Date('2026-10-15T21:05:00Z'))).toBe(true)
  })

  it('[PI-023] Given when a companion was last seen, When it calls again, Then the time is written only once a minute has passed', () => {
    const seen = new Date('2026-10-15T21:00:00Z')
    expect(shouldMarkSeen(null, seen)).toBe(true)
    expect(shouldMarkSeen(seen, new Date(seen.getTime() + LAST_SEEN_STEP_MS - 1))).toBe(false)
    expect(shouldMarkSeen(seen, new Date(seen.getTime() + LAST_SEEN_STEP_MS))).toBe(true)
  })

  it('[PI-021] Given the page the PC is on, When a companion would follow it, Then app pages are shared and Settings or foreign addresses are not', () => {
    expect(shareablePcRoute('/jobs')).toBe('/jobs')
    expect(shareablePcRoute('/targets/abc?tab=process')).toBe('/targets/abc?tab=process')
    expect(shareablePcRoute('/settings-history')).toBe('/settings-history')
    expect(shareablePcRoute('/settings')).toBeNull()
    expect(shareablePcRoute('/settings/tools')).toBeNull()
    expect(shareablePcRoute('/settings?section=companions')).toBeNull()
    expect(shareablePcRoute('/settings#tools')).toBeNull()
    expect(shareablePcRoute('//evil.example')).toBeNull()
    expect(shareablePcRoute('https://evil.example')).toBeNull()
    expect(shareablePcRoute(`/${'a'.repeat(299)}`)).toBe(`/${'a'.repeat(299)}`)
    expect(shareablePcRoute(`/${'a'.repeat(300)}`)).toBeNull()
  })

  it('[PI-021] Given a value, When it is checked as a screen choice, Then only follow and the five places count', () => {
    expect(COMPANION_SCREENS).toEqual(['follow', 'home', 'sky', 'jobs', 'images', 'messier'])
    for (const screen of COMPANION_SCREENS) expect(isCompanionScreen(screen)).toBe(true)
    expect(isCompanionScreen('settings')).toBe(false)
    expect(isCompanionScreen(3)).toBe(false)
  })

  it('[PI-022] Given a paired companion, When it calls a channel, Then companion channels, companion settings and wiping the library are refused and everything else is allowed', () => {
    expect(companionMayCall('targets:search', [{ query: 'M31' }])).toBe(true)
    expect(companionMayCall('jobs:run-now', [])).toBe(true)
    expect(companionMayCall('companion:approve', [{ code: '123456' }])).toBe(false)
    expect(companionMayCall('db:reset', [])).toBe(false)
    expect(companionMayCall('companion:report-route', [{ route: '/jobs' }])).toBe(false)
    expect(companionMayCall('settings:set', [{ key: 'companion_enabled', value: 'false' }])).toBe(false)
    expect(companionMayCall('settings:get', [{ key: 'companion_port' }])).toBe(false)
    expect(companionMayCall('settings:set', [{ key: 'home_folder', value: '/x' }])).toBe(true)
    expect(companionMayCall('settings:get', [])).toBe(true)
    expect(companionMayCall('settings:get', [null])).toBe(true)
    expect(companionMayCall('settings:list', [{ key: 'companion_port' }])).toBe(true)
  })
})
