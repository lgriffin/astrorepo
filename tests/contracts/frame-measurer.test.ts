import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Worker } from 'worker_threads'
import { afterEach } from 'vitest'
import { FakeFrameMeasurer, measurement } from '@astro/testkit'
import { frameMeasurerContract } from '@astro/testkit/contracts/frame-grades.contract'
import { NodeFrameMeasurer } from '../../src/main/adapters/node-frame-measurer'
import { fitsImage, starfield } from '../helpers/fits'

frameMeasurerContract('fake', async () => {
  const measurer = new FakeFrameMeasurer()
    .set('/data/stars.fit', measurement())
    .set('/data/blank.fit', measurement({ starCount: 2, fwhm: null, eccentricity: null, snr: null }))
    .set('/data/notes.txt', 'This is not a FITS file.')
  return { measurer, starfield: '/data/stars.fit', blank: '/data/blank.fit', notAnImage: '/data/notes.txt', missing: '/data/gone.fit', contents: async () => 'unchanged' }
})

const dirs: string[] = []
const measurers: NodeFrameMeasurer[] = []
afterEach(async () => {
  for (const m of measurers.splice(0)) await m.dispose()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** The app's own measure worker, loaded through tsx since the test runs the TypeScript source. */
const MEASURE_WORKER = path.resolve(__dirname, '../../src/main/workers/measure-worker.ts')
const measureWorker = () => new Worker(`require('tsx/cjs/api').register(); require(${JSON.stringify(MEASURE_WORKER)})`, { eval: true })

const nodeHarness = (measurer: NodeFrameMeasurer) => async () => {
  measurers.push(measurer)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-measure-'))
  dirs.push(dir)
  const write = (name: string, bytes: Buffer) => {
    fs.writeFileSync(path.join(dir, name), bytes)
    return path.join(dir, name)
  }
  return {
    measurer,
    starfield: write('stars.fit', fitsImage(240, 240, [starfield(240, 240, 1.4)])),
    blank: write('blank.fit', fitsImage(240, 240, [starfield(240, 240, 1.4, 0)])),
    notAnImage: write('notes.fit', Buffer.from('hello')),
    missing: path.join(dir, 'gone.fit'),
    contents: async (p: string) => {
      const stat = await fs.promises.stat(p)
      return `${crypto.createHash('sha256').update(await fs.promises.readFile(p)).digest('hex')} ${stat.mtimeMs}`
    }
  }
}

/** Measured in place, as tests and the worker itself measure each frame. */
frameMeasurerContract('Node, in place', () => nodeHarness(new NodeFrameMeasurer())())

/** Measured on the worker thread, as the app does (NFR-014). */
frameMeasurerContract('Node, on the measure worker', () => nodeHarness(new NodeFrameMeasurer(measureWorker))())
