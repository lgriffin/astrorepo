import { describe, expect, it } from 'vitest'
import { GalleryRefusedError, makeGallery, PALETTE_PREVIEW_WIDTH } from '@astro/application'
import { FakeImagePixels, FixedClock, InMemoryGalleryCatalogue, InMemoryPaletteStore, InMemorySolveStore, inspection, preview } from '@astro/testkit'
import { PREVIEW_MAX_WIDTH } from '@astro/domain'

function setup() {
  const pixels = new FakeImagePixels()
  const catalogue = new InMemoryGalleryCatalogue()
  const palettes = new InMemoryPaletteStore()
  const solves = new InMemorySolveStore()
  const gallery = makeGallery({ pixels, catalogue, palettes, solves, clock: new FixedClock(new Date('2026-10-09T10:00:00Z')) })
  catalogue.files.set('f1', { path: '/fits/m42_stack.fit', name: 'm42_stack.fit' })
  catalogue.images.set('m42', [
    { path: '/fits/Ha.fit', name: 'Ha.fit', kind: 'master', filter: 'Ha', colour: false, modifiedAt: new Date('2026-02-01') },
    { path: '/fits/OIII.fit', name: 'OIII.fit', kind: 'master', filter: 'OIII', colour: false, modifiedAt: new Date('2026-02-02') },
    { path: '/images/m42.png', name: 'm42.png', kind: 'finished', filter: null, colour: null, modifiedAt: new Date('2026-03-01') }
  ])
  catalogue.integration.set('m42', [{ filter: 'SII', colour: false, seconds: 1200 }])
  catalogue.objects = [{ designation: 'M42', name: 'Orion Nebula', raDeg: 83.82, decDeg: -5.39, sizeArcmin: 85 }]
  return { pixels, catalogue, palettes, solves, gallery }
}

/** A solved header: M42 in the middle of a 3000 × 2000 frame at 1.2″ per pixel. */
const solved = { CTYPE1: 'RA---TAN', CRVAL1: 83.82, CRVAL2: -5.39, CRPIX1: 1500.5, CRPIX2: 1000.5, NAXIS1: 3000, NAXIS2: 2000, CDELT1: -1.2 / 3600, CDELT2: 1.2 / 3600 }

