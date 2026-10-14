import { expect } from 'vitest'
import { makeVesperaControl, type VesperaRequest, type VesperaSurvey } from '@astro/application'
import { FixedClock, InMemoryLandingArea, InMemoryScope } from '@astro/testkit'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'

class Night {
  readonly landing = new InMemoryLandingArea()
  readonly scope = new InMemoryScope(this.landing)
  readonly handedOn: string[] = []
  readonly control = makeVesperaControl({
    scope: this.scope,
    landing: this.landing,
    clock: new FixedClock(),
    onCopied: root => void this.handedOn.push(root)
  })
  request: VesperaRequest = { host: '10.0.0.1', port: 21, landingRoot: null, formats: ['fits', 'json'] }
  survey: VesperaSurvey | null = null
  failure: unknown = null

  async copy(folder: string) {
    expect(this.control.start(this.request, [{ folder, kind: 'observation' }])).toEqual({ started: true })
    await this.control.settled()
  }
}

export const vesperaSteps = defineSteps(() => new Night(), ({ Given, When, Then }) => {
  Given('the Vespera at 10.0.0.1 holds {string} with {int} FITS frames, a JPEG preview and its JSON', (w, folder: string, frames: number) => {
    for (let i = 1; i <= frames; i++) w.scope.put(`/user/${folder}/01-images-initial/img-000${i}.fits`, `frame ${i} of ${folder}`)
    w.scope.put(`/user/${folder}/01-images-initial/output.jpeg`, 'preview').put(`/user/${folder}/observation.json`, '{"target":"M 42"}')
  })
  Given('it holds {string} with {int} FITS frame', (w, folder: string, frames: number) => {
    for (let i = 1; i <= frames; i++) w.scope.put(`/user/${folder}/01-images-initial/img-000${i}.fits`, `frame ${i}`)
  })
  Given('copies land in {string}', (w, root: string) => { w.request = { ...w.request, landingRoot: root } })
  Given('the Wi-Fi drops while the second frame of M 42 is copying', w => {
    w.scope.dropAt = '/user/2024-03-10_21-33-02_M 42/01-images-initial/img-0002.fits'
  })
  Given('{string} already holds my own edits', (w, path: string) => { w.landing.put(path, 'my own edits') })
  Given('the landing disk has {int} bytes free, and the {int} bytes to copy need {int} with the margin', (w, free: number) => { w.landing.free = free })
  Given('the scope is not reachable', w => { w.scope.unreachable = true })

  When('I look for observations', async w => {
    w.survey = null
    w.failure = null
    w.survey = await w.control.survey(w.request).catch((e: unknown) => {
      w.failure = e
      return null
    })
  })
  When('I copy {string}', (w, folder: string) => w.copy(folder))
  When('the Wi-Fi is back and I copy {string} again', (w, folder: string) => {
    w.scope.dropAt = null
    return w.copy(folder)
  })

  Then('the observations are:', (w, table: DataTable) => {
    expect(w.survey?.observations.map(o => ({
      folder: o.folder, target: o.target ?? '', taken: o.takenAt ?? '', files: String(o.files), new: String(o.newFiles), state: o.state
    }))).toEqual(table.hashes())
  })
  Then('{string} holds:', (w, dir: string, table: DataTable) => {
    expect(w.landing.listing(dir)).toEqual(table.raw().map(r => r[0]))
  })
  Then('the copies were handed on to be indexed in {string}', (w, root: string) => { expect(w.handedOn).toEqual([root]) })
  Then('the scope was only listed and read', w => {
    expect(w.scope.calls.every(c => /^(open|list|download) /.test(c))).toBe(true)
  })
  Then('the copy failed after {int} file, saying {string}', (w, files: number, error: string) => {
    expect(w.control.progress()).toMatchObject({ state: 'failed', doneFiles: files, error })
  })
  Then('no partial file is left in {string}', (w, root: string) => {
    expect(w.landing.listing(root).filter(p => p.endsWith('.part'))).toEqual([])
    expect(w.landing.listing(root).every(p => w.landing.disk.get(`${root}/${p}`) !== '')).toBe(true)
  })
  Then('the copy is done with {int} files copied and {int} skipped as already on the PC', (w, copied: number, skipped: number) => {
    expect(w.control.progress()).toMatchObject({ state: 'done', doneFiles: copied, skippedFiles: skipped })
  })
  Then('{string} still holds my own edits', (w, path: string) => { expect(w.landing.disk.get(path)).toBe('my own edits') })
  Then('{string} says {int} file on the PC has another size', (w, folder: string, n: number) => {
    expect(w.survey?.observations.find(o => o.folder === folder)?.differentFiles).toBe(n)
  })
  Then('the copy failed for lack of room, short by {int} bytes', (w, short: number) => {
    expect(w.control.progress()).toMatchObject({ state: 'failed', doneFiles: 0, shortBytes: short })
  })
  Then('I am told {string}', (w, message: string) => {
    expect(w.survey).toBeNull()
    expect(String((w.failure as Error)?.message)).toBe(message)
  })
})
