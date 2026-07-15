import zlib from 'zlib'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const crcTable: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1)
      } else {
        c = c >>> 1
      }
    }
    table[n] = c
  }
  return table
})()

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const crcInput = Buffer.concat([typeBytes, data])
  const crcValue = crc32(crcInput)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crcValue, 0)

  return Buffer.concat([length, typeBytes, data, crcBuf])
}

export function encodeGreyscalePng(width: number, height: number, pixels: Uint8Array): Buffer {
  // IHDR: width(4) + height(4) + bitDepth(1) + colorType(1) + compression(1) + filter(1) + interlace(1)
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 0   // color type: greyscale
  ihdrData[10] = 0  // compression method: deflate
  ihdrData[11] = 0  // filter method: adaptive
  ihdrData[12] = 0  // interlace: none

  // Raw image data: each row is prefixed with filter byte 0 (None)
  const rawSize = height * (1 + width)
  const raw = Buffer.alloc(rawSize)
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width)
    raw[rowOffset] = 0 // filter byte: None
    for (let x = 0; x < width; x++) {
      raw[rowOffset + 1 + x] = pixels[y * width + x]
    }
  }

  const compressed = zlib.deflateSync(raw)

  const ihdrChunk = makeChunk('IHDR', ihdrData)
  const idatChunk = makeChunk('IDAT', compressed)
  const iendChunk = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([PNG_MAGIC, ihdrChunk, idatChunk, iendChunk])
}
