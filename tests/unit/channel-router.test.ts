import { describe, expect, it } from 'vitest'
import { ChannelRouter } from '../../src/main/transport/router'

describe('The channel router (specs/035-pi-variant)', () => {
  it('[PI-001] Given a channel on the router, When it is invoked, Then its handler gets the arguments as sent and its answer comes back', async () => {
    const router = new ChannelRouter()
    router.handle('targets:search', (...args: unknown[]) => ({ got: args }))
    await expect(router.invoke('targets:search', { query: 'M31' }, 2)).resolves.toEqual({ got: [{ query: 'M31' }, 2] })
  })

  it('[PI-001] Given several channels, When the router lists them, Then they come in the order they were added', () => {
    const router = new ChannelRouter()
    router.handle('b', () => null)
    router.handle('a', () => null)
    expect(router.channels()).toEqual(['b', 'a'])
    expect(router.has('a')).toBe(true)
    expect(router.has('c')).toBe(false)
  })

  it('[PI-001] Given a handler that throws, When it is invoked, Then the invocation rejects with that error', async () => {
    const router = new ChannelRouter()
    router.handle('boom', () => { throw new Error('broken') })
    await expect(router.invoke('boom')).rejects.toThrow('broken')
  })

  it('[PI-002] Given no handler for a channel, When it is invoked, Then it is refused with an error naming the channel', async () => {
    const router = new ChannelRouter()
    let ran = false
    router.handle('known', () => { ran = true })
    await expect(router.invoke('unknown:channel')).rejects.toThrow('No handler for the channel "unknown:channel".')
    expect(ran).toBe(false)
  })

  it('[PI-003] Given a channel already handled, When it is added again, Then it is refused with its name and the first handler stays', async () => {
    const router = new ChannelRouter()
    router.handle('jobs:list', () => 'first')
    expect(() => router.handle('jobs:list', () => 'second')).toThrow('The channel "jobs:list" is already handled.')
    await expect(router.invoke('jobs:list')).resolves.toBe('first')
    expect(router.channels()).toEqual(['jobs:list'])
  })
})
