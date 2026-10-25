import { expect } from 'vitest'
import { makeCreateWorkspace, makeExportWorkspace, makeSaveWorkspaceRevision, type CreateWorkspaceResult, type SaveRevisionResult } from '@astro/application'
import { parseDec, parseRa, type GridDefinition } from '@astro/domain'
import { FixedClock, InMemoryMosaicWorkspaceStore } from '@astro/testkit'
import { defineSteps } from '@astro/testkit/bdd'

class Mosaics {
  readonly store = new InMemoryMosaicWorkspaceStore()
  readonly clock = new FixedClock(new Date('2026-10-25T20:00:00Z'))
  name = ''
  grid: GridDefinition | null = null
  created: CreateWorkspaceResult | null = null
  saved: SaveRevisionResult | null = null

  id(): string {
    if (!this.created?.ok) throw new Error('The mosaic was not created')
    return this.created.workspace.id
  }
}

export const mosaicSteps = defineSteps(() => new Mosaics(), ({ Given, When, Then }) => {
  Given('a mosaic {string} centred at RA {word} Dec {word}', (w, name: string, ra: string, dec: string) => {
    w.name = name
    w.grid = {
      centre: { raDeg: parseRa(ra) as number, decDeg: parseDec(dec) as number },
      positionAngleDeg: 0,
      rows: 1,
      columns: 1,
      overlapX: 0.15,
      overlapY: 0.15,
      field: { widthDeg: 1, heightDeg: 1, source: 'manual', label: null }
    }
  })
  Given('its grid is {int} rows by {int} columns with {int}% overlap and a {int} by {int} arcminute field', (w, rows: number, columns: number, overlap: number, width: number, height: number) => {
    w.grid = { ...(w.grid as GridDefinition), rows, columns, overlapX: overlap / 100, overlapY: overlap / 100, field: { widthDeg: width / 60, heightDeg: height / 60, source: 'manual', label: null } }
  })

  const create = async (w: Mosaics) => {
    w.created = await makeCreateWorkspace(w)({ name: w.name, grid: w.grid as GridDefinition })
  }
  When('I save the mosaic', create)
  When('I turn the grid to {int}° and save it', async (w, angle: number) => {
    w.saved = await makeSaveWorkspaceRevision(w)(w.id(), { ...(w.grid as GridDefinition), positionAngleDeg: angle })
  })

  Then('it is saved as revision {int} with {int} panels from {word} to {word}', async (w, revision: number, count: number, first: string, last: string) => {
    const r = await w.store.revision(w.id(), revision)
    expect(r?.panels).toHaveLength(count)
    expect(r?.panels[0].id).toBe(first)
    expect(r?.panels[count - 1].id).toBe(last)
  })
  Then('the CSV export has {int} panels, each with its revision, ICRS centre and four corners', async (w, count: number) => {
    const exported = await makeExportWorkspace(w)(w.id(), 'csv')
    const rows = (exported?.text ?? '').trimEnd().split('\n').slice(1).map(l => l.split(','))
    expect(rows).toHaveLength(count)
    for (const r of rows) {
      expect(r[1]).toBe('1')
      expect(r[2]).toBe('ICRS')
      expect(r.slice(14).every(n => Number.isFinite(Number(n)))).toBe(true)
      expect(r.slice(14)).toHaveLength(8)
    }
  })
  Then('the mosaic has revisions {int} and {int}', async (w, a: number, b: number) => {
    expect((await w.store.revisions(w.id())).map(r => r.revision)).toEqual([a, b])
  })
  Then('revision {int} still has its panels at {int}°', async (w, revision: number, angle: number) => {
    const r = await w.store.revision(w.id(), revision)
    expect(r?.grid.positionAngleDeg).toBe(angle)
    for (const p of r?.panels ?? []) expect(Math.abs(p.positionAngleDeg - angle)).toBeLessThan(5)
  })
  Then('saving the same grid again adds no revision', async w => {
    const latest = await w.store.revision(w.id(), 2)
    expect(await makeSaveWorkspaceRevision(w)(w.id(), latest?.grid as GridDefinition)).toEqual({ status: 'unchanged', revision: 2 })
  })
  Then('its panels sit either side of RA 0° with their RA between 0° and 360°', async w => {
    const r = await w.store.revision(w.id(), 1)
    const ras = (r?.panels ?? []).map(p => p.centre.raDeg)
    expect(ras.some(ra => ra < 10)).toBe(true)
    expect(ras.some(ra => ra > 350)).toBe(true)
    for (const p of r?.panels ?? []) for (const v of [p.centre, ...p.footprint.vertices]) expect(v.raDeg >= 0 && v.raDeg < 360).toBe(true)
  })
  Then('it is refused because {string}', (w, reason: string) => {
    expect(w.created).toEqual({ ok: false, problems: [reason] })
  })
})
