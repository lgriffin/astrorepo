/**
 * Writes the app icon from the mark (specs/041-look-and-feel LF-031): resources/icon.svg in the
 * dark palette, and resources/icon.ico wrapping resources/icon.png for Windows. The PNG is drawn
 * from the SVG by a browser (open the SVG at 256×256 and save it) because the repo carries no
 * rasteriser. When the mark changes, the script deletes the stale PNG and ICO and stops, so they
 * cannot be packaged with the old artwork; draw the PNG and run it again.
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
  const svgPath = path.join(dir, 'icon.svg')
  const png = path.join(dir, 'icon.png')
  const ico = path.join(dir, 'icon.ico')
  const svg = appIconSvg(PALETTES.dark) + '\n'
  const changed = !fs.existsSync(svgPath) || fs.readFileSync(svgPath, 'utf8') !== svg
  fs.writeFileSync(svgPath, svg)
  if (changed) {
    // The rasters show the old mark: remove them so nothing packages stale artwork.
    fs.rmSync(png, { force: true })
    fs.rmSync(ico, { force: true })
    console.error('The mark changed. Draw resources/icon.png (256×256) from resources/icon.svg, then run this again.')
    process.exit(1)
  }
  if (!fs.existsSync(png)) {
    console.error('resources/icon.png is missing. Draw it (256×256) from resources/icon.svg, then run this again.')
    process.exit(1)
  }
  fs.writeFileSync(ico, icoFromPng(fs.readFileSync(png), 256))
}
