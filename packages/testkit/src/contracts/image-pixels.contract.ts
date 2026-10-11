import { describe, expect, it } from 'vitest'
import type { ImagePixels, WcsHeader } from '@astro/application'
import type { ImagePreview } from '@astro/domain'

/** An image to put where the adapter reads: mono or three-channel, with WCS cards in its header or none. */
export interface SeedImage {
  name: string
  width: number
  height: number
  colour?: boolean
  wcs?: WcsHeader
}

export interface ImagePixelsHarness {
  pixels: ImagePixels
  /** Where a seeded image is. */
  path(name: string): string
  /** A file that is neither FITS nor PNG. */
  notAnImage: string
  /** A path where no file is. */
  missing: string
}

const SEED: SeedImage[] = [
  { name: 'mono.fit', width: 64, height: 48 },
  { name: 'colour.fit', width: 40, height: 30, colour: true },
  { name: 'solved.fit', width: 64, height: 48, wcs: { CTYPE1: 'RA---TAN', CTYPE2: 'DEC--TAN', CRVAL1: 83.8, CRVAL2: -5.4, CRPIX1: 32.5, CRPIX2: 24.5, CDELT1: -0.001, CDELT2: 0.001 } }
]

/** A preview whose pixels match its size, scaled from the image it came from. */
const wellFormed = (p: ImagePreview, source: { width: number; height: number }) => {
  expect(p.data.length).toBe(p.width * p.height * p.channels)
  expect([p.sourceWidth, p.sourceHeight]).toEqual([source.width, source.height])
  expect(p.scale).toBeCloseTo(p.width / source.width, 1)
}

/**
 * Every ImagePixels adapter must pass this suite. The gallery relies on: the preview never wider
 * than asked, one channel when a channel is picked (palette previews), the source size (a stored
 * plate solve is only used for an image of the same size), the header's WCS cards (the overlay),
 * and an unreadable or missing file rejecting with a reason it shows the user.
 */
export function imagePixelsContract(adapterName: string, setup: (images: SeedImage[]) => Promise<ImagePixelsHarness>): void {
  describe(`ImagePixels contract: ${adapterName}`, () => {
    it('[NFR-006] [INS-001] Given a mono image, When opened, Then its size, one channel of figures and a preview no wider than asked come back from one read', async () => {
      const h = await setup(SEED)
      const opened = await h.pixels.open(h.path('mono.fit'), { maxWidth: 16 })
      expect(opened.inspection).toMatchObject({ width: 64, height: 48, kind: 'mono' })
      expect(opened.inspection.channels).toHaveLength(1)
      expect(opened.preview).toMatchObject({ width: 16, height: 12, channels: 1, scale: 0.25 })
      wellFormed(opened.preview, { width: 64, height: 48 })
    })

    it('[NFR-006] [INS-005] Given a colour image, When opened and previewed, Then it has three channels, and a picked channel previews as one', async () => {
      const h = await setup(SEED)
      const opened = await h.pixels.open(h.path('colour.fit'), { maxWidth: 40 })
      expect(opened.inspection).toMatchObject({ width: 40, height: 30, kind: 'colour' })
      expect(opened.inspection.channels).toHaveLength(3)
      expect(opened.preview).toMatchObject({ width: 40, height: 30, channels: 3 })
      for (const channel of ['luminance', 'red', 'green-blue'] as const) {
        const { preview } = await h.pixels.preview(h.path('colour.fit'), { maxWidth: 20, channel })
        expect(preview).toMatchObject({ width: 20, height: 15, channels: 1 })
        wellFormed(preview, { width: 40, height: 30 })
      }
      expect((await h.pixels.preview(h.path('mono.fit'), { maxWidth: 64, channel: 'red' })).preview.channels).toBe(1)
    })

    it('[NFR-006] [INS-007] Given previews asked at several widths, When read, Then each is at most that wide, and never wider than the image', async () => {
      const h = await setup(SEED)
      for (const maxWidth of [1, 10, 32, 63, 64, 500]) {
        const { preview } = await h.pixels.preview(h.path('mono.fit'), { maxWidth })
        expect(preview.width).toBeLessThanOrEqual(Math.min(maxWidth, 64))
        expect(preview.width).toBeGreaterThan(0)
        wellFormed(preview, { width: 64, height: 48 })
      }
      expect((await h.pixels.preview(h.path('mono.fit'), { maxWidth: 500 })).preview).toMatchObject({ width: 64, height: 48, scale: 1 })
    })

    it('[NFR-006] [INS-011] Given a solved image and one without a solution, When opened or previewed, Then the WCS cards come with the first and none with the second', async () => {
      const h = await setup(SEED)
      const wcs = SEED[2].wcs as WcsHeader
      expect((await h.pixels.open(h.path('solved.fit'), { maxWidth: 32 })).header).toMatchObject(wcs)
      expect((await h.pixels.preview(h.path('solved.fit'), { maxWidth: 32 })).header).toMatchObject(wcs)
      const plain = (await h.pixels.preview(h.path('mono.fit'), { maxWidth: 32 })).header
      for (const key of ['CTYPE1', 'CRVAL1', 'CRVAL2', 'CDELT1', 'CD1_1']) expect(plain).not.toHaveProperty(key)
    })

    it('[NFR-006] [INS-003] Given a file that is not an image or is not there, When opened or previewed, Then it is refused with a reason', async () => {
      const h = await setup(SEED)
      for (const read of [() => h.pixels.open(h.notAnImage, { maxWidth: 32 }), () => h.pixels.preview(h.missing, { maxWidth: 32 }), () => h.pixels.open(h.missing, { maxWidth: 32 })]) {
        const error = await read().then(() => null, (e: unknown) => e)
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message.length).toBeGreaterThan(0)
      }
    })

    it('[NFR-006] [NFR-019] Given several images read at once, one of them broken, When they finish, Then each gets its own answer', async () => {
      const h = await setup(SEED)
      const [mono, broken, colour] = await Promise.allSettled([
        h.pixels.preview(h.path('mono.fit'), { maxWidth: 64 }),
        h.pixels.open(h.notAnImage, { maxWidth: 64 }),
        h.pixels.open(h.path('colour.fit'), { maxWidth: 64 })
      ])
      expect([mono.status, broken.status, colour.status]).toEqual(['fulfilled', 'rejected', 'fulfilled'])
      if (mono.status === 'fulfilled') expect(mono.value.preview.sourceWidth).toBe(64)
      if (colour.status === 'fulfilled') expect(colour.value.inspection.width).toBe(40)
    })
  })
}
