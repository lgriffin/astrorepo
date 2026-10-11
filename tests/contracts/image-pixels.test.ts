import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach } from 'vitest'
import { FakeImagePixels } from '@astro/testkit'
import { imagePixelsContract } from '@astro/testkit/contracts/image-pixels.contract'
import { NodeImagePixels } from '../../src/main/adapters/node-image-pixels'
import { fitsImage } from '../helpers/fits'

imagePixelsContract('fake', async images => {
  const pixels = new FakeImagePixels()
  for (const i of images) pixels.add(`/fits/${i.name}`, { width: i.width, height: i.height, colour: i.colour, header: i.wcs })
  pixels.failures.set('/fits/notes.jpg', 'This is not a FITS file.')
  return { pixels, path: name => `/fits/${name}`, notAnImage: '/fits/notes.jpg', missing: '/fits/gone.fit' }
})

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** Read in place, as the worker thread reads each image. */
imagePixelsContract('Node', async images => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-pixels-'))
  dirs.push(dir)
  for (const i of images) {
    const plane = Array.from({ length: i.width * i.height }, (_, n) => 1000 + (n % 7) * 10)
    fs.writeFileSync(path.join(dir, i.name), fitsImage(i.width, i.height, i.colour ? [plane, plane, plane] : [plane], { cards: i.wcs }))
  }
  fs.writeFileSync(path.join(dir, 'notes.jpg'), Buffer.alloc(3000, 0xff))
  return { pixels: new NodeImagePixels(), path: name => path.join(dir, name), notAnImage: path.join(dir, 'notes.jpg'), missing: path.join(dir, 'gone.fit') }
})
