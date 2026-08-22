export function readPixelValue(buf: Buffer, offset: number, bitpix: number, bscale = 1, bzero = 0): number {
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
