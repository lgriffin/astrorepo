import { expect } from 'vitest'
import {
  ArchiveRefusedError, makeArchiveTarget, makeListStackingSuggestions, makeTargetHolds,
  type ArchivePreview, type ArchiveRequest
} from '@astro/application'
import { stackManifest, type ArchiveMode } from '@astro/domain'
import {
  FixedClock, InMemoryArchiveArea, InMemoryArchiveStore, InMemoryDismissalStore, InMemoryFrameCatalogue, InMemoryJobStore,
  InMemorySirilWorkspace, InMemoryStackCatalogue, subs, target
} from '@astro/testkit'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'

/** Every file on the pretend disk with what it is: its file id (hard links share one), size, contents and whether it is a link. */
const snapshot = (area: InMemoryArchiveArea) =>
  [...area.disk.entries()].map(([path, e]) => `${path} ${JSON.stringify(e)}`).sort()

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

class Archiving {
  readonly area = new InMemoryArchiveArea()
  readonly store = new InMemoryArchiveStore()
  readonly jobs = new InMemoryJobStore()
  readonly frames = new InMemoryFrameCatalogue()
  readonly clock = new FixedClock()
  work = ''
  nas = ''
  request: ArchiveRequest = { targetId: 'target-m-42', workDir: null, archiveRoot: '/archive', readOnlyDirs: [] }
  before: string[] = []
  preview: ArchivePreview | null = null
  refusal: unknown = null
  destination = ''

  readonly archive = makeArchiveTarget({
    area: this.area,
    store: this.store,
    frames: this.frames,
    stacks: new InMemoryStackCatalogue().addTarget('target-m-42', { name: 'M 42' }),
    jobs: this.jobs,
    workspace: new InMemorySirilWorkspace(),
    clock: this.clock,
    holds: makeTargetHolds()
  })

  readonly suggestions = makeListStackingSuggestions({ frames: this.frames, dismissals: new InMemoryDismissalStore(), archives: this.store })

  async run(mode: ArchiveMode, remove: string[]) {
    return this.archive.archive({ ...this.request, mode, remove })
  }
}

