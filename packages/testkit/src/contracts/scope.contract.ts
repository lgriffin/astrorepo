import { describe, it, expect } from 'vitest'
import { CopyCancelledError, ScopeUnreachableError, type LandingArea, type ScopeFiles } from '@astro/application'

export interface ScopeFilesFixture {
  scope: ScopeFiles
  host: string
  port: number
  /** An address where nothing answers. */
  nowhere: { host: string; port: number }
  /** Puts a file on the scope, by its absolute path. */
  put: (remote: string, content: string) => void
  /** Adds an empty folder on the scope. */
  folder: (remote: string) => void
  /** Where on the PC a test's downloads go, by name (folders by `/`). */
  local: (name: string) => string
  /** A PC file's text, or null when there is none. */
  readLocal: (path: string) => Promise<string | null>
  /** Every file under the downloads folder, sorted; leftovers such as partial files show here. */
  localFiles: () => Promise<string[]>
}

/** Every ScopeFiles adapter must pass this suite. `setup` gives an empty scope and an empty downloads folder. */
export function scopeFilesContract(adapterName: string, setup: () => Promise<ScopeFilesFixture>): void {
  describe(`ScopeFiles contract: ${adapterName}`, () => {
    it('[VSP-001] [NFR-006] Given a scope with observations, When its folders are listed, Then each comes back sorted with its kind and size', async () => {
      const f = await setup()
      f.put('/user/2024-03-10_21-33-02_M 42/01-images-initial/img-0001.fits', 'frame one')
      f.put('/user/2024-03-10_21-33-02_M 42/observation.json', '{}')
      f.folder('/expert mode')
      const conn = await f.scope.open(f.host, f.port)
      try {
        expect(await conn.list('/')).toEqual([
          { name: 'expert mode', kind: 'dir', sizeBytes: null },
          { name: 'user', kind: 'dir', sizeBytes: null }
        ])
        expect(await conn.list('/user/2024-03-10_21-33-02_M 42')).toEqual([
          { name: '01-images-initial', kind: 'dir', sizeBytes: null },
          { name: 'observation.json', kind: 'file', sizeBytes: 2 }
        ])
        expect(await conn.list('/expert mode')).toEqual([])
        await expect(conn.list('/no such folder')).rejects.toThrow()
      } finally {
        await conn.close()
      }
    })

    it('[VSP-003] [NFR-006] Given a file on the scope, When it is downloaded, Then the PC holds the same bytes under its name, the folder made, and progress reached its size', async () => {
      const f = await setup()
      const text = 'x'.repeat(300_000)
      f.put('/user/obs/img-0001.fits', text)
      const conn = await f.scope.open(f.host, f.port)
      const seen: number[] = []
      try {
        const local = f.local('M 42/obs/img-0001.fits')
        expect(await conn.download('/user/obs/img-0001.fits', local, text.length, n => void seen.push(n), () => false)).toBe(text.length)
        expect(await f.readLocal(local)).toBe(text)
        expect(seen.at(-1)).toBe(text.length)
        expect(seen.every((n, i) => i === 0 || n >= seen[i - 1])).toBe(true)
        expect(await f.localFiles()).toEqual(['M 42/obs/img-0001.fits'])
      } finally {
        await conn.close()
      }
    })

    it('[VSP-006] Given a file already at the landing place, When it is downloaded again, Then it is refused and the file is not overwritten', async () => {
      const f = await setup()
      f.put('/user/obs/img-0001.fits', 'from the scope')
      const conn = await f.scope.open(f.host, f.port)
      try {
        const local = f.local('img-0001.fits')
        await conn.download('/user/obs/img-0001.fits', local, null, () => undefined, () => false)
        f.put('/user/obs/img-0001.fits', 'changed on the scope')
        await expect(conn.download('/user/obs/img-0001.fits', local, null, () => undefined, () => false)).rejects.toThrow(/already exists/)
        expect(await f.readLocal(local)).toBe('from the scope')
      } finally {
        await conn.close()
      }
    })

    it('[VSP-007] Given a download whose size differs from the listing, When it ends, Then it fails and leaves no file or partial file behind', async () => {
      const f = await setup()
      f.put('/user/obs/img-0001.fits', 'short')
      const conn = await f.scope.open(f.host, f.port)
      try {
        await expect(conn.download('/user/obs/img-0001.fits', f.local('img-0001.fits'), 999, () => undefined, () => false)).rejects.toThrow(/999/)
        expect(await f.localFiles()).toEqual([])
      } finally {
        await conn.close()
      }
    })

    it('[VSP-009] Given a download under way, When it is cancelled, Then it stops with CopyCancelledError and leaves nothing behind', async () => {
      const f = await setup()
      f.put('/user/obs/img-0001.fits', 'y'.repeat(300_000))
      const conn = await f.scope.open(f.host, f.port)
      let chunks = 0
      try {
        await expect(conn.download('/user/obs/img-0001.fits', f.local('img-0001.fits'), 300_000, () => void chunks++, () => chunks > 0)).rejects.toBeInstanceOf(CopyCancelledError)
        expect(await f.localFiles()).toEqual([])
      } finally {
        await conn.close()
      }
    })

    it('[VSP-007] Given a file missing from the scope, When it is downloaded, Then it fails and nothing is left on the PC', async () => {
      const f = await setup()
      f.folder('/user')
      const conn = await f.scope.open(f.host, f.port)
      try {
        await expect(conn.download('/user/gone.fits', f.local('gone.fits'), null, () => undefined, () => false)).rejects.toThrow()
        expect(await f.localFiles()).toEqual([])
      } finally {
        await conn.close()
      }
    })

    it('[VSP-002] Given an address where nothing answers, When the scope is opened, Then it fails with ScopeUnreachableError', async () => {
      const f = await setup()
      await expect(f.scope.open(f.nowhere.host, f.nowhere.port)).rejects.toBeInstanceOf(ScopeUnreachableError)
    })
  })
}

