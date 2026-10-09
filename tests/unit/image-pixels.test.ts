import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { EventEmitter } from 'events'
import type { Worker } from 'worker_threads'
import { afterEach, describe, expect, it } from 'vitest'
import { inspection, preview } from '@astro/testkit'
import { readPngImage } from '../../src/main/fits/png-reader'
import { readRaster } from '../../src/main/fits/inspect-image'
import { encodeGreyscalePng } from '../../src/main/fits/png-encoder'
import { answerPixels, NodeImagePixels, serialQueue, type PixelsReply, type PixelsRequest } from '../../src/main/adapters/node-image-pixels'
import { fitsImage } from '../helpers/fits'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})
function write(name: string, bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-inspect-'))
  dirs.push(dir)
  const file = path.join(dir, name)
  fs.writeFileSync(file, bytes)
  return file
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** A PNG from raw rows, each row filtered with the next of the five filter types in turn. */
function png(width: number, height: number, type: number, depth: number, rows: number[][], options: { interlace?: number; palette?: number[] } = {}): Buffer {
  const chunk = (kind: string, body: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(body.length)
    return Buffer.concat([len, Buffer.from(kind, 'ascii'), body, Buffer.alloc(4)])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = depth
  ihdr[9] = type
  ihdr[12] = options.interlace ?? 0
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]!
  const bpp = (channels * depth) / 8
  const lines: Buffer[] = []
  let prior = Buffer.alloc(rows[0].length)
  rows.forEach((row, y) => {
    const raw = Buffer.from(row)
    const filter = y % 5
    const out = Buffer.alloc(raw.length + 1)
    out[0] = filter
    for (let i = 0; i < raw.length; i++) {
      const a = i >= bpp ? raw[i - bpp] : 0
      const b = prior[i]
      const c = i >= bpp ? prior[i - bpp] : 0
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]
      out[i + 1] = (raw[i] - pred) & 0xff
    }
    lines.push(out)
    prior = raw
  })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(options.palette ? [chunk('PLTE', Buffer.from(options.palette))] : []),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(lines))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