export const archiveSteps = defineSteps(() => new Archiving(), ({ Given, When, Then }) => {
  Given('M 42 was stacked in {string} from two lights hard-linked from {string}', (w, work: string, nas: string) => {
    w.work = work
    w.nas = nas
    w.request = { ...w.request, workDir: work }
    w.area.put(`${nas}/Light_001.fit`, 'light one').put(`${nas}/Light_002.fit`, 'light two')
    w.area.link(`${work}/lights/Light_001.fit`, `${nas}/Light_001.fit`).link(`${work}/lights/Light_002.fit`, `${nas}/Light_002.fit`)
  })
  Given("the work folder also holds Siril's process folder, a failed run, masters and the stack with its manifest", w => {
    const manifest = stackManifest({
      result: { path: `${w.work}/result_60s.fit`, sizeBytes: 9, modifiedAt: null },
      target: { id: 'target-m-42', name: 'M 42' },
      job: { id: 'job-1', title: 'Stack M 42', startedAt: null },
      finishedAt: new Date('2026-10-01T03:00:00Z'),
      program: 'siril-cli',
      script: '/siril/OSC_Preprocessing.ssf',
      steps: [],
      placements: [1, 2].map(i => ({ from: `${w.nas}/Light_00${i}.fit`, folder: 'lights' as const, name: `Light_00${i}.fit` })),
      rejected: []
    })
    w.area
      .put(`${w.work}/process/pp_light_00001.fit`, 'x'.repeat(300))
      .put(`${w.work}/failed/job-0/result_30s.fit`, 'partial')
      .put(`${w.work}/masters/dark_stacked.fit`, 'dark')
      .put(`${w.work}/result_60s.fit`, 'the stack')
      .put(`${w.work}/result_60s.fit.astrorepo.json`, JSON.stringify(manifest))
    w.before = snapshot(w.area)
  })
  Given('it is {int}:{int} on {int} {word} {int}', (w, h: number, m: number, day: number, month: string, year: number) => {
    w.clock.set(new Date(year, MONTHS.indexOf(month), day, h, m).toISOString())
  })
  Given('archives go in {string} and the app only reads {string}', (w, root: string, readOnly: string) => {
    w.request = { ...w.request, archiveRoot: root, readOnlyDirs: [readOnly] }
  })
  Given('archives go in {string}', (w, root: string) => { w.request = { ...w.request, archiveRoot: root } })
  Given("today's archive folder already exists", async w => {
    w.area.put(`${(await w.archive.preview(w.request)).destination}/old.txt`, 'x')
  })
  Given('the archive disk has {int} bytes free', (w, free: number) => { w.area.free = free })
  Given('a stack of M 42 is queued in Jobs', async w => {
    await w.jobs.add({
      kind: 'stack', targetId: 'target-m-42', title: 'Stack M 42', timing: 'window',
      command: { program: 'siril-cli', args: [], cwd: w.work }, prepare: null, spaceDir: w.work, neededBytes: 0
    }, w.clock.now())
  })
  Given('M 42 has no raw folder', w => { w.request = { ...w.request, workDir: null } })
  Given('M 42 has {int} hours of subs that are ready to stack', (w, hours: number) => {
    w.frames.add(target('M 42', { subs: subs(hours * 360, 10, '2026-03-01T21:00:00Z') }))
  })

  When('I preview the archive of M 42', async w => {
    w.preview = await w.archive.preview(w.request)
    w.destination = w.preview.destination
  })
  When('I archive M 42 linked, removing {word} and {word}', async (w, a: string, b: string) => {
    w.destination = (await w.run('linked', [a, b])).record.path
  })
  When('I archive M 42 linked, removing nothing', async w => { await w.run('linked', []) })
  When('I try to archive M 42 linked', async w => {
    w.refusal = await w.run('linked', []).then(() => null, (e: unknown) => e)
  })
  When('I shoot more subs of M 42', w => {
    w.frames.add(target('M 42', { subs: subs(2000, 10, '2026-03-01T21:00:00Z') }))
  })

  Then('the archive would be made in {string}', (w, path: string) => {
    expect(w.preview?.blocked).toBeNull()
    expect(w.preview?.destination).toBe(path)
  })
  Then('the intermediate folders are:', (w, table: DataTable) => {
    const shown = w.preview?.folders.filter(f => f.intermediate).map(f => ({
      folder: f.folder, size: String(f.sizeBytes), frees: String(f.freesBytes), rebuildable: f.rebuildable ? 'yes' : 'no'
    }))
    expect(shown).toEqual(table.hashes())
  })
  Then('nothing on disk has changed', w => { expect(snapshot(w.area)).toEqual(w.before) })
  Then('the archive folder holds:', (w, table: DataTable) => {
    expect(w.area.listing(w.destination)).toEqual(table.raw().map(r => r[0]))
  })
  Then('the archive index names the raw frames {string} and {string}', (w, a: string, b: string) => {
    const index = JSON.parse(w.area.disk.get(`${w.destination}/astrorepo-archive.json`)?.text ?? '{}')
    expect(index.frames.lights.map((f: { source: string }) => f.source)).toEqual([a, b])
  })
  Then('the work folder no longer has {word} or {word}', (w, a: string, b: string) => {
    const left = w.area.listing(w.work)
    expect(left.filter(p => p.startsWith(`${a}/`) || p.startsWith(`${b}/`))).toEqual([])
    expect(left).toContain('lights/Light_001.fit')
  })
  Then('{string} still holds {word} and {word}', (w, dir: string, a: string, b: string) => {
    expect(w.area.listing(dir)).toEqual([a, b])
    // Untouched, not just still there: the same file, size and contents as before archiving.
    const under = (entries: string[]) => entries.filter(e => e.startsWith(`${dir}/`))
    expect(under(snapshot(w.area))).toEqual(under(w.before))
  })
  Then("M 42's record says {word}, removed {word} and {word}, freeing {int} bytes",
    async (w, mode: string, a: string, b: string, freed: number) => {
      expect(await w.store.get('target-m-42')).toMatchObject({ mode, path: w.destination, removed: [a, b], freedBytes: freed })
    })
  Then('the archive is refused, saying {string}', (w, reason: string) => {
    expect(w.refusal).toBeInstanceOf(ArchiveRefusedError)
    expect((w.refusal as Error).message).toContain(reason)
  })
  Then('no archive folder was made', w => {
    expect(w.area.listing(w.request.archiveRoot).filter(p => !p.endsWith('/old.txt'))).toEqual([])
  })
  Then('the preview says {string}', (w, reason: string) => { expect(w.preview?.blocked).toBe(reason) })
  Then('the cockpit suggests stacking M 42', async w => {
    expect((await w.suggestions()).map(s => s.targetName)).toEqual(['M 42'])
  })
  Then('the cockpit does not suggest stacking M 42', async w => { expect(await w.suggestions()).toEqual([]) })
})
