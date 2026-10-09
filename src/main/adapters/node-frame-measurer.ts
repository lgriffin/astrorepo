import type { FrameMeasurer } from '@astro/application'
import { binBayer, measureFrame, type FrameMeasurement, type Plane } from '@astro/domain'
import { readFitsImage } from '../fits/image-reader'

/**
 * FrameMeasurer over the FITS files on disk. A colour sensor's raw frame is binned 2×2 to
 * luminance before stars are found (GRD-002); a frame with three channels is summed to one.
 */
export class NodeFrameMeasurer implements FrameMeasurer {
  async measure(path: string): Promise<FrameMeasurement> {
    const image = await readFitsImage(path)
    let plane: Plane = { width: image.width, height: image.height, data: image.planes[0] }
    if (image.planes.length > 1) {
      const sum = new Float32Array(image.width * image.height)
      for (const p of image.planes) for (let i = 0; i < sum.length; i++) sum[i] += p[i]
      plane = { ...plane, data: sum }
    }
    const binned = image.bayer !== null && image.planes.length === 1
    if (binned) plane = binBayer(plane)
    // A binned pixel sums four: two at full scale is a star core that clipped.
    const saturation = image.saturation === null ? null : 0.98 * image.saturation * (binned ? 2 : image.planes.length)
    return measureFrame(plane, { binned, search: { saturation } })
  }
}
