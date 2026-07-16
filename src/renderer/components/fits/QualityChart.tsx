import React from 'react'
import type { QualityMetrics } from '@shared/types'

interface QualityChartProps {
  files: QualityMetrics[]
}

function flagColor(flag: string | null): string {
  switch (flag) {
    case 'good': return '#22c55e'
    case 'warning': return '#f59e0b'
    case 'reject': return '#ef4444'
    default: return '#6b7280'
  }
}

export function QualityChart({ files }: QualityChartProps): React.ReactElement {
  const analyzed = files.filter(f => f.qualityScore != null)

  if (analyzed.length === 0) {
    return (
      <div className="text-sm text-astro-muted p-4 text-center">
        No quality data available. Run analysis first.
      </div>
    )
  }

  const maxScore = 100
  const barHeight = 18
  const labelWidth = 60
  const chartWidth = 400
  const gap = 3
  const svgHeight = analyzed.length * (barHeight + gap) + 10
  const svgWidth = labelWidth + chartWidth + 10

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} className="block">
        {analyzed.map((f, i) => {
          const y = i * (barHeight + gap) + 5
          const score = f.qualityScore ?? 0
          const barW = (score / maxScore) * chartWidth
          const color = flagColor(f.qualityFlag)
          const label = `#${i + 1}`

          return (
            <g key={f.fileId}>
              <text
                x={labelWidth - 5}
                y={y + barHeight / 2 + 4}
                textAnchor="end"
                className="fill-current text-astro-muted"
                fontSize={11}
              >
                {label}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={barW}
                height={barHeight}
                fill={color}
                rx={2}
                ry={2}
                opacity={0.85}
              />
              <text
                x={labelWidth + barW + 5}
                y={y + barHeight / 2 + 4}
                className="fill-current text-astro-text"
                fontSize={11}
              >
                {score.toFixed(0)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