describe('Gallery: the inspector', () => {
  it('[INS-001, NFR-019] Given an indexed file, When opened, Then its statistics and preview come back with its path from one read through the pixel port', async () => {
    const s = setup()
    s.pixels.inspections.set('/fits/m42_stack.fit', inspection({ kind: 'colour' }))
    const result = await s.gallery.openFile('f1')
    expect(result).toMatchObject({ ok: true, path: '/fits/m42_stack.fit', name: 'm42_stack.fit', inspection: { kind: 'colour' }, preview: { width: 4 }, overlay: null })
    expect(s.pixels.asked).toEqual([{ op: 'open', path: '/fits/m42_stack.fit', maxWidth: PREVIEW_MAX_WIDTH }])
    expect(await s.gallery.openFile('gone')).toBeNull()
  })

  it('[INS-003] Given a file that cannot be read, When opened, Then the reason comes back instead', async () => {
    const s = setup()
    s.pixels.failures.set('/fits/m42_stack.fit', 'The pixel data is truncated.')
    expect(await s.gallery.openFile('f1')).toEqual({ ok: false, error: 'The pixel data is truncated.' })
  })

  it('[INS-011] Given a file whose header is solved, When opened, Then the grid and catalogue labels come scaled to the preview', async () => {
    const s = setup()
    s.pixels.previews.set('/fits/m42_stack.fit', { preview: preview(750, 500, 64, { scale: 0.25, sourceWidth: 3000, sourceHeight: 2000 }), header: solved })
    const result = await s.gallery.openFile('f1')
    if (!result?.ok) throw new Error('expected a preview')
    expect(result.field?.scaleArcsec).toBeCloseTo(1.2, 9)
    expect(result.overlay?.objects.map(o => o.designation)).toEqual(['M42'])
    expect(result.overlay?.objects[0].x).toBeCloseTo(375, 3)
    expect(result.overlay?.grid.length).toBeGreaterThan(2)
    expect(s.pixels.asked[0]).toEqual({ op: 'open', path: '/fits/m42_stack.fit', maxWidth: PREVIEW_MAX_WIDTH })
  })

  it('[INS-011] Given a file without a solution in its header, When opened, Then no overlay is offered', async () => {
    const s = setup()
    const result = await s.gallery.openFile('f1')
    expect(result).toMatchObject({ ok: true, field: null, fieldSource: null, overlay: null })
  })

  it('[INS-012] Given a file with no WCS in its header but a stored plate solve, When previewed or compared, Then the overlay comes from the solve', async () => {
    const s = setup()
    const field = { raDeg: 83.82, decDeg: -5.39, rotationDeg: 0, scaleArcsec: 1.2, widthPx: 3000, heightPx: 2000 }
    await s.solves.save({ path: '/fits/m42_stack.fit', field, source: 'astap', solvedAt: new Date('2026-10-08T22:00:00Z'), error: null })
    await s.solves.save({ path: '/fits/Ha.fit', field: { ...field, scaleArcsec: 2.4 }, source: 'siril', solvedAt: new Date('2026-10-08T22:00:00Z'), error: null })
    s.pixels.previews.set('/fits/m42_stack.fit', { preview: preview(750, 500, 64, { scale: 0.25, sourceWidth: 3000, sourceHeight: 2000 }), header: {} })
    s.pixels.previews.set('/fits/Ha.fit', { preview: preview(750, 500, 64, { scale: 0.25, sourceWidth: 3000, sourceHeight: 2000 }), header: {} })
    const result = await s.gallery.openFile('f1')
    if (!result?.ok) throw new Error('expected a preview')
    expect(result).toMatchObject({ field, fieldSource: 'astap' })
    expect(result.overlay?.objects.map(o => o.designation)).toEqual(['M42'])
    expect(result.overlay?.objects[0].x).toBeCloseTo(375, 3)
    expect(await s.gallery.previewImage('m42', '/fits/Ha.fit')).toMatchObject({ ok: true, fieldSource: 'siril', field: { scaleArcsec: 2.4 } })
  })

  it('[INS-012] Given a header solution and a stored solve, or a stored solve that failed or is for another size, When previewed, Then the header wins and the others are not used', async () => {
    const s = setup()
    const other = { raDeg: 10, decDeg: 41, rotationDeg: 0, scaleArcsec: 3, widthPx: 3000, heightPx: 2000 }
    await s.solves.save({ path: '/fits/m42_stack.fit', field: other, source: 'astap', solvedAt: new Date(), error: null })
    s.pixels.previews.set('/fits/m42_stack.fit', { preview: preview(750, 500, 64, { scale: 0.25, sourceWidth: 3000, sourceHeight: 2000 }), header: solved })
    expect(await s.gallery.openFile('f1')).toMatchObject({ ok: true, fieldSource: 'header', field: { scaleArcsec: expect.closeTo(1.2, 9) } })

    await s.solves.save({ path: '/fits/OIII.fit', field: null, source: 'astap', solvedAt: new Date(), error: 'ASTAP found no solution.' })
    await s.solves.save({ path: '/fits/Ha.fit', field: { ...other, widthPx: 6000, heightPx: 4000 }, source: 'astap', solvedAt: new Date(), error: null })
    s.pixels.previews.set('/fits/Ha.fit', { preview: preview(750, 500, 64, { scale: 0.25, sourceWidth: 3000, sourceHeight: 2000 }), header: {} })
    expect(await s.gallery.previewImage('m42', '/fits/OIII.fit')).toMatchObject({ ok: true, field: null, fieldSource: null, overlay: null })
    expect(await s.gallery.previewImage('m42', '/fits/Ha.fit')).toMatchObject({ ok: true, field: null, fieldSource: null, overlay: null })
  })
})

