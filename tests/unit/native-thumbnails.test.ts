import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const decoded: string[] = []
const image = (width: number) => ({
  isEmpty: () => width === 0,
  getSize: () => ({ width, height: width / 2 }),
  resize: ({ width: w }: { width: number }) => image(w),
  toJPEG: () => Buffer.from([1, 2, 3])
})

vi.mock('electron', () => ({
  nativeImage: {
    createThumbnailFromPath: () => Promise.reject(new Error('no system thumbnail')),
    createFromPath: (p: string) => {
      decoded.push(p)
      return image(p.includes('broken') ? 0 : 1000)
    }
  }
}))

const { NATIVE_DECODE_MAX_BYTES, nativeThumbnail } = await import('../../src/main/electron/native-thumbnails')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'))
const file = (name: string, bytes: number) => {
  const p = path.join(dir, name)
  fs.writeFileSync(p, Buffer.alloc(bytes))
  return p
}

afterEach(() => {
  decoded.length = 0
})

describe('Native thumbnails for the Messier mosaic', () => {
  it('[MES-003] Given a JPEG with no system thumbnail, When drawn, Then it is decoded and drawn no wider than asked', async () => {
    const picture = await nativeThumbnail(file('m31.jpg', 10), 256)
    expect(picture).toEqual({ mime: 'image/jpeg', data: Uint8Array.from([1, 2, 3]), width: 256, height: 128 })
    expect(decoded).toHaveLength(1)
  })

  it('[MES-004] Given a TIFF with no system thumbnail, When drawn, Then it fails with the reason and is never decoded', async () => {
    await expect(nativeThumbnail(file('m31.tif', 10), 256)).rejects.toThrow('TIFF images are drawn on Windows and macOS only.')
    expect(decoded).toEqual([])
  })

  it('[MES-004] [MES-012] Given a JPEG too large to decode on the main process, When drawn, Then it fails with its size and is never decoded', async () => {
    await expect(nativeThumbnail(file('huge.jpg', NATIVE_DECODE_MAX_BYTES + 1), 256)).rejects.toThrow(/too large to draw here \(25 MB\)/)
    expect(decoded).toEqual([])
  })

  it('[MES-004] Given a JPEG that does not decode, When drawn, Then it fails with the reason', async () => {
    await expect(nativeThumbnail(file('broken.jpg', 10), 256)).rejects.toThrow('The image could not be decoded here.')
  })
})
