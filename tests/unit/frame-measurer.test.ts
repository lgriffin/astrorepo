import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { readFitsImage } from '../../src/main/fits/image-reader'
import { NodeFrameMeasurer } from '../../src/main/adapters/node-frame-measurer'
import { fitsBytes, fitsImage } from '../helpers/fits'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})
function write(name: string, bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-grade-'))
  dirs.push(dir)
  const file = path.join(dir, name)
  fs.writeFileSync(file, bytes)
  return file
}

/** A starfield: background 1000 with small deterministic noise and a grid of round stars. */
function starfield(width: number, height: number, sigma: number, peak = 3000): number[] {
  const out: number[] = []
  let seed = 3
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      let v = 1000 + ((seed / 2 ** 31) - 0.5) * 30
      const sx = Math.round(x / 24) * 24
      const sy = Math.round(y / 24) * 24
      if (sx > 0 && sy > 0 && sx < width - 4 && sy < height - 4) v += peak * Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (2 * sigma * sigma))
      out.push(v)
    }
  }
  return out
}

describe('readFitsImage', () => {
  it('[GRD-001] Given a 16-bit file with BZERO, When read, Then pixels come back as stored values, with the integer range as saturation', async () => {
    const file = write('a.fit', fitsImage(3, 2, [[0, 1, 2, 1000, 40000, 65535]]))
    const image = await readFitsImage(file)
    expect(image).toMatchObject({ width: 3, height: 2, bitpix: 16, bayer: null, saturation: 65535 })
    expect([...image.planes[0]]).toEqual([0, 1, 2, 1000, 40000, 65535])
  })

  it('[GRD-002] Given a float RGB stack with a Bayer pattern card and DATAMAX, When read, Then each plane comes back and DATAMAX is the saturation', async () => {
    const file = write('b.fits', fitsImage(2, 1, [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]], { float: true, cards: { BAYERPAT: 'RGGB', DATAMAX: 1 } }))
    const image = await readFitsImage(file)
    expect(image.planes).toHaveLength(3)
    expect(image.planes[2][1]).toBeCloseTo(0.6, 5)
    expect(image).toMatchObject({ bayer: 'RGGB', saturation: 1 })
  })

  it('[GRD-011] Given broken files, When read, Then each fails with a reason the user can act on', async () => {
    await expect(readFitsImage(write('c.fit', Buffer.from('not a fits file at all'.padEnd(2880))))).rejects.toThrow('This is not a FITS file.')
    await expect(readFitsImage(write('d.fit', fitsBytes({ NAXIS: 0 })))).rejects.toThrow('The file has no image in its primary header.')
    const truncated = fitsImage(40, 40, [new Array(1600).fill(1)]).subarray(0, 2880 + 100)
    await expect(readFitsImage(write('e.fit', truncated))).rejects.toThrow('The pixel data is truncated.')
    await expect(readFitsImage(write('f.fit', Buffer.alloc(100)))).rejects.toThrow('The header is truncated.')
  })
})

describe('NodeFrameMeasurer', () => {
  it('[GRD-001] Given a mono light with round stars, When measured, Then it finds the stars and a FWHM near the truth', async () => {
    const file = write('mono.fit', fitsImage(240, 240, [starfield(240, 240, 1.4)]))
    const m = await new NodeFrameMeasurer().measure(file)
    expect(m.starCount).toBe(81)
    expect(m.fwhm ?? 0).toBeGreaterThan(2.5)
    expect(m.fwhm ?? 0).toBeLessThan(4.5)
    expect(m.eccentricity ?? 1).toBeLessThan(0.3)
  })

  it('[GRD-002] Given a colour light, When measured, Then it is binned first and FWHM is still in the frame’s own pixels', async () => {
    const pixels = starfield(240, 240, 2)
    const mono = await new NodeFrameMeasurer().measure(write('m.fit', fitsImage(240, 240, [pixels])))
    const colour = await new NodeFrameMeasurer().measure(write('c.fit', fitsImage(240, 240, [pixels], { cards: { BAYERPAT: 'RGGB' } })))
    expect(colour.fwhm ?? 0).toBeGreaterThan((mono.fwhm ?? 0) * 0.7)
    expect(colour.fwhm ?? 0).toBeLessThan((mono.fwhm ?? 0) * 1.5)
  })

  it('[GRD-011] Given a file that is not FITS, When measured, Then it fails with the reason', async () => {
    await expect(new NodeFrameMeasurer().measure(write('x.fit', Buffer.from('hello')))).rejects.toThrow(/header is truncated/)
  })
})
