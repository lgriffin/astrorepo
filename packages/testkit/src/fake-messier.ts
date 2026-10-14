import type { MessierCatalogue, MessierObject, TilePicture, TilePictures } from '@astro/application'
import { pictureFormat, type PictureCandidate } from '@astro/domain'

/** A Messier object for a test: M`number` filed under target `m<number>`, with a position unless one is given. */
export function messierObject(number: number, overrides: Partial<MessierObject> = {}): MessierObject {
  return {
    number,
    designation: `M${number}`,
    targetId: `m${number}`,
    name: null,
    objectType: 'galaxy',
    constellation: null,
    magnitude: null,
    raHours: 12,
    decDeg: 40,
    ...overrides
  }
}

/** The Messier catalogue and each target's images over plain maps. */
export class InMemoryMessierCatalogue implements MessierCatalogue {
  readonly list: MessierObject[] = []
  readonly images = new Map<string, PictureCandidate[]>()
  readonly asked: string[] = []

  add(...objects: MessierObject[]): this {
    this.list.push(...objects)
    return this
  }

  /** Adds images to a target's list, as found in its folder or the index. */
  picture(targetId: string, ...pictures: PictureCandidate[]): this {
    this.images.set(targetId, [...(this.images.get(targetId) ?? []), ...pictures])
    return this
  }

  async objects(): Promise<MessierObject[]> {
    const seen = new Set<number>()
    return [...this.list]
      .sort((a, b) => a.number - b.number)
      .filter(o => !seen.has(o.number) && Boolean(seen.add(o.number)))
      .map(o => ({ ...o }))
  }

  async pictures(targetId: string): Promise<PictureCandidate[]> {
    this.asked.push(targetId)
    return (this.images.get(targetId) ?? []).map(p => ({ ...p }))
  }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_MAGIC = [0xff, 0xd8, 0xff]

/**
 * Pictures from a script: each image added draws as the real adapter would for its size (at most
 * the width asked, its shape kept), PNG and FITS as PNG and JPEG and TIFF as JPEG; a path with a
 * failure set fails with that reason, any other path as a missing file, and other formats are refused.
 */
export class FakeTilePictures implements TilePictures {
  readonly asked: { path: string; maxWidth: number; stretch: boolean }[] = []
  readonly images = new Map<string, { width: number; height: number }>()
  readonly failures = new Map<string, string>()

  add(path: string, size: { width: number; height: number }): this {
    this.images.set(path, size)
    return this
  }

  async draw(path: string, options: { maxWidth: number; stretch: boolean }): Promise<TilePicture> {
    this.asked.push({ path, ...options })
    const format = pictureFormat(path)
    if (!format) throw new Error('The mosaic draws JPEG, PNG, TIFF and FITS images only.')
    const failure = this.failures.get(path)
    if (failure) throw new Error(failure)
    const image = this.images.get(path)
    if (!image) throw new Error(`ENOENT: no such file or directory: ${path}`)
    const factor = Math.max(1, Math.ceil(image.width / Math.max(1, options.maxWidth)))
    const width = Math.max(1, Math.floor(image.width / factor))
    const height = Math.max(1, Math.floor(image.height / factor))
    const jpeg = format === 'jpeg' || format === 'tiff'
    return { mime: jpeg ? 'image/jpeg' : 'image/png', data: Uint8Array.from(jpeg ? JPEG_MAGIC : PNG_MAGIC), width, height }
  }
}
