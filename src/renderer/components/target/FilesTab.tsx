import React from 'react'
import { invoke } from '../../hooks/useIPC'
import { formatExposure, formatSize } from '../../utils/format'
import { Card, EmptyState } from '../common/Card'
import type { TargetHomeData, TargetObservationData } from '@shared/types'

/** Files: where the target's data sits and what the index knows about it (UX-009). */
export function FilesTab({ homeData, obsData }: { homeData: TargetHomeData | null; obsData: TargetObservationData | null }): React.ReactElement {
  if (!homeData && !obsData) {
    return (
      <Card title="Folders">
        <EmptyState>No folders or FITS files are linked to this target yet. Scan your library, or link FITS files on the FITS files page.</EmptyState>
      </Card>
    )
  }
  return (
    <div className="space-y-6">
      {homeData && <HomeFolderSection homeData={homeData} />}
      {obsData && <ObservationDataSection data={obsData} />}
    </div>
  )
}

function OpenFolderButton({ folderPath }: { folderPath: string | null }): React.ReactElement | null {
  if (!folderPath) return null
  return (
    <button
      onClick={() => invoke('home:open-folder', { folder_path: folderPath })}
      className="p-1 text-astro-muted hover:text-astro-accent transition-colors"
      title="Open in file explorer"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    </button>
  )
}

