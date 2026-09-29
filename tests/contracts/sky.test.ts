import { afterEach, describe, expect, it } from 'vitest'
import { FakeEphemeris, gmstHours, InMemoryPlanningSettings, InMemoryTargetPositions } from '@astro/testkit'
import { ephemerisContract, planningSettingsContract, targetPositionsContract } from '@astro/testkit/contracts/sky.contract'
import { AstronomyEngineEphemeris } from '../../src/main/adapters/astronomy-engine-ephemeris'
import { NARROWBAND_KEY, SITE_KEYS, SqlitePlanningSettings, SqliteTargetPositions } from '../../src/main/adapters/sqlite-planning'
import { setupTestDb, seedTarget, teardownTestDb } from '../helpers/setup'

const NEW_MOONS = ['2026-10-10T15:50:36Z', '2026-11-09T07:02:42Z', '2026-12-09T00:52:31Z', '2027-01-07T20:25:05Z']

ephemerisContract('fake', () => new FakeEphemeris().setNewMoons(NEW_MOONS))
ephemerisContract('astronomy-engine', () => new AstronomyEngineEphemeris())

planningSettingsContract('in-memory', seed => new InMemoryPlanningSettings(seed.site ?? null, seed.narrowband ?? true))
targetPositionsContract('in-memory', seed => {
  const positions = new InMemoryTargetPositions()
  seed.forEach(p => positions.add(p))
  return positions
})

afterEach(() => teardownTestDb())

planningSettingsContract('SQLite', seed => {
  const db = setupTestDb()
  const set = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
  if (seed.site) {
    set.run(SITE_KEYS.latitude, String(seed.site.latitudeDeg))
    set.run(SITE_KEYS.longitude, String(seed.site.longitudeDeg))
    set.run(SITE_KEYS.elevation, String(seed.site.elevationM))
  }
  if (seed.narrowband !== undefined && seed.narrowband !== null) set.run(NARROWBAND_KEY, String(seed.narrowband))
  return new SqlitePlanningSettings(db)
})

targetPositionsContract('SQLite', seed => {
  const db = setupTestDb()
  for (const p of seed) seedTarget(db, { id: p.targetId, canonicalName: p.targetId, raHours: p.raHours, decDegrees: p.decDeg, objectType: p.objectType })
  seedTarget(db, { id: 'target-no-coordinates', canonicalName: 'Custom' })
  return new SqliteTargetPositions(db)
})

describe('SQLite planning settings', () => {
  it('[FWD-007] Given a latitude out of range or a blank longitude, When the site is read, Then it is treated as not set', async () => {
    const db = setupTestDb()
    const set = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    set.run(SITE_KEYS.latitude, '95')
    set.run(SITE_KEYS.longitude, '0')
    expect(await new SqlitePlanningSettings(db).site()).toBeNull()
    set.run(SITE_KEYS.latitude, '51.5')
    set.run(SITE_KEYS.longitude, '  ')
    expect(await new SqlitePlanningSettings(db).site()).toBeNull()
  })

  it('[FWD-007] Given a site with no elevation, When it is read, Then elevation is zero', async () => {
    const db = setupTestDb()
    const set = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    set.run(SITE_KEYS.latitude, '51.5')
    set.run(SITE_KEYS.longitude, '-0.13')
    expect(await new SqlitePlanningSettings(db).site()).toEqual({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 0 })
  })
})

describe('astronomy-engine ephemeris', () => {
  const eph = new AstronomyEngineEphemeris()

  it('[FWD-008] Given midsummer in London, When the night is read, Then it falls back to nautical darkness', async () => {
    const sky = await eph.nightSky({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 0 }, '2026-06-21')
    expect(sky?.darkness).toBe('nautical')
  })

  it('[FWD-008] Given midsummer at 65°N, When the night is read, Then there is no dark window', async () => {
    expect(await eph.nightSky({ latitudeDeg: 65, longitudeDeg: 20, elevationM: 0 }, '2026-06-21')).toBeNull()
  })

  it('[FWD-008] Given polar night at 88°N, When the night is read, Then it is astronomically dark from local noon to noon', async () => {
    const sky = await eph.nightSky({ latitudeDeg: 88, longitudeDeg: 0, elevationM: 0 }, '2026-12-21')
    expect(sky?.darkness).toBe('astronomical')
    expect(sky?.darkStart.toISOString()).toBe('2026-12-21T12:00:00.000Z')
    expect(sky?.darkEnd.toISOString()).toBe('2026-12-22T12:00:00.000Z')
    expect(sky?.samples).toHaveLength(48)
  })

  it('[FWD-008] Given a winter night at 80°N where the sun reaches -12° but not -18° at noon, When the night is read, Then darkness runs to dawn, never past the next noon', async () => {
    const sky = await eph.nightSky({ latitudeDeg: 80, longitudeDeg: 15, elevationM: 0 }, '2026-12-01')
    expect(sky).not.toBeNull()
    if (!sky) return
    expect(sky.darkEnd.getTime() - sky.darkStart.getTime()).toBeLessThanOrEqual(24 * 3600 * 1000)
    expect(sky.darkEnd.getTime()).toBeGreaterThan(sky.darkStart.getTime())
  })

  it('[FWD-006] Given a southern site east of Greenwich, When a night is read, Then the window starts that local evening', async () => {
    const sky = await eph.nightSky({ latitudeDeg: -33.9, longitudeDeg: 151.2, elevationM: 0 }, '2026-06-21')
    // Sydney is UTC+10: astronomical dusk about 18:20 local on 21 June, dawn about 05:30 on the 22nd.
    expect(sky?.darkStart.toISOString().slice(0, 13)).toBe('2026-06-21T08')
    expect(sky?.darkEnd.toISOString().slice(0, 13)).toBe('2026-06-21T19')
  })

  it('[FWD-006] Given the same moment, When sidereal time is read from the ephemeris and the fake, Then they agree to a minute', async () => {
    const site = { latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 0 }
    const sky = await eph.nightSky(site, '2026-09-29')
    const first = sky?.samples[0]
    expect(first).toBeDefined()
    if (!first) return
    const fake = (((gmstHours(first.at) + site.longitudeDeg / 15) % 24) + 24) % 24
    expect(Math.abs(fake - first.lstHours)).toBeLessThan(1 / 60)
  })
})
