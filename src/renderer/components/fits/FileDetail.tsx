import React, { useState, useEffect } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { FitsFileDetail as FitsFileDetailType, FitsHeaderRow, QualityMetrics } from '@shared/types'

interface FileDetailProps {
  fileId: string
  onClose: () => void
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }): React.ReactElement | null {
  if (value == null) return null
  return (
    <div>
      <dt className="text-xs text-astro-muted uppercase">{label}</dt>
      <dd className="text-sm text-astro-text mt-0.5">{value}</dd>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileDetail({ fileId, onClose }: FileDetailProps): React.ReactElement {
  const [file, setFile] = useState<FitsFileDetailType | null>(null)
  const [headers, setHeaders] = useState<FitsHeaderRow[]>([])
  const [showHeaders, setShowHeaders] = useState(false)
  const [headerSearch, setHeaderSearch] = useState('')
  const [thumbnail, setThumbnail] = useState<{ width: number; height: number; dataBase64: string } | null>(null)
  const [thumbnailLoading, setThumbnailLoading] = useState(false)
  const [quality, setQuality] = useState<QualityMetrics | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [computingStats, setComputingStats] = useState(false)

  useEffect(() => {
    invoke<FitsFileDetailType>('fits:get-file', { id: fileId }).then(setFile)
    invoke<{ headers: FitsHeaderRow[] }>('fits:get-headers', { file_id: fileId }).then(r => setHeaders(r.headers))
    setThumbnailLoading(true)
    setThumbnail(null)
    invoke<{ width: number; height: number; dataBase64: string } | null>('fits:get-thumbnail', { file_id: fileId })
      .then(result => setThumbnail(result))
      .catch(() => setThumbnail(null))
      .finally(() => setThumbnailLoading(false))
    invoke<{ metrics: QualityMetrics | null }>('quality:get-metrics', { file_id: fileId }).then(r => setQuality(r.metrics))
  }, [fileId])

  async function handleAnalyze(): Promise<void> {
    setAnalyzing(true)
    try {
      const result = await invoke<{ metrics: QualityMetrics | null }>('quality:analyze-file', { file_id: fileId })
      setQuality(result.metrics)
    } finally {
      setAnalyzing(false)
    }
  }

  if (!file) return <div className="text-astro-muted p-4">Loading...</div>

  const filteredHeaders = headerSearch
    ? headers.filter(h => h.keyword.toLowerCase().includes(headerSearch.toLowerCase()) || (h.value ?? '').toLowerCase().includes(headerSearch.toLowerCase()))
    : headers

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-astro-border flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-astro-text truncate">{file.fileName}</h3>
          <p className="text-xs text-astro-muted truncate">{file.filePath}</p>
        </div>
        <button onClick={onClose} className="text-astro-muted hover:text-astro-text ml-3 shrink-0">&times;</button>
      </div>

      <div className="p-4 space-y-5">
        {thumbnailLoading && (
          <div className="flex items-center gap-2 text-sm text-astro-muted">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating preview...
          </div>
        )}
        {thumbnail && (
          <div>
            <img
              src={`data:image/png;base64,${thumbnail.dataBase64}`}
              alt="FITS preview"
              className="max-w-[256px] rounded border border-astro-border"
            />
            <p className="text-xs text-astro-muted mt-1">{thumbnail.width} x {thumbnail.height} preview</p>
          </div>
        )}

        <div className="flex gap-3 text-sm text-astro-muted">
          <span>{formatSize(file.fileSizeBytes)}</span>
          {file.fileModifiedAt && <span>Modified: {new Date(file.fileModifiedAt).toLocaleDateString()}</span>}
          {file.folderName && <span>Folder: <span className="text-astro-text">{file.folderName}</span></span>}
          {file.sessionFolder && <span>Session: <span className="text-astro-text">{file.sessionFolder}</span></span>}
          {file.isStacked && <span className="text-astro-accent">Stacked</span>}
        </div>

        <div>
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Identity</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Object" value={file.objectName} />
            <div>
              <dt className="text-xs text-astro-muted uppercase">Linked Target</dt>
              <dd className="text-sm mt-0.5">
                {file.targetId
                  ? <span className="text-green-400">{file.targetId}</span>
                  : <span className="text-astro-muted">Not linked</span>
                }
              </dd>
            </div>
            <Field label="Telescope" value={file.telescope} />
            <Field label="Instrument" value={file.instrument} />
            <Field label="Observer" value={file.observer} />
          </dl>
        </div>

        <div>
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Exposure</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Exposure" value={file.exposureSec != null ? `${file.exposureSec}s` : null} />
            <Field label="Date-Obs" value={file.dateObs} />
            <Field label="Filter" value={file.filter} />
            <Field label="Gain" value={file.gain} />
            <Field label="Offset" value={file.offsetVal} />
            <Field label="Image Type" value={file.imageType} />
          </dl>
        </div>

        <div>
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Camera</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="CCD Temp" value={file.ccdTemp != null ? `${file.ccdTemp}°C` : null} />
            <Field label="Pixel Size X" value={file.xpixsz != null ? `${file.xpixsz}µm` : null} />
            <Field label="Pixel Size Y" value={file.ypixsz != null ? `${file.ypixsz}µm` : null} />
            <Field label="Binning" value={file.xbinning != null ? `${file.xbinning}x${file.ybinning ?? file.xbinning}` : null} />
          </dl>
        </div>

        <div>
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Coordinates</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="RA" value={file.ra} />
            <Field label="Dec" value={file.dec} />
            <Field label="Airmass" value={file.airmass} />
          </dl>
        </div>

        <div>
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Image</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="BITPIX" value={file.bitpix} />
            <Field label="Dimensions" value={file.naxis1 != null ? `${file.naxis1} x ${file.naxis2}` : null} />
            <Field label="BSCALE" value={file.bscale} />
            <Field label="BZERO" value={file.bzero} />
            <Field label="Software" value={file.software} />
          </dl>
        </div>

        {file.isStacked && (
          <div>
            <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Stacking</h4>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="NCOMBINE" value={file.ncombine} />
              <Field label="Total Exposure" value={file.totalExposure != null ? `${file.totalExposure}s` : null} />
              <Field label="CALSTAT" value={file.calstat} />
            </dl>
          </div>
        )}

        <div>
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Image Statistics</h4>
          {file.pixelMin != null || file.pixelMax != null ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">Min</p>
                <p className="text-sm text-astro-text font-mono">{file.pixelMin?.toFixed(2)}</p>
              </div>
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">Max</p>
                <p className="text-sm text-astro-text font-mono">{file.pixelMax?.toFixed(2)}</p>
              </div>
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">Mean</p>
                <p className="text-sm text-astro-text font-mono">{file.pixelMean?.toFixed(2)}</p>
              </div>
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">Std Dev</p>
                <p className="text-sm text-astro-text font-mono">{file.pixelStddev?.toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <button
              onClick={async () => {
                setComputingStats(true)
                try {
                  const result = await invoke<{ stats: { min: number; max: number; mean: number; stddev: number } | null }>('fits:compute-stats', { file_id: fileId })
                  if (result.stats) {
                    setFile(prev => prev ? { ...prev, pixelMin: result.stats!.min, pixelMax: result.stats!.max, pixelMean: result.stats!.mean, pixelStddev: result.stats!.stddev } : prev)
                  }
                } finally {
                  setComputingStats(false)
                }
              }}
              disabled={computingStats}
              className="text-sm px-3 py-1.5 rounded bg-astro-accent text-white hover:bg-astro-accent/80 disabled:opacity-50 transition-colors"
            >
              {computingStats ? 'Computing...' : 'Compute Stats'}
            </button>
          )}
        </div>

        <div>
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-2">Quality Metrics</h4>
          {quality ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">FWHM</p>
                <p className="text-sm text-astro-text font-mono">{quality.fwhmEstimate != null ? quality.fwhmEstimate.toFixed(2) : 'N/A'}</p>
              </div>
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">Background</p>
                <p className="text-sm text-astro-text font-mono">{quality.backgroundLevel != null ? quality.backgroundLevel.toFixed(1) : 'N/A'}</p>
              </div>
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">Star Count</p>
                <p className="text-sm text-astro-text font-mono">{quality.starCountEstimate ?? 'N/A'}</p>
              </div>
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">Noise</p>
                <p className="text-sm text-astro-text font-mono">{quality.noiseLevel != null ? quality.noiseLevel.toFixed(2) : 'N/A'}</p>
              </div>
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">Score</p>
                <p className="text-sm text-astro-text font-mono">{quality.qualityScore != null ? quality.qualityScore.toFixed(0) : 'N/A'}</p>
              </div>
              <div className="bg-astro-bg border border-astro-border rounded p-2">
                <p className="text-xs text-astro-muted">Flag</p>
                <p className={`text-sm font-mono font-semibold ${
                  quality.qualityFlag === 'good' ? 'text-green-400' :
                  quality.qualityFlag === 'warning' ? 'text-amber-400' :
                  quality.qualityFlag === 'reject' ? 'text-red-400' :
                  'text-astro-muted'
                }`}>{quality.qualityFlag ?? 'N/A'}</p>
              </div>
            </div>
          ) : (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="text-sm px-3 py-1.5 rounded bg-astro-accent text-white hover:bg-astro-accent/80 disabled:opacity-50 transition-colors"
            >
              {analyzing ? 'Analyzing...' : 'Analyze Quality'}
            </button>
          )}
        </div>

        <div>
          <button
            onClick={() => setShowHeaders(!showHeaders)}
            className="text-sm text-astro-accent hover:text-astro-accent/80 transition-colors"
          >
            {showHeaders ? 'Hide' : 'Show'} Raw Headers ({headers.length})
          </button>

          {showHeaders && (
            <div className="mt-2">
              <input
                type="text"
                value={headerSearch}
                onChange={e => setHeaderSearch(e.target.value)}
                placeholder="Search headers..."
                className="w-full bg-astro-bg border border-astro-border rounded px-3 py-1.5 text-sm text-astro-text mb-2 placeholder:text-astro-muted/50"
              />
              <div className="max-h-96 overflow-y-auto border border-astro-border rounded">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-left text-astro-muted uppercase border-b border-astro-border sticky top-0 bg-astro-surface">
                      <th className="px-2 py-1 w-8">#</th>
                      <th className="px-2 py-1 w-24">Keyword</th>
                      <th className="px-2 py-1">Value</th>
                      <th className="px-2 py-1">Comment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-astro-border/30">
                    {filteredHeaders.map((h) => (
                      <tr key={h.id} className="hover:bg-astro-bg/50">
                        <td className="px-2 py-0.5 text-astro-muted">{h.ordinal}</td>
                        <td className="px-2 py-0.5 text-astro-accent">{h.keyword}</td>
                        <td className="px-2 py-0.5 text-astro-text">{h.value ?? ''}</td>
                        <td className="px-2 py-0.5 text-astro-muted">{h.comment ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
