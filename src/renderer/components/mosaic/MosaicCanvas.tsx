import React, { useRef, useState } from 'react'
import type { WorkspaceDrawingView } from '@shared/types'

interface MosaicCanvasProps {
  drawing: WorkspaceDrawingView
  selected: string | null
  onSelect?: (panelId: string) => void
  /** Called when the grid is dropped after a drag, with how far it moved on the drawing (x west, y north, degrees). */
  onDrag?: (xDeg: number, yDeg: number) => void
}

/**
 * The mosaic on the sky (specs/037-mosaic-workspace): every panel's footprint as the core laid it
 * out on the grid's tangent plane, east on the left and north up. Dragging moves the whole grid;
 * the core works out where its centre lands and lays it out again.
 */
export function MosaicCanvas({ drawing, selected, onSelect, onDrag }: MosaicCanvasProps): React.ReactElement | null {
  const svg = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<{ from: { x: number; y: number }; by: { x: number; y: number }; panel: string | null } | null>(null)
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
    if (onDrag) e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ from: at, by: { x: 0, y: 0 }, panel })
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
      </g>
    </svg>
  )
}
