import React, { useState, useEffect } from 'react'
import { invoke } from '../../hooks/useIPC'

interface ScanControlsProps {
  onScanComplete: () => void
}

export function ScanControls({ onScanComplete }: ScanControlsProps): React.ReactElement {
  const [folderPath, setFolderPath] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    invoke<{ value: string | null }>('settings:get', { key: 'fits_master_folder' }).then((r) => {
      if (r.value) setFolderPath(r.value)
    })
  }, [])

  async function handleBrowse(): Promise<void> {
    const result = await invoke<{ path: string | null }>('fits:pick-folder')
    if (result.path) setFolderPath(result.path)
  }

  async function handleScan(): Promise<void> {
    if (!folderPath) return
    setScanning(true)
    setError(null)
    try {
      await invoke('fits:start-scan', { folder_path: folderPath })
      onScanComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">Scan Folder</h2>
      <div className="flex gap-2">
        <div className="flex-1 bg-astro-bg border border-astro-border rounded px-3 py-2 text-sm text-astro-text truncate flex items-center min-h-[38px]">
          {folderPath || <span className="text-astro-muted italic">Select a folder...</span>}
        </div>
        <button
          onClick={handleBrowse}
          disabled={scanning}
          className="px-4 py-2 border border-astro-border text-astro-text text-sm rounded hover:bg-astro-bg transition-colors disabled:opacity-50"
        >
          Browse
        </button>
        <button
          onClick={handleScan}
          disabled={!folderPath || scanning}
          className="px-4 py-2 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 transition-colors disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
      </div>
      {error && <p className="text-astro-danger text-sm mt-2">{error}</p>}
    </div>
  )
}
