import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { readFitsImage } from '../../src/main/fits/image-reader'
import { EventEmitter } from 'events'
import type { Worker } from 'worker_threads'
import { measurement } from '@astro/testkit'
import { NodeFrameMeasurer, type MeasureReply, type MeasureRequest } from '../../src/main/adapters/node-frame-measurer'
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

  it('[GRD-011] Given a four-axis image with several slices, When read, Then it is refused rather than measured from its first slice', async () => {
    const file = write('g.fit', fitsImage(2, 2, [[1, 2, 3, 4]], { cards: { NAXIS: 4, NAXIS3: 1, NAXIS4: 2 } }))
    await expect(readFitsImage(file)).rejects.toThrow('The image has 4 axes; the app reads images of up to three.')
    const single = write('h.fit', fitsImage(2, 2, [[1, 2, 3, 4]], { cards: { NAXIS: 4, NAXIS3: 1, NAXIS4: 1 } }))
    expect([...(await readFitsImage(single)).planes[0]]).toEqual([1, 2, 3, 4])
  })

  it('[NFR-014] Given a header that declares an enormous image, When read, Then it is refused before any pixels are held', async () => {
    const file = write('i.fit', fitsBytes({ BITPIX: 16, NAXIS: 2, NAXIS1: 100000, NAXIS2: 100000 }))
    await expect(readFitsImage(file)).rejects.toThrow(/larger than the app measures \(200 megapixels\)/)
  })

  it('[GRD-001] Given more pixels than one read holds, When read, Then every pixel comes back across the reads', async () => {
    const width = 1500
    const pixels = Array.from({ length: width * width }, (_, i) => i % 60000)
    const image = await readFitsImage(write('j.fit', fitsImage(width, width, [pixels])))
    expect(image.planes[0][0]).toBe(0)
    expect(image.planes[0][2_097_152]).toBe(2_097_152 % 60000)
    expect(image.planes[0][width * width - 1]).toBe((width * width - 1) % 60000)
  })

  it('[GRD-001] Given integers stored with a negative BSCALE, When read, Then the saturation is the highest physical value', async () => {
    const file = write('k.fit', fitsImage(2, 1, [[0, 65535]], { cards: { BSCALE: -1, BZERO: 32767 } }))
    expect((await readFitsImage(file)).saturation).toBe(65535)
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

/** A stand-in worker thread: answers each request with what the reply function gives, or dies. */
class FakeWorker extends EventEmitter {
  readonly sent: MeasureRequest[] = []
  terminated = false
  refs = 0
  constructor(private readonly reply: (r: MeasureRequest) => MeasureReply | 'die') {
    super()
  }
  postMessage(r: MeasureRequest): void {
    this.sent.push(r)
    queueMicrotask(() => {
      const answer = this.reply(r)
      if (answer === 'die') this.emit('exit', 1)
      else this.emit('message', answer)
    })
  }
  ref(): void {
    this.refs++
  }
  unref(): void {
    this.refs = 0
  }
  async terminate(): Promise<number> {
    this.terminated = true
    return 0
  }
}

describe('NodeFrameMeasurer on a worker thread', () => {
  const asWorker = (w: FakeWorker) => w as unknown as Worker

  it('[NFR-014] Given a worker, When frames are measured, Then each goes to the one worker and its answer comes back, and an idle worker lets the app quit', async () => {
    const workers: FakeWorker[] = []
    const measurer = new NodeFrameMeasurer(() => {
      const w = new FakeWorker(r => (r.path === 'bad.fit' ? { id: r.id, error: 'The pixel data is truncated.' } : { id: r.id, measurement: measurement({ starCount: r.id }) }))
      workers.push(w)
      return asWorker(w)
    })
    const [a, b] = await Promise.all([measurer.measure('a.fit'), measurer.measure('b.fit')])
    expect([a.starCount, b.starCount]).toEqual([1, 2])
    await expect(measurer.measure('bad.fit')).rejects.toThrow('The pixel data is truncated.')
    expect(workers).toHaveLength(1)
    expect(workers[0].refs).toBe(0)
    await measurer.dispose()
    expect(workers[0].terminated).toBe(true)
  })

  it('[NFR-014] Given a worker that dies, When it was measuring, Then that frame fails and the next frame gets a new worker', async () => {
    const workers: FakeWorker[] = []
    const measurer = new NodeFrameMeasurer(() => {
      const w = new FakeWorker(r => (workers.length === 1 ? 'die' : { id: r.id, measurement: measurement() }))
      workers.push(w)
      return asWorker(w)
    })
    await expect(measurer.measure('a.fit')).rejects.toThrow(/stopped unexpectedly/)
    await expect(measurer.measure('a.fit')).resolves.toEqual(measurement())
    expect(workers).toHaveLength(2)
  })
})
