import { expect } from 'vitest'
import {
  makeFindDuplicates, makePrepareSirilWorkspace, makeReportHiddenData, WorkAreaOverlapsSourceError,
  type ContentHasher, type FindDuplicates, type SirilWorkspaceResult
} from '@astro/application'
import type { FileStamp, HiddenDataReport } from '@astro/domain'
import { InMemoryDisk, InMemoryFileHashStore, InMemoryFrameCatalogue, InMemorySirilWorkspace } from '@astro/testkit'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'

class Library {
  readonly disk = new InMemoryDisk()
  readonly hashes = new InMemoryFileHashStore()
  readonly frames = new InMemoryFrameCatalogue()
  readonly unreadable = new Set<string>()
  snapshot: [string, unknown][] = []
  report: Awaited<ReturnType<FindDuplicates>> | null = null
  hidden: HiddenDataReport | null = null

  /** The NAS as the hasher sees it: some paths fail to read, as a locked or offline file would. */
  private readonly hasher: ContentHasher = {
    quickKey: (f: FileStamp) => (this.unreadable.has(f.path) ? Promise.reject(new Error('EBUSY')) : this.disk.quickKey(f)),
    fullHash: (p: string) => (this.unreadable.has(p) ? Promise.reject(new Error('EBUSY')) : this.disk.fullHash(p))
  }

  readonly find = makeFindDuplicates({ files: this.disk, hasher: this.hasher, hashes: this.hashes })

  readonly workspace = new InMemorySirilWorkspace()
  readonly prepare = makePrepareSirilWorkspace({ workspace: this.workspace })
  sourceBefore: unknown = null
  prepared: SirilWorkspaceResult | null = null
  refusal: unknown = null
}

const paths = (table: DataTable) => table.raw().map(r => r[0])

export const ingestSteps = defineSteps(() => new Library(), ({ Given, When, Then }) => {
  Given('the NAS holds these subs:', (w, table: DataTable) => {
    for (const { path, content } of table.hashes()) w.disk.put(path, content)
    w.snapshot = structuredClone([...w.disk.files.entries()])
  })

  Given('I have checked for duplicates once', async w => {
    await w.find()
    w.disk.reads.length = 0
  })

  Given('{string} was edited on {string} to {string}', (w, path: string, at: string, content: string) => { w.disk.put(path, content, at) })
  Given('{string} was deleted', (w, path: string) => { w.disk.remove(path) })
  Given('the NAS cannot read {string}', (w, path: string) => { w.unreadable.add(path) })
  Given('the last scan quarantined {string} because {string}', (w, path: string, error: string) => {
    w.frames.addQuarantined({ path, error })
  })

  When('I check for duplicates', async w => { w.report = await w.find() })
  When('I open the hidden in your files card', async w => {
    w.hidden = await makeReportHiddenData({ frames: w.frames, hashes: w.hashes })()
  })

  Then('there is {int} duplicate group of {int} bytes listing:', (w, groups: number, size: number, table: DataTable) => {
    expect(w.report?.groups).toHaveLength(groups)
    expect(w.report?.groups[0]).toMatchObject({ sizeBytes: size, paths: paths(table) })
  })
  Then('there are no duplicate groups', w => { expect(w.report?.groups).toEqual([]) })
  Then('{int} bytes could be reclaimed', (w, n: number) => { expect(w.report?.reclaimableBytes).toBe(n) })
  Then('every file on the NAS is unchanged', w => { expect([...w.disk.files.entries()]).toEqual(w.snapshot) })

  Then('{int} files were sampled and {int} read in full', (w, sampled: number, full: number) => {
    expect(w.report?.stats).toMatchObject({ sampled, fullyHashed: full })
  })
  Then('only these files were read in full:', (w, table: DataTable) => {
    expect(w.disk.reads.filter(r => r.kind === 'full').map(r => r.path).sort()).toEqual(paths(table))
  })
  Then('no file was read', w => { expect(w.disk.reads).toEqual([]) })
  Then('{int} stored hashes were reused', (w, n: number) => { expect(w.report?.stats).toMatchObject({ reused: n, sampled: 0, fullyHashed: 0 }) })
  Then('only {string} was sampled', (w, path: string) => { expect(w.disk.reads).toEqual([{ path, kind: 'sample' }]) })
  Then('no stored hash remains for {string}', async (w, path: string) => {
    expect((await w.hashes.listHashes()).map(h => h.path)).not.toContain(path)
  })
  Then('{int} file is counted as unreadable', (w, n: number) => { expect(w.report?.stats.unreadable).toBe(n) })

  Then('it shows {int} unreadable file', (w, n: number) => { expect(w.hidden?.quarantined.count).toBe(n) })
  Then('it shows {int} duplicate file in {int} group, {int} bytes reclaimable', (w, files: number, groups: number, bytes: number) => {
    expect(w.hidden?.duplicates).toEqual({ files, groups, reclaimableBytes: bytes })
  })

  // Prep for Siril

  Given('my Seestar folder {string} holds:', (w, dir: string, table: DataTable) => {
    w.workspace.addSource(dir, ...table.hashes().map(r => ({ name: r.name, imageType: r.type || null })))
    w.sourceBefore = structuredClone(w.workspace.source.get(dir))
  })
  Given('{string} is on another disk from the work area', (w, path: string) => { w.workspace.otherVolume.add(path) })

  When('I prep {string} for Siril in {string}', async (w, source: string, work: string) => {
    w.prepared = await w.prepare(source, work)
  })
  When('I try to prep {string} for Siril in {string} with {string} also indexed', async (w, source: string, work: string, other: string) => {
    w.refusal = await w.prepare(source, work, [other]).then(() => null, (e: unknown) => e)
  })

  Then('the work area has {int} lights, {int} darks, {int} flats and {int} biases', (w, lights: number, darks: number, flats: number, biases: number) => {
    expect(w.prepared?.byFolder).toEqual({ lights, darks, flats, biases })
  })
  Then('{int} frames were linked and {int} copied', (w, linked: number, copied: number) => {
    expect(w.prepared).toMatchObject({ linked, copied })
  })
  Then('{int} frames were already in place', (w, n: number) => { expect(w.prepared).toMatchObject({ existing: n, linked: 0, copied: 0 }) })
  Then('{string} comes from {string}', (w, dest: string, from: string) => { expect(w.workspace.placed.get(dest)).toBe(from) })
  Then('{string} lists exactly what it did before', (w, dir: string) => { expect(w.workspace.source.get(dir)).toEqual(w.sourceBefore) })
  Then('every file written is under {string}', (w, prefix: string) => {
    expect(w.workspace.placed.size).toBeGreaterThan(0)
    expect([...w.workspace.placed.keys()].filter(p => !p.startsWith(prefix))).toEqual([])
  })
  Then('the prep is refused because it overlaps {string}', (w, dir: string) => {
    expect(w.refusal).toBeInstanceOf(WorkAreaOverlapsSourceError)
    expect((w.refusal as Error).message).toContain(`overlaps ${dir}, which the app never writes to`)
  })
  Then('nothing was written to any work area', w => {
    expect(w.workspace.folders.size).toBe(0)
    expect(w.workspace.placed.size).toBe(0)
  })
})
