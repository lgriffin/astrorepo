import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
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
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** Measured in place, as the worker thread measures each frame. */
frameMeasurerContract('Node', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-measure-'))
  dirs.push(dir)
  const write = (name: string, bytes: Buffer) => {
    fs.writeFileSync(path.join(dir, name), bytes)
    return path.join(dir, name)
  }
  return {
    measurer: new NodeFrameMeasurer(),
    starfield: write('stars.fit', fitsImage(240, 240, [starfield(240, 240, 1.4)])),
    blank: write('blank.fit', fitsImage(240, 240, [starfield(240, 240, 1.4, 0)])),
    notAnImage: write('notes.fit', Buffer.from('hello')),
    missing: path.join(dir, 'gone.fit'),
    contents: async p => {
      const stat = await fs.promises.stat(p)
      return `${crypto.createHash('sha256').update(await fs.promises.readFile(p)).digest('hex')} ${stat.mtimeMs}`
    }
  }
})
