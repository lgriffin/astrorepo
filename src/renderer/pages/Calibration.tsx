import React, { useState, useEffect } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { CalibrationTable } from '../components/calibration/CalibrationTable'
import { CoverageView } from '../components/calibration/CoverageView'
import { invoke } from '../hooks/useIPC'
import type { CalibrationGroup, CalibrationCoverage } from '@shared/types'

interface CalibrationSummary {
  totalDarks: number
  totalFlats: number
  totalBiases: number
  lightsCovered: number
  lightsUncovered: number
}

export function Calibration(): React.ReactElement {
  const [summary, setSummary] = useState<CalibrationSummary | null>(null)
  const [groups, setGroups] = useState<CalibrationGroup[]>([])
  const [coverage, setCoverage] = useState<CalibrationCoverage | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData(): Promise<void> {
    setLoading(true)
    try {
      const [summaryResult, libraryResult] = await Promise.all([
        invoke<CalibrationSummary>('calibration:summary'),
        invoke<{ groups: CalibrationGroup[] }>('calibration:library')
      ])
      setSummary(summaryResult)
      setGroups(libraryResult.groups)
    } catch {
      // Silently handle errors
    }
    setLoading(false)
  }

  async function handleAnalyzeCoverage(): Promise<void> {
    setAnalyzing(true)
    try {
      const result = await invoke<CalibrationCoverage>('calibration:match-lights')
      setCoverage(result)
    } catch {
      // Silently handle errors
    }
    setAnalyzing(false)
  }

  if (loading) {
    return (
      <PageContainer title="Calibration Library">
        <div className="text-astro-muted">Loading...</div>
      </PageContainer>
    )
  }

  const totalCalib = (summary?.totalDarks ?? 0) + (summary?.totalFlats ?? 0) + (summary?.totalBiases ?? 0)
  const totalLights = (summary?.lightsCovered ?? 0) + (summary?.lightsUncovered ?? 0)
  const overallCoverage = totalLights > 0
    ? Math.round((summary!.lightsCovered / totalLights) * 100)
    : 0

  return (
    <PageContainer
      title="Calibration Library"
      subtitle="Track darks, flats, and biases. Match calibration frames to your light frames."
      actions={
        <button
          onClick={handleAnalyzeCoverage}
          disabled={analyzing}
          className="px-4 py-2 bg-astro-accent text-white rounded-lg text-sm font-medium hover:bg-astro-accent/80 disabled:opacity-50 transition-colors"
        >
          {analyzing ? 'Analyzing...' : 'Analyze Coverage'}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Darks" value={summary?.totalDarks ?? 0} color="text-purple-400" />
          <SummaryCard label="Flats" value={summary?.totalFlats ?? 0} color="text-sky-400" />
          <SummaryCard label="Biases" value={summary?.totalBiases ?? 0} color="text-amber-400" />
          <SummaryCard
            label="Overall Coverage"
            value={totalCalib > 0 ? `${overallCoverage}%` : '--'}
            color="text-astro-accent"
          />
        </div>

        {coverage && <CoverageView coverage={coverage} />}

        <CalibrationTable groups={groups} />
      </div>
    </PageContainer>
  )
}

function SummaryCard({
  label,
  value,
  color
}: {
  label: string
  value: number | string
  color: string
}): React.ReactElement {
  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-astro-muted mt-1">{label}</div>
    </div>
  )
}
