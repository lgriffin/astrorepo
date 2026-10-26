import React, { useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import { PreviewPanel } from '../fits/Inspector'
import { Slider } from '../target/CompareCard'
import { Badge, Button, Select, Table, Td, Th } from '../ui'
import type { ExperimentComparisonView, PreviewView } from '@shared/types'

/**
 * The variants' final images side by side or two under a slider, each with the same auto-stretch,
 * and the same figures in one table, without a winner named (specs/040-experiment-lab, PE-005).
 */
export function ExperimentCompare({ experimentId, version }: { experimentId: string; version: string }): React.ReactElement {
  const [view, setView] = useState<ExperimentComparisonView | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [mode, setMode] = useState<'side' | 'slider'>('side')
  const [pair, setPair] = useState<[string, string]>(['', ''])

  useEffect(() => {
    let current = true
    setView(null)
    invoke<ExperimentComparisonView | null>('experiment:compare', { experiment_id: experimentId })
      .then(v => {
        if (!current) return
        setView(v)
        const shown = v?.variants.filter(x => x.preview) ?? []
        setPair([shown[0]?.letter ?? '', shown[1]?.letter ?? ''])
      })
      .catch(error => current && setFailed(error instanceof Error ? error.message : String(error)))
    return () => {
      current = false
    }
  }, [experimentId, version])

  if (failed) return <p className="text-sm text-astro-danger">The variants could not be compared: {failed}</p>
  if (!view) return <p className="text-sm text-astro-muted">Reading each variant’s final image…</p>

  const shown = view.variants.filter(v => v.preview)
  const preview = (letter: string) => view.variants.find(v => v.letter === letter)?.preview as PreviewView
  const labels = view.variants[0]?.figures?.map(f => f.label) ?? view.variants.find(v => v.figures)?.figures?.map(f => f.label) ?? []
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={mode === 'side' ? 'primary' : 'ghost'} onClick={() => setMode('side')}>Side by side</Button>
        <Button size="sm" variant={mode === 'slider' ? 'primary' : 'ghost'} onClick={() => setMode('slider')} disabled={shown.length < 2}>Slider</Button>
        {mode === 'slider' &&
          [0, 1].map(k => (
            <Select key={k} aria-label={k === 0 ? 'Left variant' : 'Right variant'} className="max-w-[10rem]" value={pair[k]} onChange={e => setPair(p => (k === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))}>
              {shown.map(v => <option key={v.letter} value={v.letter}>Variant {v.letter}</option>)}
            </Select>
          ))}
      </div>
      {mode === 'side' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {view.variants.map(v => (
            <div key={v.letter} className="space-y-1">
              <p className="text-xs text-astro-muted">
                Variant {v.letter}: {v.settings} {v.preferred && <Badge tone="success">Preferred</Badge>}
              </p>
              {v.preview ? <PreviewPanel view={v.preview} label={v.file ?? undefined} /> : <p className="text-xs text-astro-warning">{v.error ?? 'Nothing to show yet.'}</p>}
            </div>
          ))}
        </div>
      ) : (
        pair[0] && pair[1] && <Slider a={preview(pair[0])} b={preview(pair[1])} />
      )}
      {labels.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Figure</Th>
              {view.variants.map(v => <Th key={v.letter} align="right">Variant {v.letter}</Th>)}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label}>
                <Td>{label}</Td>
                {view.variants.map(v => <Td key={v.letter} align="right">{v.figures?.[i]?.value ?? '–'}</Td>)}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {view.notes.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-astro-muted space-y-0.5">
          {view.notes.map(n => <li key={n}>{n}</li>)}
        </ul>
      )}
      <p className="text-[10px] text-astro-muted">Every image gets the same auto-stretch, worked out from its own sky; the figures come from the full file.</p>
    </div>
  )
}
