import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemoryArchiveArea, InMemoryArchiveStore } from '@astro/testkit'
import { archiveAreaContract, archiveStoreContract } from '@astro/testkit/contracts/archive.contract'
import { NodeArchiveArea } from '../../src/main/adapters/node-archive-area'
import { SqliteArchiveStore } from '../../src/main/adapters/sqlite-archive-store'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

archiveAreaContract('in-memory', async () => {
  const area = new InMemoryArchiveArea()
  return {
    area,
    workDir: '/work/M42',
    archiveRoot: '/archive',
    writeWork: async (rel, text) => void area.put(`/work/M42/${rel}`, text),
    writeSource: async (name, text) => {
      area.put(`/nas/M42/${name}`, text)
      return `/nas/M42/${name}`
    },
    linkWork: async (rel, source) => void area.link(`/work/M42/${rel}`, source),
    listing: async dir => area.listing(dir),
    readFile: async p => {
      const e = area.disk.get(p)
      if (!e) throw new Error(`ENOENT: ${p}`)
      return e.text
    }
  }
})

const tempDirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})
const tempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-archive-'))
  tempDirs.push(root)
  return root
}
const listing = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter(e => !e.isDirectory())
        .map(e => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
        .sort()
    : []

archiveAreaContract('Node', async () => {
  const root = tempRoot()
  const [workDir, sourceDir, archiveRoot] = ['work', 'source', 'archive'].map(d => path.join(root, d))
  for (const d of [workDir, sourceDir]) fs.mkdirSync(d)
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  return {
    area: new NodeArchiveArea(),
    workDir,
    archiveRoot,
    writeWork: async (rel, text) => write(path.join(workDir, rel), text),
    writeSource: async (name, text) => {
      write(path.join(sourceDir, name), text)
      return path.join(sourceDir, name)
    },
    linkWork: async (rel, source) => {
      fs.mkdirSync(path.dirname(path.join(workDir, rel)), { recursive: true })
      fs.linkSync(source, path.join(workDir, rel))
    },
    listing: async dir => listing(dir),
    readFile: async p => fs.readFileSync(p, 'utf8')
  }
})

archiveStoreContract('in-memory', () => new InMemoryArchiveStore())

describe('SqliteArchiveStore', () => {
  afterEach(() => teardownTestDb())
  archiveStoreContract('SQLite', () => new SqliteArchiveStore(setupTestDb()))
})

describe('NodeArchiveArea on disk', () => {
  it('[NFR-016] Given an intermediate folder that links to the source, When it is removed, Then it is refused and the source keeps every frame', async () => {
    const root = tempRoot()
    const [work, source] = [path.join(root, 'work'), path.join(root, 'source')]
    fs.mkdirSync(work)
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'Light_001.fit'), 'pixels')
    fs.symlinkSync(source, path.join(work, 'lights'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(new NodeArchiveArea().removeFolders(work, ['lights'])).rejects.toThrow(/is a link/)
    expect(fs.readdirSync(source)).toEqual(['Light_001.fit'])
  })

  it('[NFR-016] Given process and a lights folder that links to the source, When both are removed, Then the link refuses the whole removal before process goes', async () => {
    const root = tempRoot()
    const [work, source] = [path.join(root, 'work'), path.join(root, 'source')]
    fs.mkdirSync(path.join(work, 'process'), { recursive: true })
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(work, 'process', 'pp_light_00001.fit'), 'x')
    fs.symlinkSync(source, path.join(work, 'lights'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(new NodeArchiveArea().removeFolders(work, ['process', 'lights'])).rejects.toThrow(/nothing was removed/)
    expect(fs.readdirSync(path.join(work, 'process'))).toEqual(['pp_light_00001.fit'])
  })

  it('[ARC-003] Given a folder in the work folder that cannot be read, When surveyed, Then the survey fails rather than leaving its files out', async () => {
    const root = tempRoot()
    const work = path.join(root, 'work')
    fs.mkdirSync(path.join(work, 'lights'), { recursive: true })
    fs.writeFileSync(path.join(work, 'lights', 'Light_001.fit'), 'x')
    const readdir = fs.promises.readdir.bind(fs.promises)
    vi.spyOn(fs.promises, 'readdir').mockImplementation(((dir: fs.PathLike, options: never) =>
      String(dir).endsWith('lights') ? Promise.reject(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })) : readdir(dir, options)) as typeof fs.promises.readdir)
    await expect(new NodeArchiveArea().survey(work)).rejects.toThrow(/lights in the work folder could not be read \(EACCES\)/)
    expect(await new NodeArchiveArea().survey(path.join(root, 'never'))).toEqual([])
  })

  it('[ARC-002] [NFR-016] Given a symbolic link inside process, When surveyed and removed, Then it counts as a link and what it points to stays', async () => {
    const root = tempRoot()
    const [work, source] = [path.join(root, 'work'), path.join(root, 'source')]
    fs.mkdirSync(path.join(work, 'process'), { recursive: true })
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'Light_001.fit'), 'pixels')
    try {
      fs.symlinkSync(path.join(source, 'Light_001.fit'), path.join(work, 'process', 'light_00001.fit'))
    } catch {
      return // Creating links needs rights some Windows runners lack.
    }
    const area = new NodeArchiveArea()
    expect(await area.survey(work)).toEqual([{ path: 'process/light_00001.fit', sizeBytes: 0, links: 1, fileId: null, symlink: true }])
    expect(await area.removeFolders(work, ['process'])).toEqual(['process'])
    expect(fs.readFileSync(path.join(source, 'Light_001.fit'), 'utf8')).toBe('pixels')
  })

  it('[ARC-006] Given a copy that would land outside the archive, When built, Then it is refused and no staging folder is left', async () => {
    const root = tempRoot()
    const work = path.join(root, 'work')
    fs.mkdirSync(work)
    fs.writeFileSync(path.join(work, 'result.fit'), 'x')
    const area = new NodeArchiveArea()
    const dest = path.join(root, 'archive', 'M 42')
    await expect(area.build(work, dest, [{ from: 'result.fit', inWorkFolder: true, to: '../escape.fit', sizeBytes: 1 }], {} as never)).rejects.toThrow(/outside the archive/)
    expect(fs.readdirSync(path.join(root, 'archive'))).toEqual([])
    await expect(area.readText(work, '../result.fit')).rejects.toThrow(/not inside/)
  })
})
