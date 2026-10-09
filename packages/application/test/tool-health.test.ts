import { describe, it, expect } from 'vitest'
import { makeCheckCatalogues, makeCheckToolHealth, makeListSyqonModels, makeListTools, makePlanPostProcessing, makeQueuePostProcess } from '@astro/application'
import { FakeToolHub, FakeToolProbe, FixedClock, InMemoryJobStore, InMemorySirilWorkspace, InMemoryStackCatalogue } from '@astro/testkit'

const SIRIL = 'C:/Program Files/Siril/bin/siril-cli.exe'
const SYQON = 'C:/Users/leigh/AppData/Local/Programs/SyQon Studio/syqon-cli.exe'
const ASTAP = 'C:/Program Files/astap/astap.exe'

describe('Tool health', () => {
  it('[HUB-008] Given found tools, When health is checked, Then each version comes from its own flag, Unknown-able ones are not run, missing tools are not run', async () => {
    const tools = new FakeToolHub().installAll().install('syqon', SYQON).install('astap', ASTAP)
    const probe = new FakeToolProbe()
      .answer(SIRIL, ['--version'], { stdout: 'siril 1.4.0\n' })
      .answer('C:/Program Files/Git/bin/bash.exe', ['--version'], { stdout: 'GNU bash, version 5.2.37(1)-release' })
      .answer(SYQON, ['--version'], { stderr: 'syqon-cli 2.3.1' })
      .answer(SYQON, ['--list-models'], { stdout: 'axiom-mini available\nprism-essential locked\n' })
    const health = await makeCheckToolHealth({ tools, probe })()
    expect(Object.fromEntries(health.versions.map(v => [v.id, v.version]))).toEqual({
      siril: '1.4.0',
      'siril-scripts': null,
      'rc-astro': null,
      bash: '5.2.37',
      syqon: '2.3.1',
      astap: null
    })
    expect(probe.calls.map(c => [c.program, ...c.args].join(' ')).sort()).toEqual(
      [`${SIRIL} --version`, 'C:/Program Files/Git/bin/bash.exe --version', `${SYQON} --version`, `${SYQON} --list-models`].sort()
    )
    expect(health.syqon.models?.map(m => [m.id, m.available])).toEqual([['axiom-mini', true], ['prism-essential', false]])
    expect(health.catalogues.map(c => [c.id, c.state])).toEqual([['astap-stars', 'present'], ['siril-spcc', 'present'], ['rc-astro-models', 'present']])
  })

  it('[HUB-008] Given a tool whose version flag fails to start, When health is checked, Then its version is unknown; a tool not found has none', async () => {
    const health = await makeCheckToolHealth({ tools: new FakeToolHub().install('siril', SIRIL), probe: new FakeToolProbe() })()
    expect(health.versions.find(v => v.id === 'siril')).toEqual({ id: 'siril', found: true, version: null })
    expect(health.versions.find(v => v.id === 'syqon')).toEqual({ id: 'syqon', found: false, version: null })
    expect(health.syqon).toEqual({ program: null, models: null, error: 'The SyQon CLI was not found. Set where syqon-cli is in Settings, under Tools.' })
  })

  it('[HUB-007] Given the SyQon CLI cannot list its models, When asked, Then the reason is given in a sentence from the exit-code contract', async () => {
    const tools = new FakeToolHub().install('syqon', SYQON)
    const entitlement = await makeListSyqonModels({ tools, probe: new FakeToolProbe().answer(SYQON, ['--list-models'], { exitCode: 4 }) })()
    expect(entitlement.error).toBe('The SyQon CLI could not list its models. Your SyQon account does not include this model. Pick a model Settings, under Tools, lists as available, or check your SyQon plan.')
    const silent = await makeListSyqonModels({ tools, probe: new FakeToolProbe().answer(SYQON, ['--list-models'], { exitCode: null, error: 'It did not answer within 10 seconds.' }) })()
    expect(silent).toEqual({ program: SYQON, models: null, error: 'The SyQon CLI could not list its models. It did not answer within 10 seconds.' })
  })

  it('[HUB-009] Given ASTAP found without its database and RC Astro missing, When catalogues are checked, Then the database is missing and the RC Astro models are not checked', async () => {
    const tools = new FakeToolHub().install('astap', ASTAP).install('siril', SIRIL).removeCatalogue('astap-stars')
    const catalogues = await makeCheckCatalogues({ tools })()
    expect(catalogues.map(c => [c.id, c.state])).toEqual([['astap-stars', 'missing'], ['siril-spcc', 'present'], ['rc-astro-models', 'not-checked']])
    expect(catalogues[0].looked).toEqual(['C:/Program Files/astap'])
    const report = await makeListTools({ tools })()
    expect(report.catalogues.filter(c => c.state === 'missing').map(c => c.label)).toEqual(['ASTAP star database'])
  })
})

describe('Catalogues block the steps that need them', () => {
  function setup(tools: FakeToolHub) {
    const stacks = new InMemoryStackCatalogue()
      .addTarget('m31', { name: 'M 31', objectType: 'galaxy', raHours: 0.7123, decDeg: 41.2692 })
      .addStack('m31', { path: 'D:/work/M31/result.fit', width: 1000, height: 1000, focalMm: 250, pixelUm: 2.9, modifiedAt: new Date('2026-09-20T00:00:00Z') })
    const workspace = new InMemorySirilWorkspace()
    workspace.space = { freeBytes: 500e9, usedBytes: 0 }
    const plan = makePlanPostProcessing({ stacks, tools, workspace })
    const store = new InMemoryJobStore()
    return { plan, store, queue: makeQueuePostProcess({ plan, tools, store, clock: new FixedClock() }) }
  }

  it("[HUB-010] Given RC Astro's models not found, When post-processing is planned and queued, Then they block nothing, since their file names are not confirmed", async () => {
    const s = setup(new FakeToolHub().installAll().removeCatalogue('rc-astro-models'))
    expect((await s.plan('m31')).recipe?.missingCatalogues).toBeNull()
    expect((await s.queue('m31', {}, 'window')).kind).toBe('post-process')
  })

  it("[HUB-010] Given every catalogue installed, or only Siril's optional Gaia catalogue missing, When post-processing is queued, Then it is queued", async () => {
    const s = setup(new FakeToolHub().installAll())
    expect((await s.queue('m31', {}, 'window')).kind).toBe('post-process')
    const online = setup(new FakeToolHub().installAll().removeCatalogue('siril-spcc'))
    expect((await online.plan('m31')).recipe?.missingCatalogues).toBeNull()
    expect((await online.queue('m31', {}, 'window')).kind).toBe('post-process')
  })
})
