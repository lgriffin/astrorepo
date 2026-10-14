import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ScopeDisconnectedError } from '@astro/application'
import { FakeVesperaMetadata, FakeVesperaScope, InMemoryIngestDisk, InMemoryVesperaTransferStore } from '@astro/testkit'
import { ingestDiskContract, vesperaMetadataContract, vesperaScopeContract, vesperaTransferStoreContract } from '@astro/testkit/contracts/vespera-ingest.contract'
import { FtpVesperaScope } from '../../src/main/adapters/ftp-vespera-scope'
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
