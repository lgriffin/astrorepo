import React, { useState, useEffect } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { AutoSessionPreview, GeneratedSessionResult } from '@shared/types'

interface SessionGeneratorProps {
  scanId: string
  onComplete: () => void
}

export function SessionGenerator({ scanId, onComplete }: SessionGeneratorProps): React.ReactElement {
  const [previews, setPreviews] = useState<AutoSessionPreview[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<GeneratedSessionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPreviews()
  }, [scanId])

  async function loadPreviews(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const data = await invoke<{ previews: AutoSessionPreview[] }>('sessions:preview-auto', { scan_id: scanId })
      setPreviews(data.previews)
      // Select all pending (non-existing) sessions by default
      const pendingKeys = new Set(
        data.previews
          .filter((p) => !p.existingSessionId)
          .map((p) => `${p.folderName}/${p.sessionFolder}`)
      )
      setSelected(pendingKeys)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function toggleSelection(key: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function toggleAll(): void {
    if (selected.size === previews.filter((p) => !p.existingSessionId).length) {
      setSelected(new Set())
    } else {
      setSelected(
        new Set(
          previews
            .filter((p) => !p.existingSessionId)
            .map((p) => `${p.folderName}/${p.sessionFolder}`)
        )
      )
    }
  }

  async function handleGenerate(): Promise<void> {
    setGenerating(true)
    setError(null)
    try {
      const genResult = await invoke<GeneratedSessionResult>('sessions:generate-auto', { scan_id: scanId })
      setResult(genResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  function formatExposure(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remaining = Math.round(seconds % 60)
    if (minutes < 60) return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const remMins = minutes % 60
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
  }

  if (loading) {
    return (
      <div className="bg-astro-surface border border-astro-border rounded-lg p-6">
        <p className="text-astro-muted text-sm">Loading session previews...</p>
      </div>
    )
  }

  if (result) {
    return (
      <div className="bg-astro-surface border border-astro-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-astro-text mb-4">Session Generation Complete</h3>
        <div className="space-y-2 mb-4">
          <p className="text-sm text-astro-text">
            <span className="font-medium text-green-400">{result.created}</span> session{result.created !== 1 ? 's' : ''} created
          </p>
          {result.skipped > 0 && (
            <p className="text-sm text-astro-muted">
              {result.skipped} session{result.skipped !== 1 ? 's' : ''} skipped (already exist)
            </p>
          )}
        </div>
        {result.sessions.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-astro-muted mb-2">Created Sessions</h4>
            <ul className="space-y-1">
              {result.sessions.map((s) => (
                <li key={s.id} className="text-sm text-astro-text">
                  {s.date} - {s.folderName}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={onComplete}
          className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors"
        >
          Done
        </button>
      </div>
    )
  }

  const pendingPreviews = previews.filter((p) => !p.existingSessionId)
  const hasSelection = selected.size > 0

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-astro-text">Generate Sessions from FITS</h3>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={!hasSelection || generating}
            className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors disabled:opacity-50"
          >
            {generating ? 'Generating...' : `Generate ${selected.size > 0 ? `(${selected.size})` : 'All'}`}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-astro-danger text-sm mb-3">{error}</p>
      )}

      {previews.length === 0 ? (
        <p className="text-astro-muted text-sm">No session groups found in this scan. Files need both a folder name and session folder to generate sessions.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-astro-border text-left">
                <th className="pb-2 pr-3">
                  <input
                    type="checkbox"
                    checked={selected.size === pendingPreviews.length && pendingPreviews.length > 0}
                    onChange={toggleAll}
                    className="rounded border-astro-border"
                  />
                </th>
                <th className="pb-2 pr-3 text-astro-muted font-medium">Date</th>
                <th className="pb-2 pr-3 text-astro-muted font-medium">Target / Folder</th>
                <th className="pb-2 pr-3 text-astro-muted font-medium">Session Folder</th>
                <th className="pb-2 pr-3 text-astro-muted font-medium text-right">Lights</th>
                <th className="pb-2 pr-3 text-astro-muted font-medium text-right">Exposure</th>
                <th className="pb-2 pr-3 text-astro-muted font-medium">Filters</th>
                <th className="pb-2 text-astro-muted font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((preview) => {
                const key = `${preview.folderName}/${preview.sessionFolder}`
                const isExisting = preview.existingSessionId !== null
                return (
                  <tr key={key} className="border-b border-astro-border/50 hover:bg-astro-bg/50">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleSelection(key)}
                        disabled={isExisting}
                        className="rounded border-astro-border disabled:opacity-50"
                      />
                    </td>
                    <td className="py-2 pr-3 text-astro-text">{preview.date || '-'}</td>
                    <td className="py-2 pr-3 text-astro-text">
                      {preview.targetName ?? preview.folderName}
                    </td>
                    <td className="py-2 pr-3 text-astro-muted font-mono text-xs">{preview.sessionFolder}</td>
                    <td className="py-2 pr-3 text-astro-text text-right">{preview.lightCount}</td>
                    <td className="py-2 pr-3 text-astro-text text-right">{formatExposure(preview.totalExposureSec)}</td>
                    <td className="py-2 pr-3 text-astro-text">
                      <div className="flex gap-1 flex-wrap">
                        {preview.filters.map((f) => (
                          <span key={f} className="px-1.5 py-0.5 bg-astro-bg rounded text-xs text-astro-muted">
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">
                      {isExisting ? (
                        <span className="px-2 py-0.5 bg-astro-bg rounded text-xs text-astro-muted">Exists</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded text-xs">Pending</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
