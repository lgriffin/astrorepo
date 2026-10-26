/**
 * Writes the app icon from the mark (specs/041-look-and-feel LF-031): resources/icon.svg in the
 * dark palette, and resources/icon.ico wrapping resources/icon.png for Windows. The PNG is drawn
 * from the SVG once by a browser (any will do: open the SVG at 256×256 and save it) because the
 * repo carries no rasteriser; run `npx tsx scripts/app-icon.ts` after changing the mark.
 */
import fs from 'fs'
import path from 'path'
import { appIconSvg } from '../src/shared/logo'
import { PALETTES } from '../src/shared/themes'

const dir = path.resolve(__dirname, '../resources')

/** An ICO holding one PNG image, which Windows has read since Vista. */
export function icoFromPng(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)
  return Buffer.concat([header, entry, png])
}

if (require.main === module) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'icon.svg'), appIconSvg(PALETTES.dark) + '\n')
  const png = path.join(dir, 'icon.png')
  if (fs.existsSync(png)) fs.writeFileSync(path.join(dir, 'icon.ico'), icoFromPng(fs.readFileSync(png), 256))
}