export interface LandingAreaFixture {
  area: LandingArea
  root: string
  /** Writes a file under the root, by its parts. */
  write: (parts: string[], text: string) => Promise<void>
  /** Makes a folder under the root, by its parts, a link to a folder outside the root. */
  link: (parts: string[]) => Promise<void>
}

/** Every LandingArea adapter must pass this suite. `setup` gives an empty landing root. */
export function landingAreaContract(adapterName: string, setup: () => Promise<LandingAreaFixture>): void {
  describe(`LandingArea contract: ${adapterName}`, () => {
    it('[VSP-004] [NFR-006] Given files under the landing root, When sized, Then each present file gives its size and a missing one null', async () => {
      const f = await setup()
      await f.write(['M 42', 'obs', 'img-0001.fits'], 'frame')
      const there = f.area.join(f.root, ['M 42', 'obs', 'img-0001.fits'])
      const missing = f.area.join(f.root, ['M 42', 'obs', 'img-0002.fits'])
      expect(await f.area.sizes([there, missing])).toEqual([5, null])
      expect(there.startsWith(f.root)).toBe(true)
      const free = await f.area.freeBytes(f.area.join(f.root, ['not made yet']))
      expect(free === null || free > 0).toBe(true)
    })

    it('[VSP-011] Given target folders under the landing root, When its folders are asked for, Then their names come back sorted, files and missing folders giving none', async () => {
      const f = await setup()
      await f.write(['Orion', 'obs b', 'x.fits'], 'x')
      await f.write(['M 42', 'obs a', 'x.fits'], 'x')
      await f.write(['loose.fits'], 'x')
      expect(await f.area.folders(f.root)).toEqual(['M 42', 'Orion'])
      expect(await f.area.folders(f.area.join(f.root, ['M 42']))).toEqual(['obs a'])
      expect(await f.area.folders(f.area.join(f.root, ['not there']))).toEqual([])
    })

    it('[VSP-006] Given a folder under the landing root that links elsewhere, When a path through it is made, Then it fails rather than send a copy outside the root', async () => {
      const f = await setup()
      await f.link(['M 42'])
      expect(() => f.area.join(f.root, ['M 42', 'obs', 'x.fits'])).toThrow(/link/)
      expect(f.area.join(f.root, ['Orion', 'obs', 'x.fits']).startsWith(f.root)).toBe(true)
    })
  })
}
