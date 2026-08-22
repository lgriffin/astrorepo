import fs from 'fs'
import { readPixelValue } from './pixel-reader'

const BLOCK_SIZE = 2880
const RECORD_SIZE = 80
const RECORDS_PER_BLOCK = BLOCK_SIZE / RECORD_SIZE
const CHUNK_SIZE = 65536

export interface FitsHeaderRecord {
  keyword: string
  value: string | number | boolean | null
  comment: string | null
  raw: string
}

export interface FitsImageStats {
  min: number
  max: number
  mean: number
  stddev: number
}

export interface FitsParseResult {
  headers: FitsHeaderRecord[]
  headerMap: Map<string, FitsHeaderRecord>
  imageStats: FitsImageStats | null
  isValid: boolean
  error?: string
}

function parseHeaderValue(raw: string): { value: string | number | boolean | null; comment: string | null } {
  const afterIndicator = raw.substring(10).trimStart()
  if (afterIndicator.length === 0) return { value: null, comment: null }

  if (afterIndicator.startsWith("'")) {
    const closingQuote = findClosingQuote(afterIndicator)
    if (closingQuote === -1) {
      return { value: afterIndicator.substring(1).trimEnd(), comment: null }
    }
    const strVal = afterIndicator.substring(1, closingQuote).replace(/''/g, "'").trimEnd()
    const rest = afterIndicator.substring(closingQuote + 1).trimStart()
    let comment: string | null = null
    if (rest.startsWith('/')) {
      comment = rest.substring(1).trimStart().trimEnd()
    }
    return { value: strVal, comment }
  }

  const slashIdx = afterIndicator.indexOf('/')
  let valuePart: string
  let comment: string | null = null

  if (slashIdx !== -1) {
    valuePart = afterIndicator.substring(0, slashIdx).trimEnd()
    comment = afterIndicator.substring(slashIdx + 1).trimStart().trimEnd()
  } else {
    valuePart = afterIndicator.trimEnd()
  }

  if (valuePart === 'T') return { value: true, comment }
  if (valuePart === 'F') return { value: false, comment }

  const num = Number(valuePart)
  if (valuePart.length > 0 && !isNaN(num)) return { value: num, comment }

  return { value: valuePart || null, comment }
}

function findClosingQuote(s: string): number {
  let i = 1
  while (i < s.length) {
    if (s[i] === "'") {
      if (i + 1 < s.length && s[i + 1] === "'") {
        i += 2
        continue
      }
      return i
    }
    i++
  }
  return -1
}

function parseRecord(record: string): FitsHeaderRecord {
  const keyword = record.substring(0, 8).trimEnd()
  const hasValueIndicator = record.substring(8, 10) === '= '

  if (!hasValueIndicator) {
    const content = record.substring(8).trimStart().trimEnd()
    if (keyword === 'COMMENT' || keyword === 'HISTORY' || keyword === '') {
      return { keyword, value: null, comment: content || null, raw: record }
    }
    return { keyword, value: null, comment: content || null, raw: record }
  }

  const parsed = parseHeaderValue(record)
  return { keyword, ...parsed, raw: record }
}

export function parseFitsHeaders(filePath: string): { headers: FitsHeaderRecord[]; headerMap: Map<string, FitsHeaderRecord> } {
  const fd = fs.openSync(filePath, 'r')
  try {
    const headers: FitsHeaderRecord[] = []
    const headerMap = new Map<string, FitsHeaderRecord>()
    const blockBuf = Buffer.alloc(BLOCK_SIZE)
    let done = false
    let continueKeyword: string | null = null

    while (!done) {
      const bytesRead = fs.readSync(fd, blockBuf, 0, BLOCK_SIZE, null)
      if (bytesRead < BLOCK_SIZE) break

      for (let i = 0; i < RECORDS_PER_BLOCK; i++) {
        const record = blockBuf.toString('ascii', i * RECORD_SIZE, (i + 1) * RECORD_SIZE)

        if (record.substring(0, 8).trimEnd() === 'END') {
          done = true
          break
        }

        if (record.substring(0, 8).trimEnd() === 'CONTINUE') {
          if (continueKeyword) {
            const content = record.substring(10).trimStart()
            const prev = headerMap.get(continueKeyword)
            if (prev && typeof prev.value === 'string' && content.startsWith("'")) {
              const closingQuote = findClosingQuote(content)
              if (closingQuote !== -1) {
                prev.value += content.substring(1, closingQuote).replace(/''/g, "'").trimEnd()
              }
            }
          }
          continue
        }

        const rec = parseRecord(record)
        headers.push(rec)
        if (rec.keyword) {
          headerMap.set(rec.keyword, rec)
          continueKeyword = rec.keyword
        }
      }
    }

    return { headers, headerMap }
  } finally {
    fs.closeSync(fd)
  }
}

