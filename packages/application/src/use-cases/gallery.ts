import {
  channelSources,
  overlayFieldFromWcs,
  isPalettePossible,
  PALETTES,
  paletteChannels,
  possiblePalettes,
  PREVIEW_MAX_WIDTH,
  skyOverlay,
  type CatalogueObject,
  type ChannelSource,
  type FieldGeometry,
  type ImageInspection,
  type ImagePreview,
  type PaletteChannel,
  type PaletteId,
  type PaletteOption,
  type PaletteSpec,
  type SkyOverlay,
  type SolveSource
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { GalleryCatalogue, GalleryImage, ImagePixels, PaletteStore } from '../ports/gallery'
import type { SolveStore } from '../ports/sky-geometry'

export interface GalleryDeps {
  pixels: ImagePixels
  catalogue: GalleryCatalogue
  palettes: PaletteStore
  clock: Clock
  /** Plate solves stored by path (specs/024-sky-geometry), for images whose headers carry no WCS (INS-012). */
  solves?: Pick<SolveStore, 'solves'>
}

/** A request the gallery turns down, with a reason the user can act on. */
export class GalleryRefusedError extends Error {}

/** What reading an image's pixels gave, or why it could not be read (INS-003). */
export type Read<T> = ({ ok: true } & T) | { ok: false; error: string }

export interface ShownImage {
  preview: ImagePreview
  /** Where the image points, when its header carries a world coordinate system. */
  field: FieldGeometry | null
  /** Where the field came from: the file's own header, or the solver of a stored plate solve; null without a field. */
  fieldSource: SolveSource | null
  /** The coordinate grid and catalogue labels, scaled to the preview; null without a field. */
  overlay: SkyOverlay | null
}

export interface TargetPalettes {
  options: PaletteOption[]
  sources: ChannelSource[]
  chosen: PaletteId | null
}

/** Width of each channel's preview for a palette: enough to judge colour, small to send. */
export const PALETTE_PREVIEW_WIDTH = 320

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * The image inspector, palette suggestions and compare view (spec 025). Every pixel is read
 * through ImagePixels, off the main process; only statistics and small previews come back.
 */
export function makeGallery(deps: GalleryDeps) {
  let objects: Promise<CatalogueObject[]> | null = null
  const catalogue = () => (objects ??= deps.catalogue.catalogueObjects())

  /**
   * The stored plate solve of a file whose header has no WCS (INS-012), when it solved and was
   * made over an image of the same size, so a file replaced since its solve gets no overlay.
   */
  const storedField = async (path: string, preview: ImagePreview): Promise<{ field: FieldGeometry; source: SolveSource } | null> => {
    if (!deps.solves) return null
    const stored = (await deps.solves.solves([path])).find(s => s.path === path)
    const field = stored?.field
    if (!stored || !field || field.widthPx !== preview.sourceWidth || field.heightPx !== preview.sourceHeight) return null
    return { field, source: stored.source }
  }

  const show = async (path: string): Promise<ShownImage> => {
    const { preview, header } = await deps.pixels.preview(path, { maxWidth: PREVIEW_MAX_WIDTH })
    const fromHeader = overlayFieldFromWcs(header)
    const solved = fromHeader ? null : await storedField(path, preview)
    const field: FieldGeometry | null = fromHeader ?? solved?.field ?? null
    const fieldSource: SolveSource | null = fromHeader ? 'header' : (solved?.source ?? null)
    return { preview, field, fieldSource, overlay: field ? skyOverlay(field, await catalogue(), preview.scale) : null }
  }

  const imageOf = async (targetId: string, path: string): Promise<GalleryImage> => {
    const image = (await deps.catalogue.targetImages(targetId)).find(i => i.path === path)
    // The window names an image; only the target's own are ever opened.
    if (!image) throw new GalleryRefusedError('That image is not one of this target’s masters or finished images. Scan the library and try again.')
    return image
  }

  const palettes = async (targetId: string): Promise<TargetPalettes> => {
    const [images, integration, chosen] = await Promise.all([
      deps.catalogue.targetImages(targetId),
      deps.catalogue.filterIntegration(targetId),
      deps.palettes.chosen(targetId)
    ])
    const sources = channelSources(images.filter(i => i.kind === 'master'), integration)
    return { options: possiblePalettes(sources), sources, chosen }
  }

  return {
    /** Histograms, clipping, noise and the brightest star of an indexed FITS file (INS-001, INS-002). */
    async inspectFile(fileId: string): Promise<Read<{ path: string; name: string; inspection: ImageInspection }> | null> {
      const file = await deps.catalogue.fileById(fileId)
      if (!file) return null
      try {
        return { ok: true, ...file, inspection: await deps.pixels.inspect(file.path) }
      } catch (error) {
        return { ok: false, error: reason(error) }
      }
    },

    /** A preview of an indexed FITS file, with the grid and labels when its header is solved (INS-011). */
    async previewFile(fileId: string): Promise<Read<ShownImage> | null> {
      const file = await deps.catalogue.fileById(fileId)
      if (!file) return null
      try {
        return { ok: true, ...(await show(file.path)) }
      } catch (error) {
        return { ok: false, error: reason(error) }
      }
    },

    /** The target's masters and finished images, for picking two to compare (INS-007). */
    images: (targetId: string) => deps.catalogue.targetImages(targetId),

    /** One of the target's images as a preview, refusing any other path (INS-008). */
    async previewImage(targetId: string, path: string): Promise<Read<ShownImage & { image: GalleryImage }>> {
      const image = await imageOf(targetId, path)
      try {
        return { ok: true, image, ...(await show(path)) }
      } catch (error) {
        return { ok: false, error: reason(error) }
      }
    },

    palettes,

    /** The palette chosen for the target, for the post-processing step's hint (INS-006). */
    chosenPalette: (targetId: string) => deps.palettes.chosen(targetId),

    /**
     * Each channel of a palette as a small grey preview, for the window to colour and combine
     * (INS-005). Refuses a palette whose channels are not all stacked.
     */
    async palettePreview(targetId: string, id: PaletteId): Promise<Read<{ palette: PaletteSpec; channels: Partial<Record<PaletteChannel, ImagePreview>> }>> {
      const option = (await palettes(targetId)).options.find(o => o.id === id)
      const needs = paletteChannels(id)
      if (!option || needs.some(c => !option.sources[c])) {
        throw new GalleryRefusedError(`A ${id} preview needs a stack of every channel it uses (${needs.join(', ')}).`)
      }
      try {
        const channels: Partial<Record<PaletteChannel, ImagePreview>> = {}
        for (const c of needs) {
          const source = option.sources[c]!
          channels[c] = (await deps.pixels.preview(source.path, { maxWidth: PALETTE_PREVIEW_WIDTH, channel: source.from })).preview
        }
        return { ok: true, palette: PALETTES[id], channels }
      } catch (error) {
        return { ok: false, error: reason(error) }
      }
    },

    /** Saves the palette chosen for the target, refusing one its filters do not allow (INS-006). */
    async choosePalette(targetId: string, id: string | null): Promise<void> {
      if (id !== null) {
        const { options } = await palettes(targetId)
        if (!isPalettePossible(id, options)) {
          throw new GalleryRefusedError(`${id} needs filters this target has not been captured with, so it cannot be chosen yet.`)
        }
      }
      await deps.palettes.choose(targetId, id as PaletteId | null, deps.clock.now())
    }
  }
}

export type Gallery = ReturnType<typeof makeGallery>
