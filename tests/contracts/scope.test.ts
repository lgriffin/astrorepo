import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryLandingArea, InMemoryScope } from '@astro/testkit'
import { landingAreaContract, scopeFilesContract } from '@astro/testkit/contracts/scope.contract'
import { NodeScopeFiles, READ_ONLY_COMMANDS } from '../../src/main/adapters/node-ftp-scope'
import { NodeLandingArea } from '../../src/main/adapters/node-landing-area'
import { TestFtpServer } from '../helpers/ftp-server'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})

const tempDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-vespera-'))
  cleanups.push(() => fs.rmSync(d, { recursive: true, force: true }))
  return d
}

/** A port where nothing listens: one the system just handed out and took back. */
async function deadPort(): Promise<number> {
  const s = net.createServer()
  await new Promise<void>(resolve => s.listen(0, '127.0.0.1', resolve))
  const port = (s.address() as net.AddressInfo).port
  await new Promise<void>(resolve => s.close(() => resolve()))
  return port
}

const filesUnder = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter(e => !e.isDirectory())
        .map(e => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
        .sort()
    : []

scopeFilesContract('in-memory', async () => {
  const landing = new InMemoryLandingArea()
  const scope = new InMemoryScope(landing)
  return {
    scope,
    host: '10.0.0.1',
    port: 21,
    nowhere: { host: '10.0.0.99', port: 21 },
    put: (remote, content) => void scope.put(remote, content),
    folder: remote => void scope.folder(remote),
    local: name => `/landing/${name}`,
    readLocal: async p => landing.disk.get(p) ?? null,
    localFiles: async () => landing.listing('/landing')
  }
})

/** The FTP adapter against the test server, once per way the scope may answer listings and passive mode. */
async function ftpFixture(configure: (server: TestFtpServer) => void = () => undefined) {
  const server = new TestFtpServer()
  configure(server)
  const port = await server.start()
  cleanups.push(() => server.stop())
  const dir = tempDir()
  return {
    server,
    fixture: {
      scope: new NodeScopeFiles({ timeoutMs: 3000 }),
      host: '127.0.0.1',
      port,
      nowhere: { host: '127.0.0.1', port: await deadPort() },
      put: (remote: string, content: string) => void server.put(remote, content),
      folder: (remote: string) => void server.folder(remote),
      local: (name: string) => path.join(dir, ...name.split('/')),
      readLocal: async (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null),
      localFiles: async () => filesUnder(dir)
    }
  }
}

scopeFilesContract('Node FTP (MLSD, EPSV)', async () => (await ftpFixture()).fixture)
scopeFilesContract('Node FTP (LIST, PASV)', async () => (await ftpFixture(s => ((s.mlsd = false), (s.epsv = false)))).fixture)

landingAreaContract('in-memory', async () => {
  const area = new InMemoryLandingArea()
  return { area, root: '/landing', write: async (parts, text) => void area.put(area.join('/landing', parts), text) }
})

landingAreaContract('Node', async () => {
  const root = tempDir()
  const area = new NodeLandingArea()
  return {
    area,
    root,
    write: async (parts, text) => {
      const p = area.join(root, parts)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, text)
    }
  }
})

describe('NodeScopeFiles', () => {
  it('[VSP-005] Given a full survey and copy, When the commands the scope received are read, Then none could change a file on it', async () => {
    const { server, fixture } = await ftpFixture()
    server.put('/user/obs/img-0001.fits', 'frame')
    const conn = await fixture.scope.open(fixture.host, fixture.port)
    await conn.list('/user/obs')
    await conn.download('/user/obs/img-0001.fits', fixture.local('img-0001.fits'), 5, () => undefined, () => false)
    await conn.close()
    const verbs = new Set(server.commands.map(c => c.split(' ', 1)[0].toUpperCase()))
    expect([...verbs].filter(v => !READ_ONLY_COMMANDS.has(v))).toEqual([])
    expect([...READ_ONLY_COMMANDS].filter(v => ['DELE', 'RMD', 'STOR', 'RNFR', 'RNTO', 'MKD', 'APPE', 'SITE'].includes(v))).toEqual([])
  })

  it('[VSP-005] Given a scope that names another address for passive mode, When a folder is listed, Then the data connection still goes to the scope itself', async () => {
    const { server, fixture } = await ftpFixture(s => void (s.epsv = false))
    server.put('/user/obs/img-0001.fits', 'frame')
    const conn = await fixture.scope.open(fixture.host, fixture.port)
    expect((await conn.list('/user/obs')).map(e => e.name)).toEqual(['img-0001.fits'])
    await conn.close()
    expect(server.commands).toContain('PASV')
  })

  it('[VSP-007] Given the Wi-Fi drops part way through a file, When it is downloaded, Then it fails, no partial file is left, and the connection refuses further use', async () => {
    const { server, fixture } = await ftpFixture()
    server.put('/user/obs/img-0001.fits', 'z'.repeat(200_000))
    server.dropAt = '/user/obs/img-0001.fits'
    const conn = await fixture.scope.open(fixture.host, fixture.port)
    await expect(conn.download('/user/obs/img-0001.fits', fixture.local('img-0001.fits'), 200_000, () => undefined, () => false)).rejects.toThrow()
    expect(await fixture.localFiles()).toEqual([])
    await expect(conn.list('/user')).rejects.toThrow(/interrupted|connect again|failed|closed/)
    await conn.close()
  })

  it('[VSP-002] Given a scope that refuses the sign-in, When it is opened, Then it fails with a reason naming the refusal', async () => {
    const { fixture } = await ftpFixture(s => void (s.refuseLogin = true))
    await expect(fixture.scope.open(fixture.host, fixture.port)).rejects.toThrow(/refused the sign-in: 530/)
  })

  it('[VSP-005] Given a command that is not read-only, When the adapter is asked to send it, Then it is refused before anything is sent', async () => {
    const { server, fixture } = await ftpFixture()
    server.folder('/user')
    const conn = await fixture.scope.open(fixture.host, fixture.port)
    await expect(conn.list('/user\r\nDELE /user/x')).rejects.toThrow(/line break/)
    await conn.close()
    expect(server.commands.some(c => c.startsWith('DELE'))).toBe(false)
  })
})
