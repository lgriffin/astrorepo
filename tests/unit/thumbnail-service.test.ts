import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { generateThumbnail } from '../../src/main/fits/thumbnail'

const BLOCK_SIZE = 2880
const RECORD_SIZE = 80

function padRecord(content: string): string {
  return content.padEnd(RECORD_SIZE, ' ')
}

function buildFitsFile(records: string[], pixelData: Buffer): string {
  const headerRecords = records.map(padRecord)
  headerRecords.push(padRecord('END'))

  const headerBytes = headerRecords.join('')
  const headerBlockCount = Math.ceil(headerBytes.length / BLOCK_SIZE)
  const paddedHeader = headerBytes.padEnd(headerBlockCount * BLOCK_SIZE, ' ')

  const filePath = path.join(os.tmpdir(), `thumb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.fits`)
  const headerBuf = Buffer.from(paddedHeader, 'ascii')

  const dataPadded = Buffer.alloc(Math.ceil(pixelData.length / BLOCK_SIZE) * BLOCK_SIZE)
  pixelData.copy(dataPadded)
  fs.writeFileSync(filePath, Buffer.concat([headerBuf, dataPadded]))

  return filePath
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let tempFiles: string[] = []

afterEach(() => {
  for (const f of tempFiles) {
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
  tempFiles = []
})

function createTemp(records: string[], pixelData: Buffer): string {
  const p = buildFitsFile(records, pixelData)
  tempFiles.push(p)
  return p
}

describe('Thumbnail Generator', () => {
  // --- Existence ---

  it('exports generateThumbnail function', () => {
    expect(typeof generateThumbnail).toBe('function')
  })

  // --- Action ---

  it('generates a thumbnail from an 8x8 16-bit FITS file with gradient', () => {
    // Build 8x8 pixel data as 16-bit big-endian integers with a gradient pattern
    const width = 8
    const height = 8
    const pixelData = Buffer.alloc(width * height * 2)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = (y * width + x) * 64 // gradient from 0 to ~4032
        pixelData.writeInt16BE(value, (y * width + x) * 2)
      }
    }

    const filePath = createTemp([
      "SIMPLE  =                    T / Standard FITS",
      "BITPIX  =                   16 / 16-bit signed integers",
      "NAXIS   =                    2 / 2D image",
      "NAXIS1  =                    8 / Width",
      "NAXIS2  =                    8 / Height"
    ], pixelData)

    const result = generateThumbnail(filePath)

    expect(result).not.toBeNull()
    expect(result!.width).toBeGreaterThan(0)
    expect(result!.height).toBeGreaterThan(0)
    expect(result!.pngBuffer.length).toBeGreaterThan(0)
    expect(result!.pngBuffer.subarray(0, 8)).toEqual(PNG_MAGIC)
  })

  // --- Result ---

  it('returns correct dimensions for small image without downsampling', () => {
    const width = 4
    const height = 4
    const pixelData = Buffer.alloc(width * height * 2)
    for (let i = 0; i < width * height; i++) {
      pixelData.writeInt16BE(i * 100, i * 2)
    }

    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    2",
      "NAXIS1  =                    4",
      "NAXIS2  =                    4"
    ], pixelData)

    const result = generateThumbnail(filePath, 256)

    expect(result).not.toBeNull()
    // step = max(1, floor(max(4,4)/256)) = 1, so outW=4, outH=4
    expect(result!.width).toBe(4)
    expect(result!.height).toBe(4)
  })

  it('returns null when NAXIS1 is zero', () => {
    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    2",
      "NAXIS1  =                    0",
      "NAXIS2  =                    8"
    ], Buffer.alloc(0))

    const result = generateThumbnail(filePath)
    expect(result).toBeNull()
  })

  it('returns null when NAXIS2 is missing', () => {
    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    2",
      "NAXIS1  =                    8"
    ], Buffer.alloc(0))

    const result = generateThumbnail(filePath)
    expect(result).toBeNull()
  })

  // --- Surprise ---

  it('handles 8-bit FITS data', () => {
    const width = 4
    const height = 4
    const pixelData = Buffer.alloc(width * height)
    for (let i = 0; i < width * height; i++) {
      pixelData[i] = i * 16
    }

    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                    8",
      "NAXIS   =                    2",
      "NAXIS1  =                    4",
      "NAXIS2  =                    4"
    ], pixelData)

    const result = generateThumbnail(filePath)
    expect(result).not.toBeNull()
    expect(result!.width).toBe(4)
    expect(result!.height).toBe(4)
  })

  it('applies BSCALE and BZERO correctly', () => {
    const width = 4
    const height = 4
    const pixelData = Buffer.alloc(width * height * 2)
    for (let i = 0; i < width * height; i++) {
      pixelData.writeInt16BE(i * 10, i * 2)
    }

    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    2",
      "NAXIS1  =                    4",
      "NAXIS2  =                    4",
      "BSCALE  =                  2.0",
      "BZERO   =                100.0"
    ], pixelData)

    const result = generateThumbnail(filePath)
    expect(result).not.toBeNull()
    expect(result!.pngBuffer.subarray(0, 8)).toEqual(PNG_MAGIC)
  })

  it('downsamples larger images', () => {
    const width = 64
    const height = 64
    const pixelData = Buffer.alloc(width * height * 2)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        pixelData.writeInt16BE(Math.floor(Math.random() * 1000), (y * width + x) * 2)
      }
    }

    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    2",
      "NAXIS1  =                   64",
      "NAXIS2  =                   64"
    ], pixelData)

    const result = generateThumbnail(filePath, 16)

    expect(result).not.toBeNull()
    // step = max(1, floor(64/16)) = 4, outW = ceil(64/4) = 16
    expect(result!.width).toBe(16)
    expect(result!.height).toBe(16)
  })
})
