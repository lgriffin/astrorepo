import React, { useEffect, useRef } from 'react'
import type { OverlayView } from '@shared/types'

/** The pixels of a preview the main process sent, as bytes. */
export function decodePixels(base64: string): Uint8Array {
  const text = atob(base64)
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i)
  return out
}

/** Grey or colour bytes to the RGBA a canvas takes. */
export function toRgba(pixels: Uint8Array, width: number, height: number, channels: 1 | 3): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = pixels[i * channels]
    out[i * 4 + 1] = pixels[i * channels + (channels === 3 ? 1 : 0)]
    out[i * 4 + 2] = pixels[i * channels + (channels === 3 ? 2 : 0)]
    out[i * 4 + 3] = 255
  }
  return out
}

/** A canvas showing RGBA pixels at the width of its container. */
export function PixelCanvas({ rgba, width, height, className = '' }: { rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; className?: string }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || width === 0 || height === 0) return
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0)
  }, [rgba, width, height])
  return <canvas ref={ref} width={width} height={height} className={`block w-full h-auto ${className}`} />
}

/** RA and Dec lines and catalogue labels drawn over a preview of the same size. */
export function SkyOverlayLayer({ overlay, width, height }: { overlay: OverlayView; width: number; height: number }): React.ReactElement {
  const font = Math.max(9, Math.round(width / 70))
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 w-full h-full pointer-events-none" aria-label="Coordinate grid and catalogue labels">
      {overlay.lines.map((l, i) => {
        const inside = l.points.find(([x, y]) => x >= 0 && y >= 0 && x <= width && y <= height)
        return (
          <g key={i}>
            <polyline points={l.points.map(p => p.join(',')).join(' ')} fill="none" stroke={l.kind === 'ra' ? '#60a5fa' : '#34d399'} strokeOpacity={0.55} strokeWidth={Math.max(1, width / 900)} />
            {inside && (
              <text x={inside[0] + 3} y={inside[1] - 3} fill={l.kind === 'ra' ? '#93c5fd' : '#6ee7b7'} fontSize={font}>
                {l.label}
              </text>
            )}
          </g>
        )
      })}
      {overlay.objects.map(o => (
        <g key={o.label}>
          <circle cx={o.x} cy={o.y} r={Math.max(6, o.radius ?? 6)} fill="none" stroke="#fbbf24" strokeOpacity={0.8} strokeWidth={Math.max(1, width / 700)} />
          <text x={o.x + Math.max(6, o.radius ?? 6) + 3} y={o.y} fill="#fde68a" fontSize={font}>
            {o.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
