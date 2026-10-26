import React from 'react'
import type { MessierTileView } from '@shared/types'
import { TILE_WIDTH, usePicture } from './pictures'

/** The colour of a tile's outlook line: up tonight stands out, never is dim. */
export const OUTLOOK_TONE: Record<string, string> = {
  tonight: 'text-astro-success',
  moon: 'text-astro-warning',
  later: 'text-astro-muted',
  never: 'text-astro-muted/60'
}

const STATE_DOT: Record<MessierTileView['state'], string> = {
  imaged: 'bg-astro-success',
  stacked: 'bg-astro-accent',
  captured: 'bg-astro-warning',
  gap: 'bg-astro-border'
}

/**
 * One object's tile (MES-001 to MES-005): its own picture when it has one, else a dark square with
 * its designation and when it is up; a dot for how far it has come. Dimmed when the filter leaves it out.
 */
export function MosaicTile({ tile, dimmed, selected, onOpen }: { tile: MessierTileView; dimmed: boolean; selected: boolean; onOpen: () => void }): React.ReactElement {
  const picture = usePicture(tile.number, TILE_WIDTH, tile.picture !== null)
  const shown = picture.status === 'shown'
  const label = tile.name ? `${tile.designation} · ${tile.name}` : tile.designation
  return (
    <button
      onClick={onOpen}
      title={`${label}. ${tile.stateLabel}.${tile.outlook ? ` ${tile.outlook.long}` : ''}`}
      className={`relative aspect-square rounded overflow-hidden border text-left transition ${
        selected ? 'border-astro-accent ring-2 ring-astro-accent/50' : 'border-astro-border/60 hover:border-astro-accent/60'
      } ${tile.state === 'gap' ? 'bg-astro-bg' : 'bg-astro-surface'} ${dimmed ? 'opacity-20' : ''}`}
    >
      {shown && <img src={picture.src} alt={label} className="absolute inset-0 w-full h-full object-cover" />}
      {!shown && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center">
          <span className={`text-lg font-bold ${tile.state === 'gap' ? 'text-astro-muted/70' : 'text-astro-text'}`}>{tile.designation}</span>
          {picture.status === 'loading' && <span className="text-[10px] text-astro-muted">Drawing…</span>}
          {picture.status !== 'loading' && tile.state !== 'imaged' && tile.outlook && (
            <span className={`text-[10px] leading-tight ${OUTLOOK_TONE[tile.outlook.kind]}`}>{tile.outlook.short}</span>
          )}
        </div>
      )}
      <span className={`absolute top-1 left-1 w-2 h-2 rounded-full ${STATE_DOT[tile.state]}`} />
      {shown && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-astro-scrim/80 to-transparent px-1 pt-3 pb-0.5">
          <p className="text-[10px] font-semibold text-astro-on-scrim truncate">{label}</p>
          {tile.state !== 'imaged' && tile.outlook && <p className={`text-[9px] truncate ${OUTLOOK_TONE[tile.outlook.kind]}`}>{tile.outlook.short}</p>}
        </div>
      )}
    </button>
  )
}
