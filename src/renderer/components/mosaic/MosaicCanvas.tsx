import React, { useRef, useState } from 'react'
import type { WorkspaceCaptureView, WorkspaceDrawingView } from '@shared/types'

interface MosaicCanvasProps {
  drawing: WorkspaceDrawingView
  selected: string | null
  onSelect?: (panelId: string) => void
  /** Called when the grid is dropped after a drag, with how far it moved on the drawing (x west, y north, degrees). */
  onDrag?: (xDeg: number, yDeg: number) => void
  /** Solved captures drawn at their footprints over the panels (X2). */
  captures?: WorkspaceCaptureView[]
  /** Thumbnails by file id, as data URLs, drawn inside their capture's footprint. */
  thumbnails?: Record<string, string>
  selectedCapture?: string | null
  onSelectCapture?: (captureId: string) => void
  /** An exposure heat map over the panels (X3): cells of one size, shaded by depth; uncovered cells marked. */
  heat?: HeatMap
}

export interface HeatMap {
  cellDeg: number
  cells: { x: number; y: number; value: number }[]
  /** The value drawn at full strength. */
  max: number
}

/** A cell's opacity: uncovered cells faint, covered ones from light to strong by depth. */
export function heatOpacity(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0
  return 0.15 + 0.6 * Math.min(1, value / max)
}

/** Outline colour by review state: accepted green, to review amber, conflict red, left out grey. */
const CAPTURE_STYLE: Record<WorkspaceCaptureView['state'], string> = {
  accepted: 'stroke-emerald-400',
  'needs-review': 'stroke-amber-400',
  conflict: 'stroke-red-400',
  excluded: 'stroke-astro-muted'
}

/**
 * The SVG matrix that puts a unit image on a footprint: its top left at the first corner, its top
 * right at the second and its bottom left at the fourth, so a thumbnail lies where it was solved.
 */
export function imageMatrix(outline: { x: number; y: number }[]): string | null {
  if (outline.length !== 4) return null
  const [tl, tr, , bl] = outline.map(v => ({ x: v.x, y: -v.y }))
  return `matrix(${tr.x - tl.x} ${tr.y - tl.y} ${bl.x - tl.x} ${bl.y - tl.y} ${tl.x} ${tl.y})`
}

/**
 * The mosaic on the sky (specs/037-mosaic-workspace): every panel's footprint as the core laid it
 * out on the grid's tangent plane, east on the left and north up. Dragging moves the whole grid;
 * the core works out where its centre lands and lays it out again.
 */