export function computeImageStats(
  filePath: string,
  headerBlockCount: number,
  bitpix: number,
  naxis: number,
  naxis1: number,
  naxis2: number,
  bscale: number,
  bzero: number
): FitsImageStats | null {
  if (naxis === 0 || naxis1 === 0 || naxis2 === 0) return null

  const bytesPerPixel = Math.abs(bitpix) / 8
  const totalPixels = naxis1 * naxis2
  const dataOffset = headerBlockCount * BLOCK_SIZE
  const dataLength = totalPixels * bytesPerPixel

  const fd = fs.openSync(filePath, 'r')
  try {
    const fileSize = fs.fstatSync(fd).size
    if (dataOffset + dataLength > fileSize) return null

    let min = Infinity
    let max = -Infinity
    let sum = 0
    let sumSq = 0
    let count = 0

    const chunkBuf = Buffer.alloc(CHUNK_SIZE)
    let remaining = dataLength
    let filePos = dataOffset

    while (remaining > 0) {
      const toRead = Math.min(CHUNK_SIZE, remaining)
      const bytesRead = fs.readSync(fd, chunkBuf, 0, toRead, filePos)
      if (bytesRead === 0) break

      const usableBytes = bytesRead - (bytesRead % bytesPerPixel)
      for (let i = 0; i < usableBytes; i += bytesPerPixel) {
        const val = readPixelValue(chunkBuf, i, bitpix, bscale, bzero)
        if (val < min) min = val
        if (val > max) max = val
        sum += val
        sumSq += val * val
        count++
      }

      remaining -= usableBytes
      filePos += usableBytes
    }

    if (count === 0) return null

    const mean = sum / count
    const variance = sumSq / count - mean * mean
    const stddev = Math.sqrt(Math.max(0, variance))

    return { min, max, mean, stddev }
  } finally {
    fs.closeSync(fd)
  }
}

export function parseFitsFile(filePath: string, options?: { computeStats?: boolean }): FitsParseResult {
  try {
    const { headers, headerMap } = parseFitsHeaders(filePath)

    const simple = headerMap.get('SIMPLE')
    if (!simple || simple.value !== true) {
      return { headers, headerMap, imageStats: null, isValid: false, error: 'Not a valid FITS file: SIMPLE != T' }
    }

    const bitpix = (headerMap.get('BITPIX')?.value as number) ?? 0
    const naxis = (headerMap.get('NAXIS')?.value as number) ?? 0
    const naxis1 = (headerMap.get('NAXIS1')?.value as number) ?? 0
    const naxis2 = (headerMap.get('NAXIS2')?.value as number) ?? 0
    const bscale = (headerMap.get('BSCALE')?.value as number) ?? 1
    const bzero = (headerMap.get('BZERO')?.value as number) ?? 0

    const headerBytes = headers.length * RECORD_SIZE + RECORD_SIZE
    const headerBlockCount = Math.ceil(headerBytes / BLOCK_SIZE)

    let imageStats: FitsImageStats | null = null
    if (options?.computeStats && naxis >= 2 && naxis1 > 0 && naxis2 > 0) {
      imageStats = computeImageStats(filePath, headerBlockCount, bitpix, naxis, naxis1, naxis2, bscale, bzero)
    }

    return { headers, headerMap, imageStats, isValid: true }
  } catch (err) {
    return {
      headers: [],
      headerMap: new Map(),
      imageStats: null,
      isValid: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
