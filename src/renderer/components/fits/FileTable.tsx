import React, { useState, useEffect } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { FitsFileSummary } from '@shared/types'

interface FileTableProps {
  scanId: string
  onSelectFile: (fileId: string) => void
  selectedFileId: string | null
}

type SortCol = 'file_name' | 'date_obs' | 'exposure_sec' | 'object_name' | 'filter' | 'file_size_bytes' | 'folder_name'

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileTable({ scanId, onSelectFile, selectedFileId }: FileTableProps): React.ReactElement {
  const [files, setFiles] = useState<FitsFileSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [sortBy, setSortBy] = useState<SortCol>('file_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterFolder, setFilterFolder] = useState('')
  const [filterObj, setFilterObj] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterFilter, setFilterFilter] = useState('')
  const [folders, setFolders] = useState<string[]>([])
  const [objects, setObjects] = useState<string[]>([])
  const [filters, setFilters] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])
  const limit = 50

  useEffect(() => {
    invoke<{ totalFiles: number; uniqueObjects: string[]; uniqueFilters: string[]; uniqueFolders: string[]; filesByImageType: Record<string, number> }>(
      'fits:scan-aggregates', { scan_id: scanId }
    ).then((agg) => {
      setObjects(agg.uniqueObjects)
      setFilters(agg.uniqueFilters)
      setFolders(agg.uniqueFolders)
      setTypes(Object.keys(agg.filesByImageType))
    })
  }, [scanId])

  async function loadFiles(): Promise<void> {
    const params: Record<string, unknown> = {
      scan_id: scanId,
      limit,
      offset: page * limit,
      sort_by: sortBy,
      sort_dir: sortDir
    }
    if (filterFolder) params.filter_folder = filterFolder
    if (filterObj) params.filter_object = filterObj
    if (filterType) params.filter_image_type = filterType
    if (filterFilter) params.filter_filter = filterFilter

    const result = await invoke<{ files: FitsFileSummary[]; total: number }>('fits:list-files', params)
    setFiles(result.files)
    setTotal(result.total)
  }

  useEffect(() => {
    loadFiles()
  }, [scanId, page, sortBy, sortDir, filterFolder, filterObj, filterType, filterFilter])

  function handleSort(col: SortCol): void {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
    setPage(0)
  }

  function sortIndicator(col: SortCol): string {
    if (sortBy !== col) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-astro-border flex flex-wrap gap-2 items-center">
        <span className="text-sm text-astro-muted">{total} files</span>
        <select value={filterFolder} onChange={e => { setFilterFolder(e.target.value); setPage(0) }} className="bg-astro-bg border border-astro-border rounded px-2 py-1 text-sm text-astro-text">
          <option value="">All folders</option>
          {folders.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={filterObj} onChange={e => { setFilterObj(e.target.value); setPage(0) }} className="bg-astro-bg border border-astro-border rounded px-2 py-1 text-sm text-astro-text">
          <option value="">All objects</option>
          {objects.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0) }} className="bg-astro-bg border border-astro-border rounded px-2 py-1 text-sm text-astro-text">
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterFilter} onChange={e => { setFilterFilter(e.target.value); setPage(0) }} className="bg-astro-bg border border-astro-border rounded px-2 py-1 text-sm text-astro-text">
          <option value="">All filters</option>
          {filters.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-astro-muted uppercase tracking-wider border-b border-astro-border">
              <th className="px-4 py-2 cursor-pointer hover:text-astro-text" onClick={() => handleSort('file_name')}>File{sortIndicator('file_name')}</th>
              <th className="px-4 py-2 cursor-pointer hover:text-astro-text" onClick={() => handleSort('folder_name')}>Folder{sortIndicator('folder_name')}</th>
              <th className="px-4 py-2 cursor-pointer hover:text-astro-text" onClick={() => handleSort('object_name')}>Object{sortIndicator('object_name')}</th>
              <th className="px-4 py-2 cursor-pointer hover:text-astro-text" onClick={() => handleSort('filter')}>Filter{sortIndicator('filter')}</th>
              <th className="px-4 py-2 cursor-pointer hover:text-astro-text" onClick={() => handleSort('exposure_sec')}>Exp{sortIndicator('exposure_sec')}</th>
              <th className="px-4 py-2 cursor-pointer hover:text-astro-text" onClick={() => handleSort('date_obs')}>Date{sortIndicator('date_obs')}</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 cursor-pointer hover:text-astro-text" onClick={() => handleSort('file_size_bytes')}>Size{sortIndicator('file_size_bytes')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-astro-border/50">
            {files.map((f) => (
              <tr
                key={f.id}
                onClick={() => onSelectFile(f.id)}
                className={`cursor-pointer transition-colors ${
                  selectedFileId === f.id ? 'bg-astro-accent/10' : 'hover:bg-astro-bg/50'
                }`}
              >
                <td className="px-4 py-2 text-astro-text truncate max-w-[200px]">{f.fileName}</td>
                <td className="px-4 py-2 text-astro-muted truncate max-w-[120px]">{f.folderName ?? '-'}</td>
                <td className="px-4 py-2 text-astro-text">{f.objectName ?? '-'}</td>
                <td className="px-4 py-2 text-astro-muted">{f.filter ?? '-'}</td>
                <td className="px-4 py-2 text-astro-muted">{f.exposureSec != null ? `${f.exposureSec}s` : '-'}</td>
                <td className="px-4 py-2 text-astro-muted truncate max-w-[140px]">{f.dateObs ?? '-'}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    {f.imageType && <span className="text-xs px-1.5 py-0.5 rounded bg-astro-bg text-astro-muted">{f.imageType}</span>}
                    {f.isStacked && <span className="text-xs px-1.5 py-0.5 rounded bg-astro-accent/20 text-astro-accent">stacked</span>}
                  </div>
                </td>
                <td className="px-4 py-2 text-astro-muted">{formatSize(f.fileSizeBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-astro-border flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-sm text-astro-muted hover:text-astro-text disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-astro-muted">Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="text-sm text-astro-muted hover:text-astro-text disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
