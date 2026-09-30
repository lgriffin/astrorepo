import React from 'react'
import type { CalibrationCoverage } from '@shared/types'

interface CoverageViewProps {
  coverage: CalibrationCoverage
}

function CoverageBar({ label, percent }: { label: string; percent: number }): React.ReactElement {
  const barColor = percent >= 80 ? 'bg-green-500' : percent >= 40 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = percent >= 80 ? 'text-green-400' : percent >= 40 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-astro-muted">{label}</span>
        <span className={`font-medium ${textColor}`}>{percent}%</span>
      </div>
      <div className="h-2 bg-astro-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function CoverageView({ coverage }: CoverageViewProps): React.ReactElement {
  if (coverage.totalLights === 0) {
    return (
      <div className="bg-astro-surface border border-astro-border rounded-lg p-6 text-center text-astro-muted">
        No light frames found to analyze coverage.
      </div>
    )
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-astro-border">
        <h3 className="text-sm font-medium text-astro-text">Coverage Analysis</h3>
      </div>
      <div className="p-4 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-astro-text">{coverage.totalLights}</div>
            <div className="text-xs text-astro-muted mt-1">Total Lights</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{coverage.fullyCalibrated}</div>
            <div className="text-xs text-astro-muted mt-1">Fully Calibrated</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">{coverage.partiallyCalibrated}</div>
            <div className="text-xs text-astro-muted mt-1">Partially Calibrated</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">{coverage.uncalibrated}</div>
            <div className="text-xs text-astro-muted mt-1">Uncalibrated</div>
          </div>
        </div>

        <div className="space-y-3">
          <CoverageBar label="Darks coverage" percent={coverage.darksCoverage} />
          <CoverageBar label="Flats coverage" percent={coverage.flatsCoverage} />
          <CoverageBar label="Bias coverage" percent={coverage.biasCoverage} />
        </div>
      </div>
    </div>
  )
}
