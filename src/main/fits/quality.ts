import fs from 'fs'

const BLOCK_SIZE = 2880

function readPixelValue(buf: Buffer, offset: number, bitpix: number, bscale: number, bzero: number): number {
  let raw: number
  switch (bitpix) {
    case 8:
      raw = buf.readUInt8(offset)
      break
    case 16:
      raw = buf.readInt16BE(offset)
      break
    case 32:
      raw = buf.readInt32BE(offset)
      break
    case -32:
      raw = buf.readFloatBE(offset)
      break
    case -64:
      raw = buf.readDoubleBE(offset)
      break
    default:
      raw = 0
  }
  return raw * bscale + bzero
}

function samplePixels(
  filePath: string,
  headerBlockCount: number,
  bitpix: number,
  naxis1: number,
  naxis2: number,
  bscale: number,
  bzero: number,
  sampleSize: number = 10000
): number[] {
  const bytesPerPixel = Math.abs(bitpix) / 8
  const totalPixels = naxis1 * naxis2
  const dataOffset = headerBlockCount * BLOCK_SIZE
  const step = Math.max(1, Math.floor(totalPixels / sampleSize))

  const fd = fs.openSync(filePath, 'r')
  try {
    const fileSize = fs.fstatSync(fd).size
    const dataLength = totalPixels * bytesPerPixel
    if (dataOffset + dataLength > fileSize) return []

    const pixelBuf = Buffer.alloc(bytesPerPixel)
    const samples: number[] = []

    for (let i = 0; i < totalPixels; i += step) {
      const pixelOffset = dataOffset + i * bytesPerPixel
      const bytesRead = fs.readSync(fd, pixelBuf, 0, bytesPerPixel, pixelOffset)
      if (bytesRead < bytesPerPixel) break
      const val = readPixelValue(pixelBuf, 0, bitpix, bscale, bzero)
      if (Number.isFinite(val)) {
        samples.push(val)
      }
    }

    return samples
  } finally {
    fs.closeSync(fd)
  }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function estimateBackground(
  filePath: string,
  headerBlockCount: number,
  bitpix: number,
  naxis1: number,
  naxis2: number,
  bscale: number,
  bzero: number
): number {
  const samples = samplePixels(filePath, headerBlockCount, bitpix, naxis1, naxis2, bscale, bzero)
  if (samples.length === 0) return 0
  return median(samples)
}

export function estimateNoise(
  filePath: string,
  headerBlockCount: number,
  bitpix: number,
  naxis1: number,
  naxis2: number,
  bscale: number,
  bzero: number
): number {
  const samples = samplePixels(filePath, headerBlockCount, bitpix, naxis1, naxis2, bscale, bzero)
  if (samples.length === 0) return 0

  const med = median(samples)
  const absDeviations = samples.map(v => Math.abs(v - med))
  const mad = median(absDeviations)
  return 1.4826 * mad
}

export function estimateFwhm(
  filePath: string,
  headerBlockCount: number,
  bitpix: number,
  naxis1: number,
  naxis2: number,
  bscale: number,
  bzero: number,
  background: number,
  noise: number
): number | null {
  if (noise <= 0) return null

  const step = Math.max(1, Math.floor(Math.max(naxis1, naxis2) / 512))
  const subW = Math.floor(naxis1 / step)
  const subH = Math.floor(naxis2 / step)

  if (subW < 3 || subH < 3) return null

  const bytesPerPixel = Math.abs(bitpix) / 8
  const dataOffset = headerBlockCount * BLOCK_SIZE

  const fd = fs.openSync(filePath, 'r')
  try {
    const fileSize = fs.fstatSync(fd).size
    const totalDataBytes = naxis1 * naxis2 * bytesPerPixel
    if (dataOffset + totalDataBytes > fileSize) return null

    // Read subsampled image
    const subImage: number[] = new Array(subW * subH)
    const pixelBuf = Buffer.alloc(bytesPerPixel)

    for (let sy = 0; sy < subH; sy++) {
      const iy = sy * step
      for (let sx = 0; sx < subW; sx++) {
        const ix = sx * step
        const pixelIndex = iy * naxis1 + ix
        const pixelOffset = dataOffset + pixelIndex * bytesPerPixel
        fs.readSync(fd, pixelBuf, 0, bytesPerPixel, pixelOffset)
        subImage[sy * subW + sx] = readPixelValue(pixelBuf, 0, bitpix, bscale, bzero)
      }
    }

    // Find bright pixels (peaks above threshold that are local maxima)
    const threshold = background + 5 * noise
    const peaks: { x: number; y: number; val: number }[] = []

    for (let y = 1; y < subH - 1; y++) {
      for (let x = 1; x < subW - 1; x++) {
        const val = subImage[y * subW + x]
        if (val <= threshold) continue

        // Check 8 neighbors
        let isPeak = true
        for (let dy = -1; dy <= 1 && isPeak; dy++) {
          for (let dx = -1; dx <= 1 && isPeak; dx++) {
            if (dx === 0 && dy === 0) continue
            if (subImage[(y + dy) * subW + (x + dx)] >= val) {
              isPeak = false
            }
          }
        }

        if (isPeak) {
          peaks.push({ x, y, val })
        }
      }
    }

    if (peaks.length < 3) return null

    // Sort by brightness, take top 20
    peaks.sort((a, b) => b.val - a.val)
    const topPeaks = peaks.slice(0, 20)

    // Estimate FWHM for each peak using half-flux radius
    const fwhmEstimates: number[] = []

    for (const peak of topPeaks) {
      const halfFlux = (peak.val + background) / 2
      let radius = 0

      // Expand radius until average value at that radius drops below half-flux
      for (let r = 1; r <= 10; r++) {
        let ringSum = 0
        let ringCount = 0

        // Sample points on the ring
        for (let angle = 0; angle < 8; angle++) {
          const dx = Math.round(r * Math.cos(angle * Math.PI / 4))
          const dy = Math.round(r * Math.sin(angle * Math.PI / 4))
          const nx = peak.x + dx
          const ny = peak.y + dy

          if (nx >= 0 && nx < subW && ny >= 0 && ny < subH) {
            ringSum += subImage[ny * subW + nx]
            ringCount++
          }
        }

        if (ringCount === 0) break
        const ringAvg = ringSum / ringCount

        if (ringAvg <= halfFlux) {
          // Interpolate between r-1 and r
          radius = r - 0.5
          break
        }
        radius = r
      }

      if (radius > 0 && radius < 10) {
        fwhmEstimates.push(radius * 2)
      }
    }

    if (fwhmEstimates.length === 0) return null

    const avgFwhm = fwhmEstimates.reduce((s, v) => s + v, 0) / fwhmEstimates.length
    return avgFwhm * step
  } finally {
    fs.closeSync(fd)
  }
}

export function estimateStarCount(
  filePath: string,
  headerBlockCount: number,
  bitpix: number,
  naxis1: number,
  naxis2: number,
  bscale: number,
  bzero: number,
  background: number,
  noise: number
): number {
  if (noise <= 0) return 0

  const step = Math.max(1, Math.floor(Math.max(naxis1, naxis2) / 512))
  const subW = Math.floor(naxis1 / step)
  const subH = Math.floor(naxis2 / step)

  if (subW < 3 || subH < 3) return 0

  const bytesPerPixel = Math.abs(bitpix) / 8
  const dataOffset = headerBlockCount * BLOCK_SIZE

  const fd = fs.openSync(filePath, 'r')
  try {
    const fileSize = fs.fstatSync(fd).size
    const totalDataBytes = naxis1 * naxis2 * bytesPerPixel
    if (dataOffset + totalDataBytes > fileSize) return 0

    // Read subsampled image
    const subImage: number[] = new Array(subW * subH)
    const pixelBuf = Buffer.alloc(bytesPerPixel)

    for (let sy = 0; sy < subH; sy++) {
      const iy = sy * step
      for (let sx = 0; sx < subW; sx++) {
        const ix = sx * step
        const pixelIndex = iy * naxis1 + ix
        const pixelOffset = dataOffset + pixelIndex * bytesPerPixel
        fs.readSync(fd, pixelBuf, 0, bytesPerPixel, pixelOffset)
        subImage[sy * subW + sx] = readPixelValue(pixelBuf, 0, bitpix, bscale, bzero)
      }
    }

    // Count local maxima above threshold
    const threshold = background + 3 * noise
    let count = 0

    for (let y = 1; y < subH - 1; y++) {
      for (let x = 1; x < subW - 1; x++) {
        const val = subImage[y * subW + x]
        if (val <= threshold) continue

        let isPeak = true
        for (let dy = -1; dy <= 1 && isPeak; dy++) {
          for (let dx = -1; dx <= 1 && isPeak; dx++) {
            if (dx === 0 && dy === 0) continue
            if (subImage[(y + dy) * subW + (x + dx)] >= val) {
              isPeak = false
            }
          }
        }

        if (isPeak) count++
      }
    }

    // Scale by step^2 to approximate full-resolution count
    return count * step * step
  } finally {
    fs.closeSync(fd)
  }
}
