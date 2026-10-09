import { describe, expect, it } from 'vitest'
import { possiblePalettes, channelSources, type FieldGeometry } from '@astro/domain'
import { FakeToolHub, InMemorySirilWorkspace, InMemoryStackCatalogue, inspection, preview } from '@astro/testkit'
import { makePlanPostProcessing } from '@astro/application'
import {
  formatShare,
  formatValue,
  paletteHint,
  paletteMapping,
  toGalleryImagesView,
  toInspectionView,
  toPalettePreviewView,
  toPalettesView,
  toPreviewView
} from '../../src/main/adapters/gallery-presenter'
import { toPostProcessView } from '../../src/main/adapters/tool-hub-presenter'
import { PALETTES } from '@astro/domain'
import { schemas } from '../../src/main/ipc/schemas'

const stats = (channel: 'L' | 'R' | 'G' | 'B', saturatedShare: number | null, blackShare: number) => ({
  channel,
  histogram: { min: 0, max: 65535, counts: [5, 1] },
  median: 1012.4,
  noise: 11.27,
  saturatedShare,
  blackShare
})

describe('Inspector wording', () => {
  it('[INS-001] Given a colour image with clipping, When shown, Then each channel has its figures and the clipping is said in plain words', () => {
    const view = toInspectionView({ ok: true, inspection: inspection({ kind: 'colour', width: 4144, height: 2822, sampled: 1_000_000, channels: [stats('R', 0.0123, 0), stats('G', 0, 0.002), stats('B', null, 0)] }) })
    expect(view.summary).toBe('A colour image, 4144 × 2822. Figures from 1,000,000 pixels per channel spread over the image.')
    expect(view.channels[0]).toMatchObject({ label: 'Red', median: '1,012', noise: '11.27', saturated: '1.2%', black: 'none', histogram: { min: '0', max: '65,535', counts: [5, 1] } })
    expect(view.channels[2].saturated).toBe('unknown')
    expect(view.warnings).toEqual([
      '1.2% of the red pixels are saturated, so the brightest stars or nebula there have lost detail.',
      '0.20% of the green pixels are clipped to black, so the faintest sky there has lost detail.'
    ])
    expect(view.starNote).toMatch(/No star stands out/)
  })

  it('[INS-002] Given a star profile, When shown, Then FWHM, peak and position read plainly', () => {
    const view = toInspectionView({ ok: true, inspection: inspection({ star: { x: 80.4, y: 60.6, fwhm: 3.456, peak: 0.0421, background: 0.01, profile: [1, 0.5, 0.1] } }) })
    expect(view.star).toEqual({ fwhm: '3.46 px', peak: '0.0421', position: '80, 61', profile: [1, 0.5, 0.1] })
    expect(view.starNote).toBeNull()
    expect(view.summary).toMatch(/^A mono image, 100 × 80\. Figures from 8,000 pixels spread/)
  })

  it('[INS-003] Given a file that could not be read, When shown, Then it says why and what to do', () => {
    expect(toInspectionView({ ok: false, error: 'The pixel data is truncated.' }).error).toBe(
      'The file could not be read: The pixel data is truncated. Check the file opens in Siril, or scan the folder again if it moved.'
    )
  })

  it('[INS-001] Given values and shares, When formatted, Then camera units are whole and small shares are not shown as zero', () => {
    expect([formatValue(0), formatValue(0.012345), formatValue(3.14159), formatValue(-250.4)]).toEqual(['0', '0.0123', '3.14', '-250'])
    expect([formatShare(null), formatShare(0), formatShare(0.00001), formatShare(0.5)]).toEqual(['unknown', 'none', 'under 0.01%', '50.0%'])
  })
})

