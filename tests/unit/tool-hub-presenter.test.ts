import { describe, it, expect } from 'vitest'
import { makeListTools, makePlanPostProcessing } from '@astro/application'
import { FakeToolHub, InMemorySirilWorkspace, InMemoryStackCatalogue } from '@astro/testkit'
import { toPostProcessView, toToolsView } from '../../src/main/adapters/tool-hub-presenter'

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
})
