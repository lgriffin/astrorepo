import { describe, it, expect } from 'vitest'
import { CompanionRefusedError, makeCompanion } from '@astro/application'
import { FakeCompanionSecrets, FixedClock, InMemoryCompanionStore } from '@astro/testkit'

const PLACES = { home: '/dashboard', sky: '/sky-planner', jobs: '/jobs', images: '/images', messier: '/messier' }

function setup(codes: string[] = []) {
  const devices = new InMemoryCompanionStore()
  const clock = new FixedClock(new Date('2026-10-15T21:00:00Z'))
  const companion = makeCompanion({ devices, secrets: new FakeCompanionSecrets(codes), clock, places: PLACES })
  return { devices, clock, companion }
}

async function paired(s: ReturnType<typeof setup>, name = 'Pi by the scope') {
  const started = await s.companion.requestPairing(name)
  const device = await s.companion.approvePairing(started.code)
  const status = await s.companion.pairingStatus(started.requestId)
  if (status.state !== 'paired') throw new Error('not paired')
  return { device, key: status.key }
}

describe('Companion pairing (specs/035-pi-variant)', () => {
  it('[PI-018] Given a screen asks to pair, When it is answered, Then it gets a code that lasts five minutes and is told it is waiting', async () => {
    const s = setup(['482913'])
    const started = await s.companion.requestPairing('  Pi by the scope ')
    expect(started).toEqual({ requestId: 'secret-1', code: '482913', expiresAt: new Date('2026-10-15T21:05:00Z') })
    expect(await s.companion.pairingStatus('secret-1')).toEqual({ state: 'waiting', expiresAt: new Date('2026-10-15T21:05:00Z') })
  })

  it('[PI-018] Given a waiting screen, When its code is typed on the PC, Then it is paired following the PC, only the key hash is kept, and the key is handed over until the pickup time ends', async () => {
    const s = setup(['482913'])
    const started = await s.companion.requestPairing('  Pi by the scope ')
    const device = await s.companion.approvePairing('482 913')
    expect(device).toEqual({ id: 'secret-3', name: 'Pi by the scope', screen: 'follow', pairedAt: new Date('2026-10-15T21:00:00Z'), lastSeenAt: null })
    expect(await s.devices.listCompanions()).toEqual([{ ...device, keyHash: 'hash:secret-2' }])
    expect(await s.companion.pairingStatus(started.requestId)).toEqual({ state: 'paired', key: 'secret-2', name: 'Pi by the scope' })
    // A screen that lost the answer (its storage refused it, a poll failed) can ask again.
    expect(await s.companion.pairingStatus(started.requestId)).toEqual({ state: 'paired', key: 'secret-2', name: 'Pi by the scope' })
    s.clock.advance(5 * 60_000)
    expect(await s.companion.pairingStatus(started.requestId)).toEqual({ state: 'expired' })
    expect(await s.devices.listCompanions()).toHaveLength(1)
  })

  it('[PI-018] Given a code typed just before it expires, When the screen asks after the code\'s expiry, Then it still gets its key', async () => {
    const s = setup(['482913'])
    const started = await s.companion.requestPairing('Pi')
    s.clock.advance(5 * 60_000 - 1)
    await s.companion.approvePairing('482913')
    s.clock.advance(2_000)
    expect(await s.companion.pairingStatus(started.requestId)).toMatchObject({ state: 'paired' })
  })

  it('[PI-019] Given a pairing the screen never collected, When its pickup time runs out, Then the screen is unpaired again so it holds no place', async () => {
    const s = setup(['482913'])
    const started = await s.companion.requestPairing('Pi')
    await s.companion.approvePairing('482913')
    expect(await s.devices.listCompanions()).toHaveLength(1)
    s.clock.advance(5 * 60_000)
    expect(await s.companion.pairingStatus(started.requestId)).toEqual({ state: 'expired' })
    expect(await s.devices.listCompanions()).toEqual([])
  })

  it('[PI-019] Given one code, When it is typed twice at once on the PC, Then the screen is paired once and the second is refused', async () => {
    const s = setup(['482913'])
    await s.companion.requestPairing('Pi')
    const both = await Promise.allSettled([s.companion.approvePairing('482913'), s.companion.approvePairing('482913')])
    expect(both.map(r => r.status)).toEqual(['fulfilled', 'rejected'])
    expect(await s.devices.listCompanions()).toHaveLength(1)
  })

  it('[PI-019] Given a screen that asks again, When it asks, Then its earlier request is replaced and never fills the waiting places', async () => {
    const s = setup()
    for (let i = 0; i < 10; i++) await s.companion.requestPairing('Pi', '192.168.1.40')
    for (let i = 0; i < 4; i++) await s.companion.requestPairing(`Other ${i}`, `192.168.1.${50 + i}`)
    await expect(s.companion.requestPairing('Tablet', '192.168.1.60')).rejects.toThrow('Too many screens are waiting to pair.')
    await expect(s.companion.approvePairing('100000')).rejects.toThrow('No screen is showing that code.')
    await expect(s.companion.approvePairing('100009')).resolves.toMatchObject({ name: 'Pi' })
  })

  it('[PI-018] Given a code already shown on another screen, When a new screen asks, Then it gets a different code', async () => {
    const s = setup(['111111', '111111', '222222'])
    await s.companion.requestPairing('First')
    expect((await s.companion.requestPairing('Second')).code).toBe('222222')
  })

  it('[PI-019] Given a screen asks with an unusable name, When it is answered, Then it is refused with what to do', async () => {
    const s = setup()
    await expect(s.companion.requestPairing(' ')).rejects.toThrow(new CompanionRefusedError('Give the screen a name, such as "Pi by the scope".'))
  })

  it('[PI-019] Given five screens already waiting, When a sixth asks, Then it is refused until one expires', async () => {
    const s = setup()
    for (let i = 0; i < 5; i++) await s.companion.requestPairing(`Screen ${i}`)
    await expect(s.companion.requestPairing('Sixth')).rejects.toThrow('Too many screens are waiting to pair. Try again in a few minutes.')
    s.clock.advance(5 * 60_000)
    await expect(s.companion.requestPairing('Sixth')).resolves.toMatchObject({ code: '100005' })
  })

  it('[PI-019] Given a screen that was approved but has not collected its key, When others ask, Then it does not count as waiting', async () => {
    const s = setup()
    for (let i = 0; i < 5; i++) await s.companion.requestPairing(`Screen ${i}`)
    await s.companion.approvePairing('100000')
    await expect(s.companion.requestPairing('Sixth')).resolves.toMatchObject({ code: '100005' })
  })

  it('[PI-019] Given a typed code, When it is not six digits or no screen shows it, Then nothing is paired and the PC says what to do', async () => {
    const s = setup(['482913'])
    await s.companion.requestPairing('Pi')
    await expect(s.companion.approvePairing('48291')).rejects.toThrow('A pairing code has six digits, as the screen shows it.')
    await expect(s.companion.approvePairing('999999')).rejects.toThrow('No screen is showing that code. Check it, or have the screen show a new one.')
    expect(await s.devices.listCompanions()).toEqual([])
  })

  it('[PI-019] Given a code that has expired or was already used, When it is typed, Then nothing more is paired', async () => {
    const s = setup(['482913', '777777'])
    const late = await s.companion.requestPairing('Pi')
    s.clock.advance(5 * 60_000)
    await expect(s.companion.approvePairing('482913')).rejects.toThrow('No screen is showing that code.')
    expect(await s.companion.pairingStatus(late.requestId)).toEqual({ state: 'expired' })
    await s.companion.requestPairing('Tablet')
    await s.companion.approvePairing('777777')
    await expect(s.companion.approvePairing('777777')).rejects.toThrow('No screen is showing that code.')
    expect(await s.devices.listCompanions()).toHaveLength(1)
  })

  it('[PI-019] Given eight screens paired, When a ninth code is typed, Then it is refused until one is removed', async () => {
    const s = setup()
    for (let i = 0; i < 8; i++) await paired(s, `Screen ${i}`)
    const ninth = await s.companion.requestPairing('Ninth')
    await expect(s.companion.approvePairing(ninth.code)).rejects.toThrow('This PC already has 8 screens paired. Remove one first.')
    const [first] = await s.companion.listCompanions()
    await s.companion.removeCompanion(first.id)
    await expect(s.companion.approvePairing(ninth.code)).resolves.toMatchObject({ name: 'Ninth' })
  })

  it('[PI-020] Given a paired screen, When its key is checked, Then it is known until removed, and an empty or unknown key is not', async () => {
    const s = setup()
    const { device, key } = await paired(s)
    expect(await s.companion.authenticate(key)).toMatchObject({ id: device.id, name: 'Pi by the scope' })
    expect(await s.companion.authenticate('')).toBeNull()
    expect(await s.companion.authenticate('guess')).toBeNull()
    await s.companion.removeCompanion(device.id)
    expect(await s.companion.authenticate(key)).toBeNull()
    await expect(s.companion.removeCompanion(device.id)).rejects.toThrow('That screen is no longer paired.')
  })

  it('[PI-023] Given a paired screen that calls every few seconds, When its key is checked, Then its last-seen time is written once a minute', async () => {
    const s = setup()
    const { key } = await paired(s)
    expect((await s.companion.authenticate(key))?.lastSeenAt).toEqual(new Date('2026-10-15T21:00:00Z'))
    s.clock.advance(30_000)
    expect((await s.companion.authenticate(key))?.lastSeenAt).toEqual(new Date('2026-10-15T21:00:00Z'))
    s.clock.advance(30_000)
    expect((await s.companion.authenticate(key))?.lastSeenAt).toEqual(new Date('2026-10-15T21:01:00Z'))
    expect((await s.companion.listCompanions())[0].lastSeenAt).toEqual(new Date('2026-10-15T21:01:00Z'))
  })

  it('[PI-021] Given a screen following the PC, When the PC moves between pages, Then it shows the PC page and stays put while the PC is in Settings', async () => {
    const s = setup()
    const { device } = await paired(s)
    expect(await s.companion.screenFor(device.id)).toEqual({ screen: 'follow', route: '/dashboard' })
    s.companion.reportPcRoute('/settings')
    expect(await s.companion.screenFor(device.id)).toEqual({ screen: 'follow', route: '/dashboard' })
    s.companion.reportPcRoute('/targets/m31')
    expect(await s.companion.screenFor(device.id)).toEqual({ screen: 'follow', route: '/targets/m31' })
    s.companion.reportPcRoute('/settings')
    expect(await s.companion.screenFor(device.id)).toEqual({ screen: 'follow', route: '/targets/m31' })
  })

  it('[PI-021] Given a screen set to a place, When it asks where to be, Then it shows that place whatever the PC shows', async () => {
    const s = setup()
    const { device } = await paired(s)
    s.companion.reportPcRoute('/targets/m31')
    for (const [screen, route] of Object.entries(PLACES)) {
      await s.companion.setScreen(device.id, screen)
      expect(await s.companion.screenFor(device.id)).toEqual({ screen, route })
    }
  })

  it('[PI-021] Given a screen choice, When it is not one of the six or the screen is gone, Then it is refused', async () => {
    const s = setup()
    const { device } = await paired(s)
    await expect(s.companion.setScreen(device.id, 'settings')).rejects.toThrow('A screen shows one of: follow, home, sky, jobs, images, messier, not "settings".')
    await expect(s.companion.setScreen('gone', 'jobs')).rejects.toThrow('That screen is no longer paired.')
    await expect(s.companion.screenFor('gone')).rejects.toThrow('That screen is no longer paired.')
  })
})
