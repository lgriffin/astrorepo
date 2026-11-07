import { toGalleryImagesView, toPalettePreviewView, toPalettesView, toPreviewView } from '../../adapters/gallery-presenter'
import { toDetailsView, toGalleryView, toPictureData } from '../../adapters/picture-gallery-presenter'
import { toMessierMosaicView, toMessierPictureView } from '../../adapters/messier-presenter'
import { MessierRefusedError } from '@astro/application'
import type { Desktop } from '../../transport/desktop'
import { validated, type Handle } from './validated'
import { pictures, pictureRefusal, galleryRefusal, gallery, messier } from './shared'

/** The gallery and the Messier mosaic. */
export function registerGalleryChannels(handle: Handle, desktop: Desktop): void {
  handle('gallery:browse', async () => toGalleryView(await pictures().browse()))

  handle('gallery:details', validated('gallery:details', args => pictureRefusal(async () => toDetailsView(await pictures().details(args.path)))))

  handle('gallery:picture', validated('gallery:picture', args => pictureRefusal(async () => toPictureData(await pictures().picture(args.path, args.max_width)))))

  handle('gallery:open-reference', validated('gallery:open-reference', async args => {
    const url = await pictures().reference(args.object_id, args.site)
    if (!url) return { opened: false }
    await desktop.openExternal(url)
    return { opened: true }
  }))

  handle('gallery:images', validated('gallery:images', async args => toGalleryImagesView(await gallery().images(args.target_id))))

  handle('gallery:preview', validated('gallery:preview', args =>
    galleryRefusal(async () => toPreviewView(await gallery().previewImage(args.target_id, args.path)))
  ))

  // The Messier mosaic (specs/032-messier-mosaic): the window names an object by number, never a path.
  handle('messier:mosaic', async () => toMessierMosaicView(await messier().mosaic()))

  handle('messier:picture', validated('messier:picture', async args => {
    try {
      return toMessierPictureView(await messier().picture(args.number, args.max_width))
    } catch (error) {
      if (error instanceof MessierRefusedError) return { refused: error.message }
      throw error
    }
  }))

  handle('gallery:palettes', validated('gallery:palettes', async args => toPalettesView(await gallery().palettes(args.target_id))))

  handle('gallery:palette-preview', validated('gallery:palette-preview', args =>
    galleryRefusal(async () => toPalettePreviewView(await gallery().palettePreview(args.target_id, args.palette), args.palette))
  ))

  handle('gallery:choose-palette', validated('gallery:choose-palette', args =>
    galleryRefusal(async () => {
      await gallery().choosePalette(args.target_id, args.palette)
      return { ok: true }
    })
  ))
}
