import React from 'react'
import { useNavigate } from 'react-router-dom'
import { targetLink } from '@shared/navigation'
import type { MessierTileView } from '@shared/types'
import { Card, LinkButton } from '../common/Card'
import { DETAIL_WIDTH, usePicture } from './pictures'
import { OUTLOOK_TONE } from './MosaicTile'

/**
 * One object opened from the mosaic (MES-007): its picture, what it is, how far it has come, when
 * it is up with its months ahead, and the way to its target page and the Sky planner.
 */
export function TileDetails({ tile, onClose }: { tile: MessierTileView; onClose: () => void }): React.ReactElement {
  const navigate = useNavigate()
  const picture = usePicture(tile.number, DETAIL_WIDTH, tile.picture !== null)
  const facts = [tile.objectType, tile.constellation, tile.magnitude !== null ? `magnitude ${tile.magnitude}` : null].filter(Boolean).join(' · ')
  const peak = Math.max(1, ...tile.months.map(m => m.hoursPerNight))
  return (
    <Card title={tile.name ? `${tile.designation} · ${tile.name}` : tile.designation} action={<LinkButton onClick={onClose}>Close</LinkButton>}>
      {picture.status === 'shown' && <img src={picture.src} alt={tile.designation} className="w-full rounded mb-3" />}
      {picture.status === 'loading' && <p className="text-sm text-astro-muted mb-3">Drawing the picture…</p>}
      {picture.status === 'failed' && <p className="text-sm text-astro-warning mb-3">The picture could not be drawn. {picture.error}</p>}
      <p className="text-sm text-astro-muted">{facts}</p>
      <p className="text-sm text-astro-text mt-2">
        {tile.stateLabel}
        {tile.integration ? `, ${tile.integration} of lights` : ''}.
      </p>
      {picture.status === 'shown' && <p className="text-xs text-astro-muted mt-1">Showing {picture.name}{tile.picture?.kind === 'master' ? ', a stacked master' : ''}.</p>}
      {tile.outlook && <p className={`text-sm mt-2 ${OUTLOOK_TONE[tile.outlook.kind]}`}>{tile.outlook.long}</p>}
      {tile.months.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-astro-muted mb-1">Usable hours per night, month by month</p>
          <div className="flex items-end gap-1 h-16">
            {tile.months.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full" title={`${m.label}: ${m.hoursPerNight} h a night`}>
                <div className={`w-full rounded-t ${m.inSeason ? 'bg-astro-success/70' : 'bg-astro-border'}`} style={{ height: `${Math.max(4, (m.hoursPerNight / peak) * 100)}%` }} />
                <span className="text-[9px] text-astro-muted mt-0.5">{m.label.charAt(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3 mt-4">
        <LinkButton onClick={() => navigate(targetLink(tile.targetId))}>Open target</LinkButton>
        <LinkButton onClick={() => navigate('/sky-planner')}>Open the Sky planner</LinkButton>
      </div>
    </Card>
  )
}
