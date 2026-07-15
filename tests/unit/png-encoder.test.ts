import { describe, it, expect } from 'vitest'
import { encodeGreyscalePng } from '../../src/main/fits/png-encoder'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('PNG Encoder', () => {
  // --- Existence ---

  it('exports encodeGreyscalePng function', () => {
    expect(typeof encodeGreyscalePng).toBe('function')
  })

  // --- Action ---

  it('encoded output starts with PNG magic bytes', () => {
    const pixels = new Uint8Array([128])
    const result = encodeGreyscalePng(1, 1, pixels)

    expect(result.subarray(0, 8)).toEqual(PNG_MAGIC)
  })

  it('encoded output has valid IHDR chunk with correct dimensions', () => {
    const width = 16
    const height = 32
    const pixels = new Uint8Array(width * height).fill(100)
    const result = encodeGreyscalePng(width, height, pixels)

    // After 8-byte magic, next is IHDR chunk: length(4) + 'IHDR'(4) + data(13) + CRC(4)
    const chunkLength = result.readUInt32BE(8)
    expect(chunkLength).toBe(13) // IHDR data is always 13 bytes

    const chunkType = result.toString('ascii', 12, 16)
    expect(chunkType).toBe('IHDR')

    const ihdrWidth = result.readUInt32BE(16)
    const ihdrHeight = result.readUInt32BE(20)
    expect(ihdrWidth).toBe(width)
    expect(ihdrHeight).toBe(height)

    // Bit depth 8, color type 0 (greyscale)
    expect(result[24]).toBe(8)
    expect(result[25]).toBe(0)
  })

  it('1x1 pixel produces valid PNG', () => {
    const pixels = new Uint8Array([255])
    const result = encodeGreyscalePng(1, 1, pixels)

    // Should have magic + IHDR + IDAT + IEND
    expect(result.length).toBeGreaterThan(8 + 25 + 12) // magic + IHDR(25) + IEND(12) minimum
    expect(result.subarray(0, 8)).toEqual(PNG_MAGIC)

    // Verify IEND chunk at the end: length(4) + type(4) + crc(4) = 12 bytes
    // type starts at length - 8 from the end (after 4-byte length, before 4-byte crc)
    const iendLength = result.readUInt32BE(result.length - 12)
    expect(iendLength).toBe(0)
    const iendType = result.toString('ascii', result.length - 8, result.length - 4)
    expect(iendType).toBe('IEND')
  })

  it('4x4 pixel produces valid PNG', () => {
    const pixels = new Uint8Array(16)
    for (let i = 0; i < 16; i++) {
      pixels[i] = i * 16
    }
    const result = encodeGreyscalePng(4, 4, pixels)

    expect(result.subarray(0, 8)).toEqual(PNG_MAGIC)
    expect(result.length).toBeGreaterThan(50) // reasonable minimum size

    // IHDR dimensions
    const ihdrWidth = result.readUInt32BE(16)
    const ihdrHeight = result.readUInt32BE(20)
    expect(ihdrWidth).toBe(4)
    expect(ihdrHeight).toBe(4)

    // IEND at the end: length(4) + type(4) + crc(4) = 12 bytes
    const iendType = result.toString('ascii', result.length - 8, result.length - 4)
    expect(iendType).toBe('IEND')
  })

  // --- Result ---

  it('produces a Buffer output', () => {
    const pixels = new Uint8Array([0, 128, 255, 64])
    const result = encodeGreyscalePng(2, 2, pixels)
    expect(Buffer.isBuffer(result)).toBe(true)
  })

  // --- Surprise ---

  it('handles all-zero pixels', () => {
    const pixels = new Uint8Array(9).fill(0)
    const result = encodeGreyscalePng(3, 3, pixels)
    expect(result.subarray(0, 8)).toEqual(PNG_MAGIC)
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles all-white pixels', () => {
    const pixels = new Uint8Array(9).fill(255)
    const result = encodeGreyscalePng(3, 3, pixels)
    expect(result.subarray(0, 8)).toEqual(PNG_MAGIC)
    expect(result.length).toBeGreaterThan(0)
  })
})