describe('readPngImage', () => {
  it('[INS-007] Given an 8-bit grey PNG, When read, Then each pixel comes back with 255 as the ceiling and the first row at the top', async () => {
    const image = await readPngImage(write('g.png', encodeGreyscalePng(3, 2, new Uint8Array([0, 10, 20, 30, 40, 255]))))
    expect(image).toMatchObject({ width: 3, height: 2, saturation: 255, black: 0, bottomUp: false, bayer: null })
    expect([...image.planes[0]]).toEqual([0, 10, 20, 30, 40, 255])
  })

  it('[INS-007] Given an RGBA PNG with every filter type, When read, Then red, green and blue come back and alpha is dropped', async () => {
    const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 3 * 4 }, (_, i) => (y * 37 + i * 11) % 256))
    const image = await readPngImage(write('c.png', png(3, 5, 6, 8, rows)))
    expect(image.planes).toHaveLength(3)
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        expect([image.planes[0][y * 3 + x], image.planes[1][y * 3 + x], image.planes[2][y * 3 + x]]).toEqual(rows[y].slice(x * 4, x * 4 + 3))
      }
    }
  })

  it('[INS-007] Given 16-bit grey and a palette PNG, When read, Then the values and the palette colours come back', async () => {
    const sixteen = await readPngImage(write('s.png', png(2, 1, 0, 16, [[0x12, 0x34, 0xff, 0xff]])))
    expect([...sixteen.planes[0]]).toEqual([0x1234, 0xffff])
    expect(sixteen.saturation).toBe(65535)
    const indexed = await readPngImage(write('p.png', png(2, 1, 3, 8, [[1, 0]], { palette: [10, 20, 30, 40, 50, 60] })))
    expect([indexed.planes[0][0], indexed.planes[1][0], indexed.planes[2][0], indexed.planes[0][1]]).toEqual([40, 50, 60, 10])
  })

  it('[INS-003] Given PNGs the app does not read, When read, Then each fails with a reason the user can act on', async () => {
    await expect(readPngImage(write('i.png', png(1, 1, 0, 8, [[1]], { interlace: 1 })))).rejects.toThrow(/interlaced/)
    await expect(readPngImage(write('d.png', png(8, 1, 0, 1, [[1]])))).rejects.toThrow(/1-bit samples/)
    await expect(readPngImage(write('n.png', png(1, 1, 3, 8, [[0]])))).rejects.toThrow(/no palette/)
    await expect(readPngImage(write('x.png', Buffer.from('not a png')))).rejects.toThrow('This is not a PNG file.')
    const whole = png(2, 2, 0, 8, [[1, 2], [3, 4]])
    await expect(readPngImage(write('t.png', whole.subarray(0, 30)))).rejects.toThrow(/truncated/)
    const bad = png(1, 1, 0, 8, [[1]])
    bad.writeUInt8(9, 25)
    await expect(readPngImage(write('b.png', bad))).rejects.toThrow(/no image header/)
  })

  it('[NFR-019] Given a PNG header that declares an enormous image, When read, Then it is refused before anything is inflated', async () => {
    const huge = png(1, 1, 2, 8, [[1, 2, 3]])
    huge.writeUInt32BE(100_000, 16)
    huge.writeUInt32BE(100_000, 20)
    await expect(readPngImage(write('h.png', huge))).rejects.toThrow(/larger than the app measures/)
  })

  it('[NFR-019] Given an oversized PNG header followed by a large body, When read, Then it is refused from the header without reading the pixel data', async () => {
    const huge = png(1, 1, 0, 8, [[1]])
    huge.writeUInt32BE(20_000, 16)
    huge.writeUInt32BE(20_000, 20)
    // A body claiming 2 GB that is not there: refused for its size before any chunk is read.
    const body = Buffer.alloc(12)
    body.writeUInt32BE(0x7fffffff, 0)
    body.write('IDAT', 4, 'ascii')
    const file = write('o.png', Buffer.concat([huge.subarray(0, 33), body]))
    await expect(readPngImage(file)).rejects.toThrow(/20000 × 20000, larger than the app measures/)
  })

  it('[NFR-019] Given a small PNG whose pixel data inflates far beyond its image size, When read, Then it is refused as damaged without unpacking it all', async () => {
    const ihdr = (w: number, h: number) => {
      const b = png(1, 1, 0, 8, [[1]]).subarray(0, 33)
      b.writeUInt32BE(w, 16)
      b.writeUInt32BE(h, 20)
      return b
    }
    const chunk = (kind: string, body: Buffer) => {
      const len = Buffer.alloc(4)
      len.writeUInt32BE(body.length)
      return Buffer.concat([len, Buffer.from(kind, 'ascii'), body, Buffer.alloc(4)])
    }
    const iend = chunk('IEND', Buffer.alloc(0))
    // 64 MB of zeros deflate to about 64 KB, well under the 1 MB a 1000 × 1000 grey image may take, yet unpack 64 times larger.
    const bomb = zlib.deflateSync(Buffer.alloc(64 * 1024 * 1024))
    expect(bomb.length).toBeLessThan(1_000_000)
    await expect(readPngImage(write('bomb.png', Buffer.concat([ihdr(1000, 1000), chunk('IDAT', bomb), iend])))).rejects.toThrow('The PNG pixel data is truncated or damaged.')
    // Compressed data larger than the raster could ever need is refused before it is inflated.
    const padded = zlib.deflateSync(Buffer.alloc(64 * 1024 * 1024), { level: 0 })
    await expect(readPngImage(write('big.png', Buffer.concat([ihdr(10, 10), chunk('IDAT', padded), iend])))).rejects.toThrow(/larger than its image size allows/)
  })
})

describe('readRaster', () => {
  it('[INS-001] Given a 16-bit FITS with BZERO and a WCS, When read, Then black is 0, rows are bottom-up and the WCS cards come along', async () => {
    const file = write('a.fit', fitsImage(2, 2, [[0, 10, 20, 65535]], { cards: { CTYPE1: 'RA---TAN', CRVAL1: 83.8, CRVAL2: -5.4, CDELT1: -0.001, CDELT2: 0.001, OBJECT: 'M42' } }))
    const { image, header } = await readRaster(file)
    expect(image).toMatchObject({ width: 2, height: 2, black: 0, saturation: 65535, bottomUp: true })
    expect(header).toEqual({ CTYPE1: 'RA---TAN', CRVAL1: 83.8, CRVAL2: -5.4, CDELT1: -0.001, CDELT2: 0.001, NAXIS1: 2, NAXIS2: 2 })
  })

  it('[INS-001] Given a float FITS and a PNG, When read, Then floats start at 0 and the PNG has no WCS', async () => {
    expect((await readRaster(write('f.fit', fitsImage(1, 1, [[0.5]], { float: true })))).image.black).toBe(0)
    expect((await readRaster(write('g.png', encodeGreyscalePng(1, 1, new Uint8Array([9]))))).header).toEqual({})
  })
})

describe('NodeImagePixels', () => {
  it('[INS-001] Given a FITS file, When opened and previewed in place, Then statistics and a small preview come back, opening reading both at once', async () => {
    const pixels = Array.from({ length: 64 * 48 }, (_, i) => 1000 + (i % 7))
    const file = write('m.fit', fitsImage(64, 48, [pixels]))
    const p = new NodeImagePixels()
    const opened = await p.open(file, { maxWidth: 16 })
    expect(opened.inspection).toMatchObject({ width: 64, height: 48, kind: 'mono' })
    expect(opened.preview).toMatchObject({ width: 16, height: 12, channels: 1 })
    expect(opened.header).toMatchObject({ NAXIS1: 64 })
    const shown = await p.preview(file, { maxWidth: 32 })
    expect(shown.preview).toMatchObject({ width: 32, height: 24, channels: 1 })
    expect(shown.header).toMatchObject({ NAXIS1: 64 })
  })

  it('[INS-003] Given a file that is neither FITS nor PNG, When inspected, Then it fails with the reason', async () => {
    await expect(new NodeImagePixels().open(write('x.jpg', Buffer.alloc(3000, 0xff)), { maxWidth: 32 })).rejects.toThrow('This is not a FITS file.')
  })
})