function HomeFolderSection({ homeData }: { homeData: TargetHomeData }): React.ReactElement {
  const breakdowns = homeData.folderBreakdowns ?? []
  const labelMap: Record<string, string> = { raw: 'RAW FITS', stacked: 'STACKED', tif: 'TIF', images: 'IMAGES' }

  const hasBreakdowns = breakdowns.length > 0
  const fallbackRows = !hasBreakdowns ? [
    { label: 'Raw FITS', count: homeData.rawFiles, path: homeData.rawPath },
    { label: 'Stacked', count: homeData.stackedFiles, path: homeData.stackedPath },
    { label: 'TIF', count: homeData.tifFiles, path: homeData.tifPath },
    { label: 'Images', count: homeData.imageFiles, path: homeData.imagesPath }
  ] : []

  return (
    <Card title="Folders">
      {hasBreakdowns ? (
        <div className="space-y-3">
          {breakdowns.map((bd) => (
            <div key={bd.folderType}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-astro-muted font-semibold uppercase tracking-wider">
                  {labelMap[bd.folderType] ?? bd.folderType} ({bd.totalFiles} files)
                </span>
                <OpenFolderButton folderPath={bd.folderPath} />
              </div>
              <div className="space-y-0.5 pl-2">
                {bd.subfolders.map((sf, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5">
                    <span className="text-sm text-astro-text font-mono">{sf.name ?? '(root)'}/ </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-astro-muted tabular-nums">{sf.fileCount} files</span>
                      <OpenFolderButton folderPath={sf.path} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {fallbackRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-1">
              <span className="text-sm text-astro-muted">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-astro-text tabular-nums">
                  {row.count > 0 ? `${row.count} files` : '—'}
                </span>
                <OpenFolderButton folderPath={row.path} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-astro-muted mt-3">
        Last scanned: {new Date(homeData.scannedAt).toLocaleString()}
      </p>
    </Card>
  )
}

function ObservationDataSection({ data }: { data: TargetObservationData }): React.ReactElement {
  const imageTypes = data.filesByImageType ?? {}
  const lights = imageTypes['Light'] ?? imageTypes['light'] ?? imageTypes['LIGHT'] ?? 0
  const darks = imageTypes['Dark'] ?? imageTypes['dark'] ?? imageTypes['DARK'] ?? 0
  const flats = imageTypes['Flat'] ?? imageTypes['flat'] ?? imageTypes['FLAT'] ?? 0
  const biases = imageTypes['Bias'] ?? imageTypes['bias'] ?? imageTypes['BIAS'] ?? 0
  const folders = data.filesByFolder ?? {}

  return (
    <Card title="Observation data">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-astro-bg border border-astro-border rounded p-2">
          <p className="text-xs text-astro-muted">FITS Files</p>
          <p className="text-sm font-bold text-astro-text">{data.totalFiles}</p>
        </div>
        <div className="bg-astro-bg border border-astro-border rounded p-2">
          <p className="text-xs text-astro-muted">Total Exposure</p>
          <p className="text-sm font-bold text-astro-text">{formatExposure(data.totalExposureSec)}</p>
        </div>
        <div className="bg-astro-bg border border-astro-border rounded p-2">
          <p className="text-xs text-astro-muted">Data Size</p>
          <p className="text-sm font-bold text-astro-text">{formatSize(data.totalSizeBytes)}</p>
        </div>
        <div className="bg-astro-bg border border-astro-border rounded p-2">
          <p className="text-xs text-astro-muted">Sessions</p>
          <p className="text-sm font-bold text-astro-text">{data.sessions.length}</p>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Frame Breakdown</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="flex justify-between text-sm px-2 py-1 bg-astro-bg border border-astro-border rounded">
            <span className="text-astro-text">Lights</span>
            <span className="text-astro-muted font-medium">{lights}</span>
          </div>
          <div className="flex justify-between text-sm px-2 py-1 bg-astro-bg border border-astro-border rounded">
            <span className="text-astro-text">Darks</span>
            <span className="text-astro-muted font-medium">{darks}</span>
          </div>
          <div className="flex justify-between text-sm px-2 py-1 bg-astro-bg border border-astro-border rounded">
            <span className="text-astro-text">Flats</span>
            <span className="text-astro-muted font-medium">{flats}</span>
          </div>
          <div className="flex justify-between text-sm px-2 py-1 bg-astro-bg border border-astro-border rounded">
            <span className="text-astro-text">Biases</span>
            <span className="text-astro-muted font-medium">{biases}</span>
          </div>
        </div>
      </div>

      {Object.keys(folders).length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Folders</h4>
          <div className="space-y-1">
            {Object.entries(folders)
              .sort(([, a], [, b]) => b - a)
              .map(([folder, count]) => (
                <div key={folder} className="flex justify-between text-sm">
                  <span className="text-astro-text font-mono">{folder}</span>
                  <span className="text-astro-muted">{count} files</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {data.firstObserved && (
        <div className="flex gap-4 text-xs text-astro-muted mb-3">
          <span>First: {data.firstObserved.split('T')[0]}</span>
          {data.lastObserved && <span>Last: {data.lastObserved.split('T')[0]}</span>}
        </div>
      )}

      {Object.keys(data.exposureByFilter).length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Exposure by Filter</h4>
          <div className="space-y-1">
            {Object.entries(data.exposureByFilter)
              .sort(([, a], [, b]) => b - a)
              .map(([filter, secs]) => (
                <div key={filter} className="flex justify-between text-sm">
                  <span className="text-astro-text">{filter}</span>
                  <span className="text-astro-muted">{formatExposure(secs)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {data.stackedDetails && data.stackedDetails.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">
            Stacked / Processed ({data.stackedDetails.length})
          </h4>
          <div className="space-y-2">
            {data.stackedDetails.map((s, i) => (
              <div key={i} className="bg-astro-bg border border-astro-accent/20 rounded p-2">
                <p className="text-sm text-astro-text font-medium truncate">{s.fileName}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-astro-muted">
                  {s.filter && <span>Filter: {s.filter}</span>}
                  {s.ncombine && <span>{s.ncombine} frames combined</span>}
                  {s.totalExposureSec != null && <span>Integration: {formatExposure(s.totalExposureSec)}</span>}
                  {s.software && <span>Software: {s.software}</span>}
                  {s.dateObs && <span>Date: {s.dateObs.split('T')[0]}</span>}
                  <span>{formatSize(s.fileSizeBytes)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.sessions.length > 0 && (
        <div>
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Sessions</h4>
          <div className="space-y-1">
            {data.sessions.map((s) => (
              <div key={s} className="flex justify-between text-sm">
                <span className="text-astro-text">{s}</span>
                <span className="text-astro-muted">{data.filesBySession[s] ?? 0} files</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
