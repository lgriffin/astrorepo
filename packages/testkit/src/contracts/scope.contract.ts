import { describe, it, expect } from 'vitest'
import { ScopeUnreachableError, type ScopeFiles } from '@astro/application'

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
  /** Every file in a PC folder the test watches, sorted; anything the adapter wrote would show here. */
  localFiles: () => Promise<string[]>
}

/** Every ScopeFiles adapter must pass this suite. `setup` gives an empty scope and an empty PC folder to watch. */
export function scopeFilesContract(adapterName: string, setup: () => Promise<ScopeFilesFixture>): void {
  describe(`ScopeFiles contract: ${adapterName}`, () => {
    it('[VIN-001] [NFR-006] Given a scope with sessions, When its folders are listed, Then each comes back sorted with its kind and size', async () => {
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

    it('[VIN-024] [NFR-006] Given a file on the scope, When it is streamed from an offset, Then the bytes from where it says it started come back and nothing is written on the PC', async () => {
      const f = await setup()
      f.put('/user/obs/img-0001.fits', '0123456789')
      const conn = await f.scope.open(f.host, f.port)
      try {
        for (const offset of [0, 4]) {
          let from = -1
          const parts: number[] = []
          await conn.retrieve('/user/obs/img-0001.fits', offset, n => (from = n), c => void parts.push(...c))
          expect([0, offset]).toContain(from)
          expect(new TextDecoder().decode(new Uint8Array(parts))).toBe('0123456789'.slice(from))
        }
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
