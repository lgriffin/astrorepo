import { describe, it, expect } from 'vitest'
import { makeCheckToolHealth, makeListSyqonModels, makeListTools, makePlanPostProcessing, makePlanSyqon } from '@astro/application'
import { FakeToolHub, FakeToolProbe, InMemorySirilWorkspace, InMemoryStackCatalogue } from '@astro/testkit'
import { toCatalogueView, toPostProcessView, toSyqonView, toToolHealthView, toToolsView } from '../../src/main/adapters/tool-hub-presenter'

async function planView(hub: FakeToolHub, freeBytes: number | null = 100e9) {
  const stacks = new InMemoryStackCatalogue()
    .addTarget('m31', { name: 'M 31', objectType: 'galaxy', raHours: 0.7123, decDeg: 41.2692 })
    .addStack('m31', { path: 'D:/work/M 31/result.fit', width: 1000, height: 1000, focalMm: 250, pixelUm: 2.9, modifiedAt: new Date('2026-09-20T00:00:00Z') })
  const workspace = new InMemorySirilWorkspace()
  workspace.space = { freeBytes, usedBytes: 0 }
  return toPostProcessView(await makePlanPostProcessing({ stacks, tools: hub, workspace })('m31'))
}

describe('Tool hub presenter', () => {
  it('[HUB-001] Given Siril found and the rest missing, When presented, Then each tool says how it was found and the summary names what is missing', async () => {
    const view = toToolsView(await makeListTools({ tools: new FakeToolHub().install('siril', 'C:/Program Files/Siril/bin/siril-cli.exe') })())
    expect(view.summary).toBe('Not found: Siril_Scripts v2, RC Astro CLI and Git Bash.')
    expect(view.tools[0]).toMatchObject({ label: 'Siril', found: true, how: 'Standard install folder', settingKey: 'tool_path_siril' })
    expect(view.tools[2]).toMatchObject({ found: false, how: null })
  })

  it('[PPR-001] Given every tool, When the recipe is presented, Then it shows the command, where it writes and whether the disk has room', async () => {
    const view = await planView(new FakeToolHub().installAll())
    expect(view.command).toBe(
      'C:/Users/leigh/Siril_Scripts/v2/postprocess.bat "D:/work/M 31/result.fit" --target=M31 --profile=galaxy --quality=normal --coords=00:42:44.28,+41:16:09.1 --focal=250 --pixelsize=2.9'
    )
    expect(view.stacks).toEqual([{ path: 'D:/work/M 31/result.fit', label: 'result.fit, 2026-09-20' }])
    expect(view.outputDir).toBe('D:/work/M 31/processed/M31')
    expect(view.space).toBe('Needs 203.1 MB while it runs and keeps 77.2 MB.')
    expect(view).toMatchObject({ verdict: 'fits', missing: null, message: null })
  })

  it('[PPR-004] Given Siril_Scripts not found, When the recipe is presented, Then there is no command and it points to Settings', async () => {
    const view = await planView(new FakeToolHub().install('siril', 'C:/Program Files/Siril/bin/siril-cli.exe').install('bash', 'C:/Program Files/Git/bin/bash.exe'))
    expect(view.command).toBeNull()
    expect(view.missing).toBe('Needs Siril_Scripts v2, which the tool hub did not find. Set its path in Settings, under Tools.')
  })

  it('[PPR-005] Given free space the system will not report, When presented, Then the verdict is unknown', async () => {
    const view = await planView(new FakeToolHub().installAll(), null)
    expect(view).toMatchObject({ verdict: 'unknown', verdictText: "Free space on the stack's disk unknown" })
  })

  it('[PPR-001] Given no stack, When presented, Then the panel says how to get one', () => {
    const view = toPostProcessView({ target: { name: 'M 31', objectType: 'galaxy', raHours: null, decDeg: null }, stacks: [], stack: null, recipe: null })
    expect(view.message).toMatch(/^No stack yet/)
    expect(view.command).toBeNull()
  })

  it('[HUB-006] [HUB-009] Given SyQon found by its variable, ASTAP without its database, When presented, Then each says how it was found and the summary names the gap', async () => {
    const tools = new FakeToolHub().installAll().install('syqon', 'E:/SyQon/syqon-cli.exe').install('astap', 'C:/Program Files/astap/astap.exe').removeCatalogue('astap-stars')
    const report = await makeListTools({ tools })()
    const syqon = report.tools.find(t => t.id === 'syqon')
    if (syqon) syqon.source = 'env'
    const view = toToolsView(report)
    expect(view.summary).toBe('Every tool was found. Not installed: ASTAP star database.')
    expect(view.missingCatalogues).toEqual(['ASTAP star database'])
    expect(view.tools.find(t => t.id === 'syqon')).toMatchObject({ how: 'The SYQON_CLI_PATH environment variable', optional: true, catalogues: [] })
    const astap = view.tools.find(t => t.id === 'astap')
    expect(astap?.catalogues).toEqual([
      {
        id: 'astap-stars',
        label: 'ASTAP star database',
        state: 'missing',
        text: 'Not installed. ASTAP solves against a star database you install beside it, such as D50 or H18 from its download page.',
        looked: ['C:/Program Files/astap'],
        settingKey: 'catalogue_path_astap'
      }
    ])
    expect(view.tools.find(t => t.id === 'siril')?.catalogues[0]).toMatchObject({ state: 'present', text: 'Installed in C:/Program Files/Siril/bin: 2 files.' })
  })

  it('[HUB-009] Given a tool not found, When its catalogue is presented, Then it is not checked until the tool is; optional tools missing are not a gap', async () => {
    expect(toCatalogueView({ id: 'rc-astro-models', tool: 'rc-astro', label: 'RC Astro model files', state: 'not-checked', dir: null, found: null, looked: [] }).text).toBe(
      'Checked once RC Astro CLI is found.'
    )
    expect(toToolsView(await makeListTools({ tools: new FakeToolHub().installAll() })()).summary).toBe('Every tool was found.')
  })

  it('[HUB-008] [HUB-007] Given tool health, When presented, Then versions show for found tools, Unknown when none, and SyQon models with their step', async () => {
    const tools = new FakeToolHub().install('siril', 'S').install('rc-astro', 'R').install('syqon', 'Q')
    const probe = new FakeToolProbe().answer('S', ['--version'], { stdout: 'siril 1.4.0' }).answer('Q', ['--list-models'], { stdout: 'axiom-mini available\nodd-one locked' })
    const view = toToolHealthView(await makeCheckToolHealth({ tools, probe })())
    expect(view.versions).toEqual({ siril: '1.4.0', 'rc-astro': 'Unknown', syqon: 'Unknown' })
    expect(view.models).toEqual([
      { id: 'axiom-mini', step: 'Star separation', available: true, status: 'available' },
      { id: 'odd-one', step: 'Other', available: false, status: 'locked' }
    ])
    expect(view.modelsNote).toBeNull()
    const none = toToolHealthView(await makeCheckToolHealth({ tools: new FakeToolHub(), probe })())
    expect(none).toEqual({ versions: {}, models: null, modelsNote: null })
  })

  it("[HUB-010] Given RC Astro's models missing, When the recipe is presented, Then it cannot be queued and names them; Siril's optional Gaia catalogue blocks nothing", async () => {
    const view = await planView(new FakeToolHub().installAll().removeCatalogue('rc-astro-models'))
    expect(view.canQueue).toBe(false)
    expect(view.catalogues).toMatch(/^Needs RC Astro model files/)
    const spcc = await planView(new FakeToolHub().installAll().removeCatalogue('siril-spcc'))
    expect([spcc.canQueue, spcc.catalogues]).toEqual([true, null])
    const tools = toToolsView(await makeListTools({ tools: new FakeToolHub().installAll().removeCatalogue('siril-spcc') })())
    expect([tools.summary, tools.missingCatalogues]).toEqual(['Every tool was found.', []])
  })

  it('[HUB-011] Given a SyQon plan, When presented, Then the steps, models, output, command and space show, and it can be queued; a blocked one says why', async () => {
    const tools = new FakeToolHub().install('syqon', 'C:/SyQon/syqon-cli.exe')
    const probe = new FakeToolProbe().answer('C:/SyQon/syqon-cli.exe', ['--list-models'], { stdout: 'axiom-mini available' })
    const stacks = new InMemoryStackCatalogue().addTarget('m31', { name: 'M 31' }).addStack('m31', { path: 'D:/work/M 31/result.fit', sizeBytes: 300 * 1024 ** 2, modifiedAt: new Date('2026-09-20T00:00:00Z') })
    const workspace = new InMemorySirilWorkspace()
    workspace.space = { freeBytes: 100e9, usedBytes: 0 }
    const plan = makePlanSyqon({ stacks, tools, workspace, models: makeListSyqonModels({ tools, probe }) })
    const view = toSyqonView(await plan('m31'), true)
    expect(view).toMatchObject({
      message: null,
      stacks: [{ path: 'D:/work/M 31/result.fit', label: 'result.fit, 2026-09-20' }],
      step: 'star-separation',
      models: ['axiom-mini'],
      model: 'axiom-mini',
      output: 'D:/work/M 31/result_starless.fit',
      command: 'C:/SyQon/syqon-cli.exe --model axiom-mini --input "D:/work/M 31/result.fit" --output "D:/work/M 31/result_starless.fit"',
      space: 'Needs about 300.0 MB beside the stack.',
      blocked: null,
      canQueue: true
    })
    expect(view.steps.map(s => s.label)).toEqual(['Star separation', 'Sharpen', 'Denoise', 'Gradient removal'])
    const sharpen = toSyqonView(await plan('m31', { step: 'sharpen' }), true)
    expect(sharpen).toMatchObject({ models: [], model: null, command: null, canQueue: false })
    expect(sharpen.blocked).toMatch(/^Your SyQon account has no model for sharpen/)
    const unknown = toSyqonView(await plan('nope'), false)
    expect(unknown).toMatchObject({ message: 'This target is not in the catalogue.', space: null, blocked: null, canQueue: false })
  })
})
