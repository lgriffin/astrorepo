import { binBayer, frameFileKind, measureFrame, rawFormatOf, type FrameMeasurement, type Plane } from '@astro/domain'
import { readFitsImage } from './image-reader'

/**
 * Measures one light from its pixels. A colour sensor's raw frame is binned 2×2 to luminance
 * before stars are found (GRD-002); a frame with three channels is summed to one. CPU-bound: the
 * app runs it off the main process (NFR-014).
 */
export async function measureFitsFile(path: string): Promise<FrameMeasurement> {
  // Camera RAW pixels need a RAW decoder the app does not have; the light keeps its place (RIG-005).
  if (frameFileKind(path) === 'raw' || frameFileKind(path) === 'raw-unread') throw new Error(cameraRawNotMeasured(path))
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

/** Why a camera RAW light has no measurement (RIG-005). */
export function cameraRawNotMeasured(path: string): string {
  return `Camera RAW (${rawFormatOf(path) ?? 'RAW'}) pixels are not measured, so this light is not graded and stays in the stack.`
}
