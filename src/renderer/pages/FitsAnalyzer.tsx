import React, { useState, useEffect } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { ScanControls } from '../components/fits/ScanControls'
import { ScanHistory } from '../components/fits/ScanHistory'
import { AggregateView } from '../components/fits/AggregateView'
import { FileTable } from '../components/fits/FileTable'
import { FileDetail } from '../components/fits/FileDetail'
import { TargetSummaries } from '../components/fits/TargetSummaries'
import { SessionGenerator } from '../components/fits/SessionGenerator'
import { invoke } from '../hooks/useIPC'
import type { FitsScanSummary, FitsScanAggregates, FitsLinkingStatus } from '@shared/types'

export function FitsAnalyzer(): React.ReactElement {
  const [scans, setScans] = useState<FitsScanSummary[]>([])
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [aggregates, setAggregates] = useState<FitsScanAggregates | null>(null)
  const [linkingStatus, setLinkingStatus] = useState<FitsLinkingStatus | null>(null)
  const [linking, setLinking] = useState(false)
  const [showSessionGenerator, setShowSessionGenerator] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadScans()
  }, [])

  useEffect(() => {
    if (selectedScanId) {
      invoke<FitsScanAggregates>('fits:scan-aggregates', { scan_id: selectedScanId }).then(setAggregates)
      invoke<FitsLinkingStatus>('fits:linking-status', { scan_id: selectedScanId }).then(setLinkingStatus)
    } else {
      setAggregates(null)
      setLinkingStatus(null)
    }
    setSelectedFileId(null)
  }, [selectedScanId])

  async function handleLinkToTargets(): Promise<void> {
    if (!selectedScanId) return
    setLinking(true)
    await invoke('fits:link-files', { scan_id: selectedScanId })
    const status = await invoke<FitsLinkingStatus>('fits:linking-status', { scan_id: selectedScanId })
    setLinkingStatus(status)
    setLinking(false)
  }

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
            <div className="flex items-center gap-3">
              <button
                onClick={handleLinkToTargets}
                disabled={linking}
                className="px-4 py-2 bg-astro-accent text-white rounded hover:bg-astro-accent/80 disabled:opacity-50 text-sm transition-colors"
              >
                {linking ? 'Linking...' : 'Link to Targets'}
              </button>
              <button
                onClick={() => setShowSessionGenerator(!showSessionGenerator)}
                className="px-4 py-2 border border-astro-border text-astro-text text-sm rounded hover:bg-astro-bg transition-colors"
              >
                {showSessionGenerator ? 'Hide Session Generator' : 'Generate Sessions'}
              </button>
              {linkingStatus && (
                <span className="text-sm text-astro-muted">
                  {linkingStatus.linked} linked, {linkingStatus.unlinked} unlinked
                </span>
              )}
            </div>

            {showSessionGenerator && (
              <SessionGenerator
                scanId={selectedScanId}
                onComplete={() => {
                  setShowSessionGenerator(false)
                  loadScans()
                }}
              />
            )}

            <AggregateView aggregates={aggregates} linkingStatus={linkingStatus} />

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
