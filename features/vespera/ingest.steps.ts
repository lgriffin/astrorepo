import { expect } from 'vitest'
import {
  makeIdentifyTarget,
  makePlanVesperaTransfer,
  makeRunVesperaTransfer,
  makeScanVespera,
  type PlanResult,
  type ScannedSession,
  type VesperaScan
} from '@astro/application'
import { canTransfer, MANIFEST_FILE, overrideTarget, type Finding, type IngestTarget, type TransferJob, type TransferManifest } from '@astro/domain'
import { FakeVesperaMetadata, FakeVesperaScope, FixedClock, InMemoryIngestDisk, InMemoryVesperaTransferStore, LEIGH_USER_LISTING, seedVesperaSession } from '@astro/testkit'
import { FTP_WRITE_COMMANDS } from '@astro/testkit/contracts/vespera-ingest.contract'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'

class Night {
  readonly scope = new FakeVesperaScope().dir('system')
  readonly disk = new InMemoryIngestDisk()
  readonly store = new InMemoryVesperaTransferStore()
  readonly clock = new FixedClock(new Date('2026-10-14T19:00:00Z'))
  readonly scan = makeScanVespera({ scope: this.scope, clock: this.clock })
  readonly identify = makeIdentifyTarget({ scope: this.scope, metadata: new FakeVesperaMetadata() })
  readonly plan = makePlanVesperaTransfer({ disk: this.disk, store: this.store, clock: this.clock })
  readonly run = makeRunVesperaTransfer({ scope: this.scope, disk: this.disk, hasher: this.disk, store: this.store, clock: this.clock })
  result: VesperaScan | null = null
  target: IngestTarget | null = null
  findings: Finding[] = []
  planned: PlanResult | null = null
  job: TransferJob | null = null
  sessionId = ''

  session(id: string): ScannedSession {
    const s = this.result?.sessions.find(x => x.session.id === id)
    if (!s) throw new Error(`No session ${id}`)
    return s
  }

  async transfer(id: string, root: string, allowDuplicate = false) {
    const s = this.session(id)
    this.sessionId = id
    const { target, findings } = await this.identify(s.session, this.result!.userFolder)
    this.planned = await this.plan({ session: s.session, userFolder: this.result!.userFolder, target, findings: [...s.inventory.findings, ...findings], destinationRoot: root, allowDuplicate })
    this.job = this.planned.status === 'planned' || this.planned.status === 'resume' ? await this.run(this.planned.job) : null
  }
}

const n = (i: number) => String(i).padStart(4, '0')
const numbers = (text: string) => text.split(/,\s*|\s+and\s+/).map(Number)

/** A run of FITS frames with a stacked JPEG and its JSON pair for each stacked frame, and capture.json. */
function run(frames: number[], stacked: number[]): Record<string, string | number> {
  const files: Record<string, string | number> = { 'capture.json': '{}' }
  for (const f of frames) files[`img-${n(f)}.fits`] = 20
  for (const s of stacked) Object.assign(files, { [`img-${n(s)}-output.jpg`]: 8, [`img-${n(s)}-output.json`]: '{}', [`img-${n(s)}-stacking.json`]: '{}' })
  return files
}