describe('Preview wording', () => {
  const field: FieldGeometry = { raDeg: 83.82, decDeg: -5.39, rotationDeg: -12, scaleArcsec: 1.236, widthPx: 3000, heightPx: 2000, flipped: true }

  it('[INS-011] Given a solved preview, When shown, Then the pixels, the overlay and where it points come across', () => {
    const view = toPreviewView({
      ok: true,
      preview: preview(2, 1, 200, { sourceWidth: 3000, sourceHeight: 2000 }),
      field,
      fieldSource: 'header',
      overlay: {
        grid: [{ kind: 'dec', valueDeg: -5.5, label: '−5° 30′', points: [{ x: 0.123, y: 10.06 }] }],
        objects: [
          { designation: 'M42', name: 'Orion Nebula', raDeg: 0, decDeg: 0, sizeArcmin: 85, x: 1.04, y: 2.96, radiusPx: 4.44 },
          { designation: 'NGC 1980', name: null, raDeg: 0, decDeg: 0, sizeArcmin: null, x: 1, y: 2, radiusPx: null }
        ]
      }
    })
    expect(view).toMatchObject({ error: null, width: 2, height: 1, channels: 1, pixelsBase64: Buffer.from([200, 200]).toString('base64'), sourceSize: '3000 × 2000' })
    expect(view.overlay).toEqual({
      lines: [{ kind: 'dec', label: '−5° 30′', points: [[0.1, 10.1]] }],
      objects: [{ label: 'M42 Orion Nebula', x: 1, y: 3, radius: 4.4 }, { label: 'NGC 1980', x: 1, y: 2, radius: null }]
    })
    expect(view.fieldText).toBe('Centred on 5h 35m, −5° 23′ at 1.24″ per pixel, north turned 348°, mirrored.')
  })

  it('[INS-012] Given a preview placed by a stored plate solve, When shown, Then where it points names the solver', () => {
    const solved = { raDeg: 83.82, decDeg: -5.39, rotationDeg: 0, scaleArcsec: 1.2, widthPx: 3000, heightPx: 2000 }
    const view = toPreviewView({ ok: true, preview: preview(2, 1, 200, { sourceWidth: 3000, sourceHeight: 2000 }), field: solved, fieldSource: 'astap', overlay: null })
    expect(view.fieldText).toBe('Centred on 5h 35m, −5° 23′ at 1.20″ per pixel, north turned 0°. From its plate solve by ASTAP.')
  })

  it('[INS-011] Given a preview without a field, or one that failed, When shown, Then there is no overlay, or the reason', () => {
    expect(toPreviewView({ ok: true, preview: preview(), field: null, fieldSource: null, overlay: null })).toMatchObject({ overlay: null, fieldText: null })
    expect(toPreviewView({ ok: false, error: 'Gone.' })).toMatchObject({ error: 'The image could not be read: Gone.', pixelsBase64: '' })
  })

  it('[INS-007] Given a target’s images, When listed to compare, Then each says what it is and when', () => {
    expect(toGalleryImagesView([
      { path: '/a.fit', name: 'a.fit', kind: 'master', filter: 'Ha', colour: false, modifiedAt: new Date('2026-02-01T10:00:00Z') },
      { path: '/b.fit', name: 'b.fit', kind: 'master', filter: null, colour: true, modifiedAt: null },
      { path: '/c.png', name: 'c.png', kind: 'finished', filter: null, colour: null, modifiedAt: new Date('2026-03-01T10:00:00Z') }
    ]).map(i => i.label)).toEqual(['a.fit (Ha master, 2026-02-01)', 'b.fit (master)', 'c.png (finished, 2026-03-01)'])
  })
})

