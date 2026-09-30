import { describe, it, expect } from 'vitest'
import { makeEstimateSirilRun } from '@astro/application'
import { InMemorySirilWorkspace } from '@astro/testkit'

/** A Seestar-like night: lights plus darks, flats and biases in typed folders. */
function seestar(lights: number, calibration: { darks?: number; flats?: number; biases?: number } = {}) {
  const ws = new InMemorySirilWorkspace()
  const frames: { name: string; imageType?: string }[] = []
  for (let i = 1; i <= lights; i++) frames.push({ name: `Light_M 31_10.0s_${i}.fit` })
  for (const [kind, type] of [['darks', 'Dark Frame'], ['flats', 'Flat Field'], ['biases', 'Bias Frame']] as const) {
    for (let i = 1; i <= (calibration[kind] ?? 0); i++) frames.push({ name: `${kind}/${kind}_${i}.fit`, imageType: type })
  }
  ws.addSource('/data/M 31', ...frames)
  return ws
}

const light = (i: number) => `/data/M 31/Light_M 31_10.0s_${i}.fit`

describe('EstimateSirilRun', () => {
  it('[RCP-001] Given colour lights with all three calibration sets, When the plan is made, Then the full OSC script is recommended and listed first', async () => {
    const ws = seestar(20, { darks: 5, flats: 5, biases: 5 })
    for (let i = 1; i <= 20; i++) ws.describe(light(i), { width: 1920, height: 1080, colour: true })
    const plan = await makeEstimateSirilRun({ workspace: ws })('/data/M 31', '/work/M 31')
    expect(plan.counts).toEqual({ lights: 20, darks: 5, flats: 5, biases: 5 })
    expect(plan).toMatchObject({ sensor: 'colour', sensorKnown: true, geometry: { width: 1920, height: 1080 }, geometryApproximate: false })
    expect(plan.recommended.script).toBe('OSC_Preprocessing')
    expect(plan.scripts[0].script).toBe('OSC_Preprocessing')
    expect(plan.scripts.every(s => s.script.startsWith('OSC_'))).toBe(true)
  })

  it('[RCP-002] Given the work area on another disk, When the plan is made, Then every script also counts the bytes Prep must copy', async () => {
    const ws = seestar(4, { darks: 2 })
    for (let i = 1; i <= 4; i++) ws.describe(light(i), { width: 1000, height: 1000, colour: true, sizeBytes: 2_000_000 })
    ws.space = { freeBytes: 10_000_000_000, sameVolume: false, usedBytes: 0 }
    const plan = await makeEstimateSirilRun({ workspace: ws })('/data/M 31', '/work/M 31')
    // Four 2 MB lights and two darks of the fake's default 50 MB.
    expect(plan.prepBytes).toBe(4 * 2_000_000 + 2 * 50_000_000)
    const chosen = plan.scripts[0]
    expect(chosen.netBytes).toBe(chosen.scriptBytes + plan.prepBytes)

    ws.space = { ...ws.space, sameVolume: true }
    expect((await makeEstimateSirilRun({ workspace: ws })('/data/M 31', '/work/M 31')).prepBytes).toBe(0)
  })

  it('[RCP-003] Given a small disk and a leftover earlier run, When the plan is made, Then each script says whether it fits or how short it is', async () => {
    const ws = seestar(100)
    for (let i = 1; i <= 100; i++) ws.describe(light(i), { width: 1000, height: 1000, colour: true })
    ws.space = { freeBytes: 1_000_000_000, sameVolume: true, usedBytes: 500_000_000 }
    const plan = await makeEstimateSirilRun({ workspace: ws })('/data/M 31', '/work/M 31')
    const lightsOnly = plan.scripts.find(s => s.script === 'OSC_Preprocessing_WithoutDBF')
    // 100 × (2 + 12 + 12) MB + 12 MB = 2.612 GB, less 0.5 GB already there.
    expect(lightsOnly).toMatchObject({ scriptBytes: 2_612_000_000, netBytes: 2_112_000_000, fits: false, shortBytes: 1_112_000_000 })
  })

  it('[RCP-004] Given lights never indexed, When the plan is made, Then dimensions come from file size, marked approximate, and the sensor is taken as colour', async () => {
    const plan = await makeEstimateSirilRun({ workspace: seestar(3) })('/data/M 31', '/work/M 31')
    expect(plan).toMatchObject({ geometry: { width: 5000, height: 5000 }, geometryApproximate: true, sensor: 'colour', sensorKnown: false })
  })

  it('[RCP-005] Given mono lights with darks only, When the plan is made, Then no script is recommended and the mono script names what is missing', async () => {
    const ws = seestar(10, { darks: 3 })
    for (let i = 1; i <= 10; i++) ws.describe(light(i), { width: 1000, height: 1000, colour: false })
    const plan = await makeEstimateSirilRun({ workspace: ws })('/data/M 31', '/work/M 31')
    expect(plan.sensor).toBe('mono')
    expect(plan.recommended.script).toBeNull()
    expect(plan.scripts).toHaveLength(1)
    expect(plan.scripts[0]).toMatchObject({ script: 'Mono_Preprocessing', missing: ['biases', 'flats'] })
  })

  it('[RCP-002] Given a folder with no frames, When the plan is made, Then nothing is estimated and no script is recommended', async () => {
    const plan = await makeEstimateSirilRun({ workspace: new InMemorySirilWorkspace() })('/empty', '/work/empty')
    expect(plan.geometry).toBeNull()
    expect(plan.recommended.script).toBeNull()
    expect(plan.scripts.every(s => s.scriptBytes === 0)).toBe(true)
  })

  it('[NFR-010] Given a plan, When it is made, Then nothing is placed and no folder is created', async () => {
    const ws = seestar(5, { darks: 2 })
    await makeEstimateSirilRun({ workspace: ws })('/data/M 31', '/work/M 31')
    expect(ws.placed.size).toBe(0)
    expect(ws.folders.size).toBe(0)
  })
})
