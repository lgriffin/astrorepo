import React, { useState, useEffect } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { ScanControls } from '../components/fits/ScanControls'
import { ScanHistory } from '../components/fits/ScanHistory'
import { AggregateView } from '../components/fits/AggregateView'
import { FileTable } from '../components/fits/FileTable'
import { FileDetail } from '../components/fits/FileDetail'
import { TargetSummaries } from '../components/fits/TargetSummaries'
import { invoke } from '../hooks/useIPC'
import type { FitsScanSummary, FitsScanAggregates } from '@shared/types'

export function FitsAnalyzer(): React.ReactElement {
  const [scans, setScans] = useState<FitsScanSummary[]>([])
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [aggregates, setAggregates] = useState<FitsScanAggregates | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadScans()
  }, [])

  useEffect(() => {
    if (selectedScanId) {
      invoke<FitsScanAggregates>('fits:scan-aggregates', { scan_id: selectedScanId }).then(setAggregates)
    } else {
      setAggregates(null)
    }
    setSelectedFileId(null)
  }, [selectedScanId])

  async function loadScans(): Promise<void> {
    setLoading(true)
    const result = await invoke<{ scans: FitsScanSummary[]; total: number }>('fits:list-scans', { limit: 50 })
    setScans(result.scans)
    if (result.scans.length > 0 && !selectedScanId) {
      setSelectedScanId(result.scans[0].id)
    }
    setLoading(false)
  }

  function handleScanComplete(): void {
    loadScans()
  }

  function handleSelectScan(id: string): void {
    setSelectedScanId(id)
  }

  if (loading) {
    return (
      <PageContainer title="FITS Analyzer">
        <div className="text-astro-muted">Loading...</div>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="FITS Analyzer" subtitle="Scan and analyze FITS file metadata across your astrophotography folders">
      <div className="space-y-4">
        <ScanControls onScanComplete={handleScanComplete} />

        <ScanHistory
          scans={scans}
          selectedScanId={selectedScanId}
          onSelectScan={handleSelectScan}
          onRefresh={loadScans}
        />

        {selectedScanId && aggregates && (
          <div className="space-y-4">
            <AggregateView aggregates={aggregates} />

            <TargetSummaries scanId={selectedScanId} />

            <FileTable
              scanId={selectedScanId}
              onSelectFile={setSelectedFileId}
              selectedFileId={selectedFileId}
            />

            {selectedFileId && (
              <FileDetail
                fileId={selectedFileId}
                onClose={() => setSelectedFileId(null)}
              />
            )}
          </div>
        )}
      </div>
    </PageContainer>
  )
}
