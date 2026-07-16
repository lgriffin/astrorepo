import React from 'react'
import type { StorageSnapshot } from '@shared/types'

interface GrowthTrendChartProps {
  snapshots: StorageSnapshot[]
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function GrowthTrendChart({ snapshots }: GrowthTrendChartProps): React.ReactElement {
  if (snapshots.length === 0) {
    return <p className="text-sm text-astro-muted">No snapshot history available. Capture snapshots to track growth over time.</p>
  }

  // Sort chronologically for display
  const sorted = [...snapshots].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))

  const padding = { top: 20, right: 20, bottom: 40, left: 60 }
  const width = 600
  const height = 200
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const values = sorted.map((s) => s.totalSizeBytes)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const valRange = maxVal - minVal || 1

  const points = sorted.map((s, i) => {
    const x = padding.left + (sorted.length === 1 ? plotWidth / 2 : (i / (sorted.length - 1)) * plotWidth)
    const y = padding.top + plotHeight - ((s.totalSizeBytes - minVal) / valRange) * plotHeight
    return { x, y, snapshot: s }
  })

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ')

  // Y-axis labels (3 ticks)
  const yTicks = [0, 0.5, 1].map((frac) => ({
    value: minVal + frac * valRange,
    y: padding.top + plotHeight - frac * plotHeight
  }))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yTicks.map((tick, i) => (
        <line
          key={i}
          x1={padding.left}
          y1={tick.y}
          x2={width - padding.right}
          y2={tick.y}
          stroke="currentColor"
          className="text-astro-border"
          strokeWidth="0.5"
          strokeDasharray="4 2"
        />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((tick, i) => (
        <text
          key={i}
          x={padding.left - 8}
          y={tick.y + 4}
          textAnchor="end"
          className="text-astro-muted fill-current"
          fontSize="9"
        >
          {formatBytes(tick.value)}
        </text>
      ))}

      {/* Line */}
      {points.length > 1 && (
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="currentColor"
          className="text-astro-accent"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}

      {/* Dots */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="4"
          fill="currentColor"
          className="text-astro-accent"
        />
      ))}

      {/* X-axis date labels */}
      {points.map((p, i) => {
        // Show first, last, and middle labels to avoid overlap
        if (points.length > 5 && i !== 0 && i !== points.length - 1 && i !== Math.floor(points.length / 2)) return null
        return (
          <text
            key={i}
            x={p.x}
            y={height - 8}
            textAnchor="middle"
            className="text-astro-muted fill-current"
            fontSize="9"
          >
            {p.snapshot.snapshotDate.slice(5)}
          </text>
        )
      })}
    </svg>
  )
}