describe('The inspect worker', () => {
  it('[NFR-019] Given reads queued together, When run, Then each starts only after the one before has settled, failures included', async () => {
    const queue = serialQueue()
    const log: string[] = []
    let open = 0
    const task = (name: string, fail = false) => async () => {
      open++
      expect(open).toBe(1)
      log.push(`start ${name}`)
      await new Promise(r => setTimeout(r, 5))
      log.push(`end ${name}`)
      open--
      if (fail) throw new Error(name)
      return name
    }
    const results = await Promise.allSettled([queue(task('a')), queue(task('b', true)), queue(task('c'))])
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
  })

  it('[NFR-019] Given an open request, When answered, Then the figures and preview come back with the preview bytes to hand over; a failure is its reason', async () => {
    const file = write('w.fit', fitsImage(8, 6, [Array.from({ length: 48 }, (_, i) => 100 + i)]))
    const { reply, transfer } = await answerPixels({ id: 7, op: 'open', path: file, maxWidth: 4 })
    expect(reply).toMatchObject({ id: 7, inspection: { width: 8, height: 6 }, preview: { width: 4 } })
    expect(transfer).toHaveLength(1)
    expect(await answerPixels({ id: 8, op: 'preview', path: write('n.fit', Buffer.alloc(10)), maxWidth: 4 })).toEqual({ reply: { id: 8, error: expect.any(String) }, transfer: [] })
  })
})

/** A stand-in worker thread: answers each request with what the reply function gives, or dies. */
class FakeWorker extends EventEmitter {
  readonly sent: PixelsRequest[] = []
  terminated = false
  refs = 0
  constructor(private readonly reply: (r: PixelsRequest) => PixelsReply | 'die') {
    super()
  }
  postMessage(r: PixelsRequest): void {
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

describe('NodeImagePixels on a worker thread', () => {
  const asWorker = (w: FakeWorker) => w as unknown as Worker

  it('[NFR-019] Given a worker, When images are inspected and previewed, Then each request goes to the one worker and only its answer comes back', async () => {
    const workers: FakeWorker[] = []
    const p = new NodeImagePixels(() => {
      const w = new FakeWorker((r): PixelsReply =>
        r.path === 'bad.fit' ? { id: r.id, error: 'The pixel data is truncated.' }
        : r.op === 'open' ? { id: r.id, inspection: inspection({ sampled: r.id }), preview: preview(2, 2), header: {} }
        : { id: r.id, preview: preview(2, 2), header: { CRVAL1: 1 } }
      )
      workers.push(w)
      return asWorker(w)
    })
    const [a, b] = await Promise.all([p.open('a.fit', { maxWidth: 320 }), p.preview('b.fit', { maxWidth: 320, channel: 'red' })])
    expect(a).toEqual({ inspection: inspection({ sampled: 1 }), preview: preview(2, 2), header: {} })
    expect(b).toEqual({ preview: preview(2, 2), header: { CRVAL1: 1 } })
    expect(workers[0].sent[1]).toEqual({ id: 2, op: 'preview', path: 'b.fit', maxWidth: 320, channel: 'red' })
    await expect(p.open('bad.fit', { maxWidth: 320 })).rejects.toThrow('The pixel data is truncated.')
    workers[0].emit('message', { id: 999, error: 'stray' })
    expect(workers).toHaveLength(1)
    expect(workers[0].refs).toBe(0)
    await p.dispose()
    expect(workers[0].terminated).toBe(true)
  })

  it('[NFR-019] Given a worker that dies or fails, When it was reading, Then that request fails and the next gets a new worker', async () => {
    const workers: FakeWorker[] = []
    const p = new NodeImagePixels(() => {
      const w = new FakeWorker(r => (workers.length === 1 ? 'die' : { id: r.id, inspection: inspection(), preview: preview(), header: {} }))
      workers.push(w)
      return asWorker(w)
    })
    await expect(p.open('a.fit', { maxWidth: 10 })).rejects.toThrow(/stopped unexpectedly/)
    await expect(p.open('a.fit', { maxWidth: 10 })).resolves.toEqual({ inspection: inspection(), preview: preview(), header: {} })
    const pending = p.preview('slow.fit', { maxWidth: 10 })
    workers[1].emit('error', new Error('out of memory'))
    await expect(pending).rejects.toThrow('Reading the image failed: out of memory')
    expect(workers).toHaveLength(2)
  })
})
