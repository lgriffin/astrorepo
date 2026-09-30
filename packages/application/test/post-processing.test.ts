import { describe, it, expect } from 'vitest'
import { makeListTools, makePlanPostProcessing } from '@astro/application'
import { FakeToolHub, InMemorySirilWorkspace, InMemoryStackCatalogue } from '@astro/testkit'

function setup() {
  const stacks = new InMemoryStackCatalogue().addTarget('m31', { name: 'M 31', objectType: 'galaxy', raHours: 0.7123, decDeg: 41.2692 })
  const tools = new FakeToolHub().installAll()
  const workspace = new InMemorySirilWorkspace()
  workspace.space = { freeBytes: 500e9, usedBytes: 0 }
  return { stacks, tools, workspace, plan: makePlanPostProcessing({ stacks, tools, workspace }) }
}

describe('PlanPostProcessing', () => {
  it('[PPR-001] Given indexed stacks and a Siril result in the work folder, When the plan is made, Then the newest is used and all are offered', async () => {
    const s = setup()
    s.stacks.addStack('m31', { path: 'N:/Astro/M31/stacked/M31_old.fit', width: 1920, height: 1080, modifiedAt: new Date('2026-08-01T00:00:00Z') })
    s.workspace.results.set('/work/siril/M 31', [{ path: '/work/siril/M 31/result_7200s.fit', sizeBytes: 24_883_200, modifiedAt: new Date('2026-09-20T00:00:00Z') }])
    const plan = await s.plan('m31', { workDir: '/work/siril/M 31' })
    expect(plan.stacks.map(x => x.path)).toEqual(['/work/siril/M 31/result_7200s.fit', 'N:/Astro/M31/stacked/M31_old.fit'])
    expect(plan.stack?.path).toBe('/work/siril/M 31/result_7200s.fit')
    expect(plan.recipe?.args.slice(0, 3)).toEqual(['/work/siril/M 31/result_7200s.fit', '--target=M31', '--profile=galaxy'])
    // 24,883,200 bytes of 32-bit RGB is 1440 × 1440, guessed from the size.
    expect(plan.recipe?.sizeApproximate).toBe(true)
  })

  it("[PPR-001] Given a Siril result with no optics, When the plan is made, Then focal length and pixel size come from the target's lights", async () => {
    const s = setup()
    s.stacks.addStack('m31', { path: '/stacks/M31.fit', width: 100, height: 100 })
    s.stacks.optics.set('m31', { focalMm: 250, pixelUm: 2.9 })
    const plan = await s.plan('m31')
    expect(plan.recipe?.args).toContain('--focal=250')
    expect(plan.recipe?.args).toContain('--pixelsize=2.9')
  })

  it("[PPR-001] Given a stack with a focal length but no pixel size, When the plan is made, Then only the gap is filled from the lights", async () => {
    const s = setup()
    s.stacks.addStack('m31', { path: '/stacks/M31.fit', width: 100, height: 100, focalMm: 400 })
    s.stacks.optics.set('m31', { focalMm: 250, pixelUm: 2.9 })
    const args = (await s.plan('m31')).recipe?.args ?? []
    expect(args).toContain('--focal=400')
    expect(args).toContain('--pixelsize=2.9')
  })

  it('[PPR-005] Given a stack at the root of a disk, When the plan is made, Then free space is read for that root', async () => {
    const s = setup()
    s.stacks.addStack('m31', { path: '/result.fit', width: 100, height: 100 })
    await s.plan('m31')
    expect(s.workspace.spaceAsked).toEqual(['/'])
  })

  it('[PPR-002] Given a chosen stack, profile and quality, When the plan is made, Then the command uses them', async () => {
    const s = setup()
    s.stacks.addStack('m31', { path: '/a.fit', modifiedAt: new Date('2026-09-02') }).addStack('m31', { path: '/b.fit', modifiedAt: new Date('2026-09-01') })
    const plan = await s.plan('m31', { stackPath: '/b.fit', profile: 'minimal', quality: 'light' })
    expect(plan.recipe?.args.slice(0, 4)).toEqual(['/b.fit', '--target=M31', '--profile=minimal', '--quality=light'])
  })

  it('[PPR-006] Given a stack inside a folder the app only reads, When the plan is made, Then it warns', async () => {
    const s = setup()
    s.stacks.addStack('m31', { path: '/data/M31/stacked/M31.fit', width: 10, height: 10, focalMm: 250, pixelUm: 2.9 })
    const plan = await s.plan('m31', { readOnlyDirs: ['/data'] })
    expect(plan.recipe?.warnings).toHaveLength(1)
    expect((await s.plan('m31', { readOnlyDirs: ['/elsewhere'] })).recipe?.warnings).toEqual([])
  })

  it('[PPR-001] Given a target with no stack, or no such target, When the plan is made, Then there is no recipe', async () => {
    const s = setup()
    expect(await s.plan('m31')).toMatchObject({ target: { name: 'M 31' }, stacks: [], recipe: null })
    expect(await s.plan('nope')).toMatchObject({ target: null, recipe: null })
  })

  it('[NFR-011] Given a plan, When it is made, Then nothing is placed and no folder is created', async () => {
    const s = setup()
    s.stacks.addStack('m31', { path: '/stacks/M31.fit' })
    await s.plan('m31', { workDir: '/work/siril/M 31' })
    expect(s.workspace.placed.size).toBe(0)
    expect(s.workspace.folders.size).toBe(0)
  })
})

describe('ListTools', () => {
  it('[HUB-001] Given some tools found, When listed, Then every tool appears in catalogue order with where it was found or not', async () => {
    const report = await makeListTools({ tools: new FakeToolHub().install('siril', 'C:/Program Files/Siril/bin/siril-cli.exe') })()
    expect(report.tools.map(t => t.id)).toEqual(['siril', 'siril-scripts', 'rc-astro', 'bash'])
    expect(report.tools[0]).toMatchObject({ path: 'C:/Program Files/Siril/bin/siril-cli.exe', source: 'standard', warning: null, notNeeded: false })
    expect(report.tools[1]).toMatchObject({ path: null, source: null })
  })

  it('[HUB-003] Given RC Astro found elsewhere, When listed, Then its entry carries the warning; off Windows Git Bash is not needed', async () => {
    const report = await makeListTools({ tools: new FakeToolHub().install('rc-astro', 'D:/RC/rc-astro.exe') })()
    expect(report.tools.find(t => t.id === 'rc-astro')?.warning).toMatch(/Siril_Scripts v2 runs this from C:\/Program Files\/RC-Astro/)
    const linux = await makeListTools({ tools: new FakeToolHub(false) })()
    expect(linux.tools.find(t => t.id === 'bash')?.notNeeded).toBe(true)
  })
})
