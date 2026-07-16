import React from 'react'

interface BreakdownItem {
  label: string
  value: number
}

interface StorageBreakdownChartProps {
  data: BreakdownItem[]
  formatValue?: (v: number) => string
}

const defaultFormat = (v: number): string => String(v)

export function StorageBreakdownChart({ data, formatValue = defaultFormat }: StorageBreakdownChartProps): React.ReactElement {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const maxValue = Math.max(...data.map((d) => d.value), 1)

  if (data.length === 0) {
    return <p className="text-sm text-astro-muted">No data available.</p>
  }

  return (
    <div className="space-y-3">
      {data.map((item, i) => {
        const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'
        const barWidth = (item.value / maxValue) * 100

        return (
          <div key={item.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-astro-text truncate mr-2">{item.label}</span>
              <span className="text-astro-muted whitespace-nowrap">
                {formatValue(item.value)} ({pct}%)
              </span>
            </div>
            <div className="w-full h-2 bg-astro-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-astro-accent rounded-full transition-all"
                style={{ width: `${barWidth}%`, opacity: 1 - i * 0.12 }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
