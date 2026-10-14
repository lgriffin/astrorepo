import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ScopeDisconnectedError, type ScopeConnection, type ScopeFiles } from '@astro/application'
import { FakeVesperaMetadata, FakeVesperaScope, InMemoryIngestDisk, InMemoryVesperaTransferStore } from '@astro/testkit'
import { ingestDiskContract, vesperaMetadataContract, vesperaScopeContract, vesperaTransferStoreContract } from '@astro/testkit/contracts/vespera-ingest.contract'
import { FtpVesperaScope, MAX_QUEUED_CHUNKS } from '../../src/main/adapters/ftp-vespera-scope'
import { NodeScopeFiles } from '../../src/main/adapters/node-ftp-scope'
import { NodeIngestDisk } from '../../src/main/adapters/node-ingest-disk'
import { NodeVesperaMetadata } from '../../src/main/adapters/vespera-metadata'
import { FileVesperaTransferStore } from '../../src/main/adapters/file-vespera-transfers'
import { TestFtpServer } from '../helpers/ftp-server'
import { fitsWithObject, jpegWithDescription } from '../helpers/vespera-bytes'

const tempDirs: string[] = []
const servers: TestFtpServer[] = []
afterEach(async () => {
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
  for (const s of servers.splice(0)) await s.stop()
})

async function ftp(files: Record<string, string>) {
  const server = new TestFtpServer()
  for (const [p, content] of Object.entries(files)) server.put(`/${p}`, content)
  await server.start()
  servers.push(server)
  return { server, scope: new FtpVesperaScope(new NodeScopeFiles({ timeoutMs: 2000 }), '127.0.0.1', server.port) }
}

vesperaScopeContract('in-memory', files => {
  const scope = new FakeVesperaScope()
  for (const [p, content] of Object.entries(files)) scope.file(p, content)
  return { scope, commands: () => scope.commands, drop: () => void (scope.dropOnList = true) }
})

vesperaScopeContract('FTP', async files => {
  const { server, scope } = await ftp(files)
  return {
    scope,
    commands: () => server.commands,
    drop: async () => {
      servers.splice(servers.indexOf(server), 1)
      await server.stop()
    }
  }
})

