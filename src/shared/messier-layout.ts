/** One tile's place in the saved mosaic (specs/032-messier-mosaic, MES-009). */
export interface MosaicCell {
  number: number
  /** Top-left corner of the tile's picture square. */
  x: number
  y: number
  /** "M 42 · Orion Nebula", drawn under the square. */
  label: string
}

export interface MosaicLayout {
  width: number
  height: number
  /** Side of each picture square. */
  tile: number
  /** Height of the label strip under each square. */
  label: number
  cells: MosaicCell[]
}

/** Tiles in one row of the saved mosaic: 110 objects make ten rows of eleven. */
export const SAVED_COLUMNS = 11

/** Where each tile goes in the saved PNG, in the order given, eleven to a row with a label under each. */
export function mosaicLayout(tiles: { number: number; designation: string; name: string | null }[], tile = 200, label = 34): MosaicLayout {
  const rows = Math.ceil(tiles.length / SAVED_COLUMNS)
  return {
    width: SAVED_COLUMNS * tile,
    height: rows * (tile + label),
    tile,
    label,
    cells: tiles.map((t, i) => ({
      number: t.number,
      x: (i % SAVED_COLUMNS) * tile,
      y: Math.floor(i / SAVED_COLUMNS) * (tile + label),
      label: t.name ? `${t.designation} · ${t.name}` : t.designation
    }))
  }
}
