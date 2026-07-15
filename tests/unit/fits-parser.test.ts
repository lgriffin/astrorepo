import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { parseFitsFile, parseFitsHeaders, computeImageStats } from '../../src/main/fits/parser'

const BLOCK_SIZE = 2880
const RECORD_SIZE = 80

function padRecord(content: string): string {
  return content.padEnd(RECORD_SIZE, ' ')
}

function buildFitsFile(records: string[], pixelData?: Buffer): string {
  const headerRecords = records.map(padRecord)
  headerRecords.push(padRecord('END'))

  const headerBytes = headerRecords.join('')
  const headerBlockCount = Math.ceil(headerBytes.length / BLOCK_SIZE)
  const paddedHeader = headerBytes.padEnd(headerBlockCount * BLOCK_SIZE, ' ')

  const filePath = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}.fits`)
  const headerBuf = Buffer.from(paddedHeader, 'ascii')

  if (pixelData) {
    const dataPadded = Buffer.alloc(Math.ceil(pixelData.length / BLOCK_SIZE) * BLOCK_SIZE)
    pixelData.copy(dataPadded)
    fs.writeFileSync(filePath, Buffer.concat([headerBuf, dataPadded]))
  } else {
    fs.writeFileSync(filePath, headerBuf)
  }

  return filePath
}

let tempFiles: string[] = []

afterEach(() => {
  for (const f of tempFiles) {
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
  tempFiles = []
})

function createTemp(records: string[], pixelData?: Buffer): string {
  const p = buildFitsFile(records, pixelData)
  tempFiles.push(p)
  return p
}

describe('FITS Parser', () => {
  it('parses a minimal valid FITS header', () => {
    const filePath = createTemp([
      "SIMPLE  =                    T / Standard FITS",
      "BITPIX  =                   16 / Bits per pixel",
      "NAXIS   =                    0 / No data"
    ])

    const result = parseFitsFile(filePath)
    expect(result.isValid).toBe(true)
    expect(result.headerMap.get('SIMPLE')?.value).toBe(true)
    expect(result.headerMap.get('BITPIX')?.value).toBe(16)
    expect(result.headerMap.get('NAXIS')?.value).toBe(0)
    expect(result.imageStats).toBeNull()
  })

  it('parses string values with single quotes', () => {
    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    0",
      "OBJECT  = 'M31 Andromeda   ' / Target name"
    ])

    const result = parseFitsFile(filePath)
    expect(result.headerMap.get('OBJECT')?.value).toBe('M31 Andromeda')
    expect(result.headerMap.get('OBJECT')?.comment).toBe('Target name')
  })

  it('parses numeric values', () => {
    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    0",
      "EXPTIME =              300.000 / Exposure time in seconds",
      "CCD-TEMP=              -10.500 / CCD temperature"
    ])

    const result = parseFitsFile(filePath)
    expect(result.headerMap.get('EXPTIME')?.value).toBe(300)
    expect(result.headerMap.get('CCD-TEMP')?.value).toBe(-10.5)
  })

  it('parses boolean values', () => {
    const filePath = createTemp([
      "SIMPLE  =                    T / true",
      "BITPIX  =                   16",
      "NAXIS   =                    0",
      "EXTEND  =                    F / no extensions"
    ])

    const result = parseFitsFile(filePath)
    expect(result.headerMap.get('SIMPLE')?.value).toBe(true)
    expect(result.headerMap.get('EXTEND')?.value).toBe(false)
  })

  it('parses COMMENT and HISTORY records', () => {
    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    0",
      "COMMENT  This is a comment record",
      "HISTORY  Processed with PixInsight"
    ])

    const result = parseFitsFile(filePath)
    const comments = result.headers.filter(h => h.keyword === 'COMMENT')
    expect(comments.length).toBe(1)
    expect(comments[0].comment).toContain('This is a comment record')

    const history = result.headers.filter(h => h.keyword === 'HISTORY')
    expect(history.length).toBe(1)
    expect(history[0].comment).toContain('Processed with PixInsight')
  })

  it('rejects files without SIMPLE = T', () => {
    const filePath = createTemp([
      "SIMPLE  =                    F",
      "BITPIX  =                   16",
      "NAXIS   =                    0"
    ])

    const result = parseFitsFile(filePath)
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('SIMPLE')
  })

  it('computes image statistics for 16-bit data', () => {
    const naxis1 = 4
    const naxis2 = 2
    const pixelBuf = Buffer.alloc(naxis1 * naxis2 * 2)
    const values = [100, 200, 300, 400, 500, 600, 700, 800]
    values.forEach((v, i) => pixelBuf.writeInt16BE(v, i * 2))

    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    2",
      `NAXIS1  =                    ${naxis1}`,
      `NAXIS2  =                    ${naxis2}`
    ], pixelBuf)

    const result = parseFitsFile(filePath)
    expect(result.isValid).toBe(true)
    expect(result.imageStats).not.toBeNull()
    expect(result.imageStats!.min).toBe(100)
    expect(result.imageStats!.max).toBe(800)
    expect(result.imageStats!.mean).toBe(450)
    expect(result.imageStats!.stddev).toBeCloseTo(229.13, 1)
  })

  it('applies BSCALE and BZERO correctly', () => {
    const naxis1 = 2
    const naxis2 = 1
    const pixelBuf = Buffer.alloc(naxis1 * naxis2 * 2)
    pixelBuf.writeInt16BE(100, 0)
    pixelBuf.writeInt16BE(200, 2)

    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    2",
      `NAXIS1  =                    ${naxis1}`,
      `NAXIS2  =                    ${naxis2}`,
      "BSCALE  =                  2.0",
      "BZERO   =                 1000"
    ], pixelBuf)

    const result = parseFitsFile(filePath)
    expect(result.imageStats).not.toBeNull()
    expect(result.imageStats!.min).toBe(100 * 2 + 1000)
    expect(result.imageStats!.max).toBe(200 * 2 + 1000)
  })

  it('computes stats for 32-bit float data', () => {
    const naxis1 = 3
    const naxis2 = 1
    const pixelBuf = Buffer.alloc(naxis1 * naxis2 * 4)
    pixelBuf.writeFloatBE(1.5, 0)
    pixelBuf.writeFloatBE(2.5, 4)
    pixelBuf.writeFloatBE(3.5, 8)

    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                  -32",
      "NAXIS   =                    2",
      `NAXIS1  =                    ${naxis1}`,
      `NAXIS2  =                    ${naxis2}`
    ], pixelBuf)

    const result = parseFitsFile(filePath)
    expect(result.imageStats).not.toBeNull()
    expect(result.imageStats!.min).toBeCloseTo(1.5, 1)
    expect(result.imageStats!.max).toBeCloseTo(3.5, 1)
    expect(result.imageStats!.mean).toBeCloseTo(2.5, 1)
  })

  it('handles a header spanning multiple blocks', () => {
    const records: string[] = [
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    0"
    ]
    for (let i = 0; i < 40; i++) {
      records.push(`KEY${String(i).padStart(4, '0')} =                    ${i}`)
    }

    const filePath = createTemp(records)
    const result = parseFitsFile(filePath)
    expect(result.isValid).toBe(true)
    expect(result.headers.length).toBe(43)
    expect(result.headerMap.get('KEY0039')?.value).toBe(39)
  })

  it('handles embedded single quotes in string values', () => {
    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    0",
      "OBJECT  = 'NGC 7000 ''North America'' Nebula'"
    ])

    const result = parseFitsFile(filePath)
    expect(result.headerMap.get('OBJECT')?.value).toBe("NGC 7000 'North America' Nebula")
  })

  it('returns null imageStats when NAXIS is 0', () => {
    const filePath = createTemp([
      "SIMPLE  =                    T",
      "BITPIX  =                   16",
      "NAXIS   =                    0"
    ])

    const result = parseFitsFile(filePath)
    expect(result.imageStats).toBeNull()
  })
})