describe('FtpVesperaScope', () => {
  const file = 'user/2024-06-15_21-00-54_observation_NGC3372/01-images-initial/img-0001.fits'
  const read = async (scope: FtpVesperaScope, offset: number) => {
    const r = await scope.read(file, offset)
    const parts: number[] = []
    for await (const c of r.chunks) parts.push(...c)
    return { from: r.from, text: Buffer.from(parts).toString() }
  }

  it('[VIN-024] Given a scope that will not resume, When a read asks for an offset, Then it starts at 0 and says so', async () => {
    const { server, scope } = await ftp({ [file]: '0123456789' })
    server.rest = false
    expect(await read(scope, 4)).toEqual({ from: 0, text: '0123456789' })
    expect(await read(scope, 4).then(() => server.commands.filter(c => c.startsWith('REST')))).toEqual(['REST 4', 'REST 4'])
  })

  it('[VIN-022] Given the link drops part way through a file, When read, Then the chunks fail with ScopeDisconnectedError and the next call connects again', async () => {
    const { server, scope } = await ftp({ [file]: 'x'.repeat(100) })
    server.chunkBytes = 10
    server.dropAt = `/${file}`
    await expect(read(scope, 0)).rejects.toBeInstanceOf(ScopeDisconnectedError)
    server.dropAt = null
    expect((await read(scope, 0)).text).toHaveLength(100)
    expect(server.commands.filter(c => c.startsWith('USER'))).toHaveLength(2)
  })

  /** A scope whose file is 100 one-byte chunks, each sent only once the last was taken. */
  function pacedScope() {
    const sent = { count: 0, done: false }
    const opened = { count: 0 }
    const log: string[] = []
    const conn: ScopeConnection = {
      list: async () => {
        log.push('list start')
        await new Promise(resolve => setTimeout(resolve, 5))
        log.push('list end')
        return []
      },
      retrieve: async (_remote, _offset, onStart, onChunk) => {
        log.push('retrieve start')
        try {
          sent.count = 0
          onStart(0)
          for (let i = 0; i < 100; i++) {
            sent.count++
            await onChunk(new Uint8Array([i]))
          }
          sent.done = true
        } finally {
          log.push('retrieve end')
        }
      },
      close: async () => undefined
    }
    const files: ScopeFiles = { open: async () => (opened.count++, conn) }
    return { sent, opened, log, scope: new FtpVesperaScope(files, 'scope', 21) }
  }

  it('[VIN-019] Given a copy that reads slower than the scope sends, When read, Then the scope is held back after a few chunks and every byte still arrives in order', async () => {
    const { sent, scope } = pacedScope()
    const r = await scope.read(file, 0)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(sent.count).toBe(MAX_QUEUED_CHUNKS)
    const got: number[] = []
    for await (const c of r.chunks) {
      got.push(...c)
      expect(sent.count - got.length).toBeLessThanOrEqual(MAX_QUEUED_CHUNKS)
    }
    expect(got).toEqual(Array.from({ length: 100 }, (_, i) => i))
    expect(sent.done).toBe(true)
  })

  it('[VIN-010] Given a read that stops part way, When it leaves, Then the transfer is stopped rather than sent to the end, and the next call connects again', async () => {
    const { sent, scope, opened } = pacedScope()
    const r = await scope.read(file, 0)
    for await (const c of r.chunks) if (c[0] === 2) break
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(sent.done).toBe(false)
    expect(sent.count).toBeLessThan(MAX_QUEUED_CHUNKS + 2)
    expect(await scope.head(file, 4)).toEqual(new Uint8Array([0, 1, 2, 3]))
    expect(opened.count).toBe(2)
  })

  it('[VIN-010] Given a large file, When only its head is wanted, Then the transfer stops soon after it', async () => {
    const { sent, scope } = pacedScope()
    expect(await scope.head(file, 3)).toEqual(new Uint8Array([0, 1, 2]))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(sent.count).toBeLessThan(MAX_QUEUED_CHUNKS + 2)
  })

  it('[VIN-006] Given two calls at once, When run, Then the second waits for the first, as one connection runs one command at a time', async () => {
    const { scope, log } = pacedScope()
    const [listed, head] = await Promise.all([scope.list('user'), scope.head(file, 2), scope.list('user')]).then(r => [r[0], r[1]] as const)
    expect(listed).toEqual([])
    expect(head).toEqual(new Uint8Array([0, 1]))
    expect(log).toEqual(['list start', 'list end', 'retrieve start', 'retrieve end', 'list start', 'list end'])
  })

  it('[VIN-001] Given a folder the scope will not list, When listed, Then the refusal comes through and is not counted as a dropped link', async () => {
    const { scope } = await ftp({ [file]: 'x' })
    const error = (await scope.list('nowhere').catch(e => e)) as Error
    expect(error).not.toBeInstanceOf(ScopeDisconnectedError)
    expect(error.message).toMatch(/^The scope refused CWD/)
  })

  it('[VIN-022] Given nothing answers, When listed, Then it fails with ScopeDisconnectedError', async () => {
    const { server, scope } = await ftp({})
    await server.stop()
    servers.length = 0
    await expect(scope.list('')).rejects.toBeInstanceOf(ScopeDisconnectedError)
  })
})

ingestDiskContract('in-memory', () => ({ disk: new InMemoryIngestDisk(), root: '/repo' }))
ingestDiskContract('Node', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-ingest-'))
  tempDirs.push(root)
  return { disk: new NodeIngestDisk(), root }
})

vesperaMetadataContract('in-memory', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  return { metadata: new FakeVesperaMetadata(), jpeg: d => enc(d === null ? 'JPEG' : `EXIF:${d}`), fits: o => enc(o === null ? 'FITS' : `OBJECT:${o}`) }
})
vesperaMetadataContract('Node', () => ({ metadata: new NodeVesperaMetadata(), jpeg: d => jpegWithDescription(d), fits: o => fitsWithObject(o) }))

vesperaTransferStoreContract('in-memory', () => new InMemoryVesperaTransferStore())
vesperaTransferStoreContract('JSON file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-transfers-'))
  tempDirs.push(root)
  return new FileVesperaTransferStore(path.join(root, 'repo', 'astrorepo.transfers.json'))
})
vesperaTransferStoreContract('JSON file, no folder yet', () => new FileVesperaTransferStore(null))
