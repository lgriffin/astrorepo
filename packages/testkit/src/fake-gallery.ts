import type { GalleryCatalogue, GalleryImage, ImagePixels, PaletteStore, WcsHeader } from '@astro/application'
import { PREVIEW_MAX_WIDTH, type CatalogueObject, type FilterIntegration, type ImageInspection, type ImagePreview, type PaletteId, type PreviewChannel } from '@astro/domain'

/** An inspection with plausible numbers, for tests that only pass one through. */
export function inspection(overrides: Partial<ImageInspection> = {}): ImageInspection {
  return {
    width: 100,
    height: 80,
    kind: 'mono',
    channels: [{ channel: 'L', histogram: { min: 0, max: 1, counts: [1, 2, 3] }, median: 0.1, noise: 0.01, saturatedShare: 0, blackShare: 0 }],
    star: null,
    sampled: 8000,
    ...overrides
  }
}

/** A grey preview of the given size, filled with one value. */
export function preview(width = 4, height = 3, value = 64, overrides: Partial<ImagePreview> = {}): ImagePreview {
  return { width, height, channels: 1, data: new Uint8Array(width * height).fill(value), scale: 1, sourceWidth: width, sourceHeight: height, ...overrides }
}

/** An image the fake pixels can read: its size, whether it has three channels, and its header's WCS cards. */
export interface FakeImage {
  width: number
  height: number
  colour?: boolean
  header?: WcsHeader
  /** Figures for the inspector, over the plausible ones made from the size. */
  inspection?: Partial<ImageInspection>
}

/** The preview the real reader gives an image of this size, by the domain's shrinking rule, filled with one grey. */
function shrunk(image: FakeImage, maxWidth: number, channel: PreviewChannel = 'colour'): ImagePreview {
  const widest = Math.max(1, Math.min(PREVIEW_MAX_WIDTH, maxWidth))
  const factor = Math.max(1, Math.ceil(image.width / widest))
  const width = Math.max(1, Math.floor(image.width / factor))
  const height = Math.max(1, Math.floor(image.height / factor))
  const channels = image.colour && channel === 'colour' ? 3 : 1
  return { width, height, channels, data: new Uint8Array(width * height * channels).fill(64), scale: 1 / factor, sourceWidth: image.width, sourceHeight: image.height }
}

/**
 * Pixels from a script: each image added answers as the real reader would for its size (a preview
 * at most the width asked, one channel when one is picked); a path with a failure set fails with
 * that reason, and any other path fails as a missing file does.
 */
export class FakeImagePixels implements ImagePixels {
  readonly asked: { op: 'open' | 'preview'; path: string; maxWidth?: number; channel?: PreviewChannel }[] = []
  readonly images = new Map<string, FakeImage>()
  readonly failures = new Map<string, string>()

  add(path: string, image: FakeImage): this {
    this.images.set(path, image)
    return this
  }

  private image(path: string): FakeImage {
    const failure = this.failures.get(path)
    if (failure) throw new Error(failure)
    const image = this.images.get(path)
    if (!image) throw new Error(`ENOENT: no such file or directory: ${path}`)
    return image
  }

  async open(path: string, options: { maxWidth: number }): Promise<{ inspection: ImageInspection; preview: ImagePreview; header: WcsHeader }> {
    this.asked.push({ op: 'open', path, ...options })
    const image = this.image(path)
    const stats = inspection().channels[0]
    const channels = (image.colour ? (['R', 'G', 'B'] as const) : (['L'] as const)).map(channel => ({ ...stats, channel }))
    return {
      inspection: inspection({ width: image.width, height: image.height, kind: image.colour ? 'colour' : 'mono', channels, ...image.inspection }),
      preview: shrunk(image, options.maxWidth),
      header: { ...image.header }
    }
  }

  async preview(path: string, options: { maxWidth: number; channel?: PreviewChannel }): Promise<{ preview: ImagePreview; header: WcsHeader }> {
    this.asked.push({ op: 'preview', path, ...options })
    const image = this.image(path)
    return { preview: shrunk(image, options.maxWidth, options.channel), header: { ...image.header } }
  }
}

/** The index's files, a target's images and integration, and the catalogue, over plain maps. */
export class InMemoryGalleryCatalogue implements GalleryCatalogue {
  readonly files = new Map<string, { path: string; name: string }>()
  readonly images = new Map<string, GalleryImage[]>()
  readonly integration = new Map<string, FilterIntegration[]>()
  objects: CatalogueObject[] = []

  async fileById(fileId: string): Promise<{ path: string; name: string } | null> {
    return this.files.get(fileId) ?? null
  }

  async targetImages(targetId: string): Promise<GalleryImage[]> {
    const time = (i: GalleryImage) => i.modifiedAt?.getTime() ?? 0
    const all = this.images.get(targetId) ?? []
    const of = (kind: GalleryImage['kind']) => all.filter(i => i.kind === kind).sort((a, b) => time(b) - time(a))
    return [...of('master'), ...of('finished')].map(i => ({ ...i }))
  }

  async filterIntegration(targetId: string): Promise<FilterIntegration[]> {
    return (this.integration.get(targetId) ?? []).map(i => ({ ...i }))
  }

  async catalogueObjects(): Promise<CatalogueObject[]> {
    return this.objects.map(o => ({ ...o }))
  }
}

/** Each target's chosen palette in a map. */
export class InMemoryPaletteStore implements PaletteStore {
  readonly choices = new Map<string, PaletteId>()

  async chosen(targetId: string): Promise<PaletteId | null> {
    return this.choices.get(targetId) ?? null
  }

  async choose(targetId: string, palette: PaletteId | null): Promise<void> {
    if (palette === null) this.choices.delete(targetId)
    else this.choices.set(targetId, palette)
  }
}