describe('Gallery: comparing two images', () => {
  it('[INS-007] Given a target, When its images are listed and one is previewed, Then masters and finished images are offered and the preview is at most the preview width', async () => {
    const s = setup()
    expect((await s.gallery.images('m42')).map(i => i.name)).toEqual(['OIII.fit', 'Ha.fit', 'm42.png'])
    const result = await s.gallery.previewImage('m42', '/images/m42.png')
    expect(result).toMatchObject({ ok: true, image: { kind: 'finished' }, overlay: null })
    expect(s.pixels.asked).toEqual([{ op: 'preview', path: '/images/m42.png', maxWidth: PREVIEW_MAX_WIDTH }])
  })

  it('[INS-008] Given a path that is not one of the target’s images, When previewed, Then it is refused and nothing is read', async () => {
    const s = setup()
    await expect(s.gallery.previewImage('m42', '/etc/passwd')).rejects.toBeInstanceOf(GalleryRefusedError)
    await expect(s.gallery.previewImage('m31', '/fits/Ha.fit')).rejects.toThrow(/not one of this target/)
    expect(s.pixels.asked).toEqual([])
  })

  it('[INS-003] Given one of the target’s images that cannot be read, When previewed, Then the reason comes back', async () => {
    const s = setup()
    s.pixels.failures.set('/fits/Ha.fit', 'This is not a FITS file.')
    expect(await s.gallery.previewImage('m42', '/fits/Ha.fit')).toEqual({ ok: false, error: 'This is not a FITS file.' })
  })
})

describe('Gallery: palettes', () => {
  it('[INS-004] Given Ha and OIII masters and SII lights, When palettes are listed, Then HOO, SHO and HSO are possible and nothing is chosen yet', async () => {
    const s = setup()
    const p = await s.gallery.palettes('m42')
    expect(p.options.filter(o => o.possible).map(o => o.id)).toEqual(['HOO', 'SHO', 'HSO'])
    expect(p.chosen).toBeNull()
    expect(p.sources.map(c => c.channel).sort()).toEqual(['Ha', 'OIII', 'SII'])
  })

  it('[INS-005] Given a palette whose channels are all stacked, When previewed, Then each channel is read small, from the part of the master that holds it', async () => {
    const s = setup()
    const result = await s.gallery.palettePreview('m42', 'HOO')
    if (!result.ok) throw new Error('expected a preview')
    expect(result.palette).toMatchObject({ red: 'Ha', green: 'OIII', blue: 'OIII' })
    expect(Object.keys(result.channels)).toEqual(['Ha', 'OIII'])
    expect(s.pixels.asked).toEqual([
      { op: 'preview', path: '/fits/Ha.fit', maxWidth: PALETTE_PREVIEW_WIDTH, channel: 'luminance' },
      { op: 'preview', path: '/fits/OIII.fit', maxWidth: PALETTE_PREVIEW_WIDTH, channel: 'luminance' }
    ])
  })

  it('[INS-005] Given a palette with a channel not yet stacked, When previewed, Then it is refused, and a master that cannot be read gives its reason', async () => {
    const s = setup()
    await expect(s.gallery.palettePreview('m42', 'SHO')).rejects.toThrow(/needs a stack of every channel/)
    s.pixels.failures.set('/fits/OIII.fit', 'The pixel data is truncated.')
    expect(await s.gallery.palettePreview('m42', 'HOO')).toEqual({ ok: false, error: 'The pixel data is truncated.' })
  })

  it('[INS-006] Given a possible palette, When chosen and later cleared, Then it is saved for the target and then gone', async () => {
    const s = setup()
    await s.gallery.choosePalette('m42', 'SHO')
    expect((await s.gallery.palettes('m42')).chosen).toBe('SHO')
    expect(await s.gallery.chosenPalette('m42')).toBe('SHO')
    await s.gallery.choosePalette('m42', null)
    expect(await s.palettes.chosen('m42')).toBeNull()
  })

  it('[INS-006] Given a palette the target’s filters do not allow, When chosen, Then it is refused and nothing is saved', async () => {
    const s = setup()
    await expect(s.gallery.choosePalette('m42', 'RGB')).rejects.toThrow(/cannot be chosen yet/)
    await expect(s.gallery.choosePalette('m42', 'XYZ')).rejects.toBeInstanceOf(GalleryRefusedError)
    expect(s.palettes.choices.size).toBe(0)
  })
})
