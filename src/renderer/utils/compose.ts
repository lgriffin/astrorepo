/** A grey preview as the main process sends it, decoded. */
export interface GreyPlane {
  width: number
  height: number
  pixels: Uint8Array
}

/**
 * A palette preview from grey channel previews: each named channel shown as red, green and blue,
 * and a luminance channel, when given, setting the brightness. Channels of different sizes are
 * sampled onto the smallest. Returns RGBA for a canvas.
 */
export function composePalette(
  planes: Record<string, GreyPlane>,
  map: { red: string; green: string; blue: string; luminance: string | null }
): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } | null {
  const used = [map.red, map.green, map.blue, ...(map.luminance ? [map.luminance] : [])].map(c => planes[c])
  if (used.some(p => !p)) return null
  const width = Math.min(...used.map(p => p.width))
  const height = Math.min(...used.map(p => p.height))
  const at = (p: GreyPlane, x: number, y: number) => p.pixels[Math.floor((y * p.height) / height) * p.width + Math.floor((x * p.width) / width)]
  const rgba = new Uint8ClampedArray(width * height * 4)
  const [r, g, b, l] = used
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let cr = at(r, x, y)
      let cg = at(g, x, y)
      let cb = at(b, x, y)
      if (l) {
        // Keep the colour's hue and saturation, take its brightness from luminance.
        const lum = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb
        const k = lum > 0 ? at(l, x, y) / lum : 0
        cr *= k
        cg *= k
        cb *= k
      }
      const i = (y * width + x) * 4
      rgba[i] = cr
      rgba[i + 1] = cg
      rgba[i + 2] = cb
      rgba[i + 3] = 255
    }
  }
  return { width, height, rgba }
}