export function MosaicCanvas({ drawing, selected, onSelect, onDrag, captures = [], thumbnails = {}, selectedCapture = null, onSelectCapture, heat }: MosaicCanvasProps): React.ReactElement | null {
  const svg = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<{ from: { x: number; y: number }; by: { x: number; y: number }; panel: string | null; capture: string | null } | null>(null)
  if (!drawing.ok || !drawing.bounds) return null
  const { x: hx, y: hy } = drawing.bounds
  const half = Math.max(hx, hy)

  // Screen to drawing degrees: the viewBox spans [-half, half] both ways, SVG y pointing down.
  const toDegrees = (e: React.PointerEvent) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || box.width === 0) return null
    return { x: ((e.clientX - box.left) / box.width) * 2 * half - half, y: half - ((e.clientY - box.top) / box.height) * 2 * half }
  }

  // A press that does not move is a click on the panel under it; one that moves drags the grid.
  const start = (e: React.PointerEvent<SVGSVGElement>) => {
    const at = toDegrees(e)
    if (!at) return
    const panel = (e.target as Element).closest('[data-panel]')?.getAttribute('data-panel') ?? null
    const capture = (e.target as Element).closest('[data-capture]')?.getAttribute('data-capture') ?? null
    if (onDrag) e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ from: at, by: { x: 0, y: 0 }, panel, capture })
  }
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || !onDrag) return
    const at = toDegrees(e)
    if (at) setDrag({ ...drag, by: { x: at.x - drag.from.x, y: at.y - drag.from.y } })
  }
  const end = () => {
    if (!drag) return
    const moved = Math.hypot(drag.by.x, drag.by.y) > half / 200
    setDrag(null)
    if (moved) onDrag?.(drag.by.x, drag.by.y)
    else if (drag.capture && onSelectCapture) onSelectCapture(drag.capture)
    else if (drag.panel) onSelect?.(drag.panel)
  }

  const offset = drag ? `translate(${drag.by.x} ${-drag.by.y})` : undefined
  const stroke = half / 250

  return (
    <svg
      ref={svg}
      viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`}
      className={`w-full max-w-2xl aspect-square bg-astro-bg rounded border border-astro-border ${onDrag ? 'cursor-move touch-none' : ''}`}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => setDrag(null)}
      role="img"
      aria-label={drawing.summary ?? 'Mosaic grid'}
    >
      <line x1={-half} y1={0} x2={half} y2={0} stroke="currentColor" className="text-astro-border" strokeWidth={stroke} />
      <line x1={0} y1={-half} x2={0} y2={half} stroke="currentColor" className="text-astro-border" strokeWidth={stroke} />
      <text x={-half * 0.97} y={-half * 0.92} fontSize={half / 18} className="fill-astro-muted">
        N ↑ E ←
      </text>
      <g transform={offset}>
        {drawing.panels.map(p => {
          const points = p.outline.map(v => `${v.x},${-v.y}`).join(' ')
          const cx = p.outline.reduce((s, v) => s + v.x, 0) / p.outline.length
          const cy = -p.outline.reduce((s, v) => s + v.y, 0) / p.outline.length
          const isSelected = p.id === selected
          return (
            <g key={p.id} data-panel={p.id} className={onSelect ? 'cursor-pointer' : undefined}>
              <polygon
                points={points}
                className={isSelected ? 'fill-astro-accent/30 stroke-astro-accent' : 'fill-astro-accent/5 stroke-astro-accent/70'}
                strokeWidth={isSelected ? stroke * 3 : stroke * 1.5}
              />
              <text x={cx} y={cy} fontSize={half / 22} textAnchor="middle" dominantBaseline="middle" className="fill-astro-text pointer-events-none">
                {p.id}
              </text>
            </g>
          )
        })}
        {heat && (
          <g pointerEvents="none">
            {heat.cells.map(c => (
              <rect
                key={`${c.x},${c.y}`}
                x={c.x - heat.cellDeg / 2}
                y={-c.y - heat.cellDeg / 2}
                width={heat.cellDeg}
                height={heat.cellDeg}
                className={c.value > 0 ? 'fill-astro-accent' : 'fill-amber-400'}
                opacity={c.value > 0 ? heatOpacity(c.value, heat.max) : 0.3}
              />
            ))}
          </g>
        )}
        {captures.map(c => {
          const thumbnail = c.fileId ? thumbnails[c.fileId] : undefined
          const matrix = imageMatrix(c.outline)
          const isSelected = c.id === selectedCapture
          return (
            <g key={c.id} data-capture={c.id} className={onSelectCapture ? 'cursor-pointer' : undefined}>
              {thumbnail && matrix && <image href={thumbnail} x={0} y={0} width={1} height={1} preserveAspectRatio="none" transform={matrix} opacity={0.75} pointerEvents="none" />}
              {/* Only the outline picks the capture, so a click inside it still reaches the panel underneath. */}
              <polygon
                points={c.outline.map(v => `${v.x},${-v.y}`).join(' ')}
                fill="none"
                pointerEvents="stroke"
                className={CAPTURE_STYLE[c.state]}
                strokeWidth={isSelected ? stroke * 3 : stroke}
                strokeDasharray={c.source === 'user-override' ? `${stroke * 4} ${stroke * 2}` : undefined}
              >
                <title>
                  {c.label}
                  {c.note ? `: ${c.note}` : ''}
                </title>
              </polygon>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