export const vesperaSteps = defineSteps(() => new Night(), ({ Given, When, Then }) => {
  Given("my scope holds the sessions Leigh's Vespera listed on 14 October 2026", w => {
    for (const name of LEIGH_USER_LISTING) w.scope.dir(`user/${name}`)
  })

  Given('my scope holds {string} with {int} FITS frames, both stacked', (w, id: string, count: number) => {
    const frames = Array.from({ length: count }, (_, i) => i + 1)
    seedVesperaSession(w.scope, id, { '01-images-initial': run(frames, frames) })
  })

  Given(/^my scope holds "([^"]+)" with FITS frames ([\d, and]+), frames ([\d, and]+) stacked$/, (w, id: string, frames: string, stacked: string) => {
    seedVesperaSession(w.scope, id, { '01-images-initial': run(numbers(frames), numbers(stacked)) })
  })

  Given("my scope holds {string} whose last stacked JPEG's EXIF says {string}", (w, id: string, exif: string) => {
    seedVesperaSession(w.scope, id, { '01-images-initial': { 'img-0001.fits': 20, 'img-0001-output.jpg': 'EXIF:M 1' }, '02-images-adjust-framing': { 'img-0001.fits': 20, 'img-0001-output.jpg': `EXIF:${exif}` } })
  })

  Given('the Wi-Fi drops after {int} bytes', (w, bytes: number) => {
    w.scope.dropAfterBytes = bytes
    w.scope.chunkBytes = 7
  })

  Given("{string} already holds another session's copy", async (w, dir: string) => {
    await w.disk.writeText(`${dir}/${MANIFEST_FILE}`, JSON.stringify({ sessionId: '2023-01-01_00-00-00_observation_other' }))
  })

  When('I scan the scope', async w => {
    w.result = await w.scan()
  })

  When('I scan the scope and identify {string}', async (w, id: string) => {
    w.result = await w.scan()
    const s = w.session(id)
    const r = await w.identify(s.session, w.result.userFolder)
    w.sessionId = id
    w.target = r.target
    w.findings = [...s.inventory.findings, ...r.findings]
  })

  When('I name it {string}', (w, name: string) => {
    w.target = overrideTarget(w.target!, name)
  })

  When('I scan the scope and transfer {string} to {string}', async (w, id: string, root: string) => {
    w.result = await w.scan()
    await w.transfer(id, root)
  })

  When('I resume the transfer', async w => {
    w.scope.commands.length = 0
    w.job = await w.run(w.job!)
  })

  When('I transfer it again, taking the next free name', async w => {
    await w.transfer(w.sessionId, '/repo', true)
  })

  Then('I see {int} sessions, newest first, starting with {string}', (w, count: number, first: string) => {
    expect(w.result!.sessions).toHaveLength(count)
    expect(w.result!.sessions[0].session.id).toBe(first)
  })

  Then('{int} are auto-init and {int} are sun-mode sessions', (w, autoInit: number, sun: number) => {
    expect(w.result!.sessions.filter(s => s.session.kind === 'auto-init')).toHaveLength(autoInit)
    expect(w.result!.sessions.filter(s => s.session.kind === 'sun-mode')).toHaveLength(sun)
  })

  Then('{string} has the label {string}', (w, id: string, label: string) => {
    expect(w.session(id).session.rawLabel).toBe(label)
  })

  Then('the scan says expert-mode darks are on the scope', w => {
    expect(w.result!.expertMode).toBe(true)
  })

  Then('nothing was read from the scope, only listed', w => {
    expect(w.scope.commands.length).toBeGreaterThan(0)
    expect(w.scope.commands.filter(c => !c.startsWith('LIST '))).toEqual([])
  })

  Then('{string} is a session of kind {string} with the finding {string}', (w, id: string, kind: string, finding: string) => {
    const s = w.session(id)
    expect(s.session.kind).toBe(kind)
    expect(s.inventory.findings.map(f => `${f.level}:${f.code}`)).toContain(finding)
  })

  Then('{string} counts {int} FITS, {int} TIFF, {int} JPEG and {int} JSON', (w, id: string, fits: number, tiff: number, jpeg: number, json: number) => {
    w.sessionId = id
    expect(w.session(id).inventory.totals).toEqual({ fits, tiff, jpeg, json, other: 0 })
  })

  Then('its findings are:', (w, table: DataTable) => {
    expect(w.session(w.sessionId).inventory.findings.map(f => `${f.level}:${f.code}`)).toEqual(table.raw().map(r => r[0]))
  })

  Then('Transfer is on for it', w => {
    const s = w.session(w.sessionId)
    const target = w.target ?? { name: 'x', confidence: 'folder' as const, evidence: [], review: false }
    expect(canTransfer(w.target ? w.findings : s.inventory.findings, target)).toBe(true)
  })

  Then('Transfer is refused for it', w => {
    expect(canTransfer(w.findings, w.target!)).toBe(false)
  })

  Then('its target is {string} from the {string}', (w, name: string, confidence: string) => {
    expect(w.target).toMatchObject({ name, confidence })
  })

  Then('the transfer is {word}', (w, state: string) => {
    expect(w.job?.state).toBe(state)
  })

  Then('the transfer is refused with {string}', (w, code: string) => {
    expect(w.planned).toMatchObject({ status: 'refused', finding: { code } })
    expect(w.job).toBeNull()
  })

  Then('{string} holds:', (w, dir: string, table: DataTable) => {
    const prefix = `${dir}/`
    expect([...w.disk.files.keys()].filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length)).sort()).toEqual(table.raw().map(r => r[0]).sort())
  })

  Then('{string} holds the manifest', async (w, dir: string) => {
    expect(await w.disk.readText(`${dir}/${MANIFEST_FILE}`)).not.toBeNull()
  })

  Then('the manifest lists {int} files, each with a SHA-256', async (w, count: number) => {
    const manifest = JSON.parse((await w.disk.readText(`${w.job!.id}/${MANIFEST_FILE}`))!) as TransferManifest
    expect(manifest.files).toHaveLength(count)
    for (const f of manifest.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  Then('the scope was never sent a command that changes anything', w => {
    const verbs = w.scope.commands.map(c => c.split(' ')[0])
    expect(verbs.filter(v => (FTP_WRITE_COMMANDS as readonly string[]).includes(v))).toEqual([])
  })

  Then('the interrupted file was resumed from byte {int}, not fetched again', (w, from: number) => {
    expect(w.scope.commands.filter(c => c.startsWith('REST'))).toEqual([`REST ${from}`])
  })
})