describe('Palette wording', () => {
  it('[INS-004] Given palettes for a target, When shown, Then each says what goes where and what stands in its way', () => {
    const options = possiblePalettes(channelSources([{ path: '/Ha.fit', filter: 'Ha', colour: false }], [{ filter: 'OIII', colour: false, seconds: 600 }]))
    const view = toPalettesView({ options, sources: [], chosen: 'HOO' })
    const by = Object.fromEntries(view.options.map(o => [o.id, o]))
    expect(by.HOO).toEqual({ id: 'HOO', possible: true, mapping: 'Ha as red, OIII as green, OIII as blue.', note: 'Stack the OIII lights to preview it.', canPreview: false })
    expect(by.SHO.note).toBe('Needs SII, which this target has not been captured with.')
    expect(by.LRGB.note).toBe('Needs red, green, blue and luminance, which this target has not been captured with.')
    expect(view).toMatchObject({ chosen: 'HOO', message: null })
  })

  it('[INS-004] Given a target with no usable filters, When shown, Then it says why there is no palette', () => {
    expect(toPalettesView({ options: possiblePalettes([]), sources: [], chosen: null }).message).toMatch(/^No palette yet/)
  })

  it('[INS-006] Given a chosen palette, When the post-processing step is shown, Then it carries the palette as a hint for Siril_Scripts', () => {
    expect(paletteMapping(PALETTES.LRGB)).toBe('luminance for brightness, red as red, green as green, blue as blue.')
    expect(paletteHint('SHO')).toBe('Palette chosen for this target: SHO, with SII as red, Ha as green, OIII as blue. Siril_Scripts takes one stack, so combine the channels in this order before you process it.')
    const empty = { target: null, stacks: [], stack: null, recipe: null }
    expect(toPostProcessView(empty).paletteHint).toBeNull()
    expect(toPostProcessView(empty, 'HOO').paletteHint).toBeNull()
  })

  it('[INS-006] Given a stack to process and a chosen palette, When the recipe is shown, Then the hint sits beside it and the command is unchanged', async () => {
    const stacks = new InMemoryStackCatalogue()
      .addTarget('m42', { name: 'M 42', objectType: 'emission_nebula', raHours: 5.58, decDeg: -5.39 })
      .addStack('m42', { path: 'D:/work/M 42/result.fit', width: 1000, height: 1000, focalMm: 250, pixelUm: 2.9, modifiedAt: new Date('2026-09-20T00:00:00Z') })
    const workspace = new InMemorySirilWorkspace()
    workspace.space = { freeBytes: 100e9, usedBytes: 0 }
    const plan = await makePlanPostProcessing({ stacks, tools: new FakeToolHub().installAll(), workspace })('m42')
    const withHint = toPostProcessView(plan, 'HOO')
    expect(withHint.paletteHint).toMatch(/^Palette chosen for this target: HOO/)
    expect(withHint.command).toBe(toPostProcessView(plan).command)
  })

  it('[INS-005] Given channel previews, When sent for a palette, Then each channel goes as base64 with the mapping, or the reason it failed', () => {
    const view = toPalettePreviewView({ ok: true, palette: PALETTES.HOO, channels: { Ha: preview(1, 1, 7), OIII: preview(1, 1, 9) } }, 'HOO')
    expect(view).toEqual({
      error: null,
      red: 'Ha',
      green: 'OIII',
      blue: 'OIII',
      luminance: null,
      channels: { Ha: { width: 1, height: 1, pixelsBase64: Buffer.from([7]).toString('base64') }, OIII: { width: 1, height: 1, pixelsBase64: Buffer.from([9]).toString('base64') } }
    })
    expect(toPalettePreviewView({ ok: false, error: 'Gone.' }, 'SHO')).toMatchObject({ error: 'A stack could not be read for the preview: Gone.', red: 'SII', channels: {} })
  })
})

describe('Gallery IPC schemas', () => {
  it('[INS-008] Given requests from the window, When validated, Then files go by id, images with their target, and only known palettes pass', () => {
    expect(schemas['inspect:file'].parse({ file_id: 'f1' })).toEqual({ file_id: 'f1' })
    expect(() => schemas['inspect:file-preview'].parse({})).toThrow()
    expect(() => schemas['gallery:preview'].parse({ target_id: 't', path: '' })).toThrow()
    expect(schemas['gallery:choose-palette'].parse({ target_id: 't', palette: null })).toEqual({ target_id: 't', palette: null })
    expect(() => schemas['gallery:palette-preview'].parse({ target_id: 't', palette: 'XYZ' })).toThrow()
    expect(schemas['gallery:palettes'].parse({ target_id: 't' })).toEqual({ target_id: 't' })
    expect(schemas['gallery:images'].parse({ target_id: 't' })).toEqual({ target_id: 't' })
  })
})

describe('Palette preview in the window', () => {
  it('[INS-005] Given grey channels, When combined for a palette, Then each lands in its colour, smaller channels set the size, and luminance sets the brightness', async () => {
    const { composePalette } = await import('../../src/renderer/utils/compose')
    const ha = { width: 2, height: 2, pixels: new Uint8Array([200, 200, 200, 200]) }
    const oiii = { width: 1, height: 1, pixels: new Uint8Array([50]) }
    const hoo = composePalette({ Ha: ha, OIII: oiii }, { red: 'Ha', green: 'OIII', blue: 'OIII', luminance: null })!
    expect([hoo.width, hoo.height, ...hoo.rgba]).toEqual([1, 1, 200, 50, 50, 255])
    expect(composePalette({ Ha: ha }, { red: 'Ha', green: 'OIII', blue: 'OIII', luminance: null })).toBeNull()
    const grey = { width: 1, height: 1, pixels: new Uint8Array([100]) }
    const lrgb = composePalette({ R: grey, G: grey, B: grey, L: { width: 1, height: 1, pixels: new Uint8Array([50]) } }, { red: 'R', green: 'G', blue: 'B', luminance: 'L' })!
    expect([...lrgb.rgba]).toEqual([50, 50, 50, 255])
    const black = composePalette({ R: oiii, G: oiii, B: { width: 1, height: 1, pixels: new Uint8Array([0]) }, L: oiii }, { red: 'R', green: 'G', blue: 'B', luminance: 'L' })!
    expect(black.rgba[3]).toBe(255)
  })
})
