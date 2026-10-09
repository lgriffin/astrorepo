import type { GalleryCatalogue, GalleryImage, ImagePixels, PaletteStore, WcsHeader } from '@astro/application'
import type { CatalogueObject, FilterIntegration, ImageInspection, ImagePreview, PaletteId, PreviewChannel } from '@astro/domain'

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

/** Pixels from a script: each path answers with what it was given, or fails with its reason. */
export class FakeImagePixels implements ImagePixels {
  readonly asked: { op: 'inspect' | 'preview'; path: string; maxWidth?: number; channel?: PreviewChannel }[] = []
  readonly inspections = new Map<string, ImageInspection>()
  readonly previews = new Map<string, { preview: ImagePreview; header: WcsHeader }>()
  readonly failures = new Map<string, string>()

  async inspect(path: string): Promise<ImageInspection> {
    this.asked.push({ op: 'inspect', path })
    const failure = this.failures.get(path)
    if (failure) throw new Error(failure)
    return this.inspections.get(path) ?? inspection()
  }

  async preview(path: string, options: { maxWidth: number; channel?: PreviewChannel }): Promise<{ preview: ImagePreview; header: WcsHeader }> {
    this.asked.push({ op: 'preview', path, ...options })
    const failure = this.failures.get(path)
    if (failure) throw new Error(failure)
    return this.previews.get(path) ?? { preview: preview(), header: {} }
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
