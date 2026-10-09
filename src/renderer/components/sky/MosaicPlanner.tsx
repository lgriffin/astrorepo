import React, { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Card, EmptyState, LinkButton } from '../common/Card'
import { invoke } from '../../hooks/useIPC'
import { useToast } from '../../contexts/ToastContext'
import { mosaicTargetFrom, targetLink } from '@shared/navigation'
import type { Equipment, FOVResult, MosaicPlanView, TargetSummary } from '@shared/types'

const input = 'px-2 py-1 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent'
const button = 'px-3 py-1.5 text-xs bg-astro-accent/10 text-astro-accent border border-astro-accent/30 rounded hover:bg-astro-accent/20 transition-colors disabled:opacity-50'

/**
 * The mosaic planner on the Sky planner (specs/024-sky-geometry, SKY-007 to SKY-010): pick a
 * target and the scope and camera from Equipment, turn the panels, and read each tile's centre,
 * the hours it needs and the nights every panel is up. A link can open it on a target.
 */
export function MosaicPlanner(): React.ReactElement {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const linked = mosaicTargetFrom(useLocation().search)
  const [targetId, setTargetId] = useState<string | null>(linked)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<TargetSummary[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [scope, setScope] = useState('')
  const [camera, setCamera] = useState('')
  const [reducer, setReducer] = useState('')
  const [field, setField] = useState<{ widthDeg: number; heightDeg: number } | null>(null)
  const [rotation, setRotation] = useState<number | null>(null)
  const [overlapPct, setOverlapPct] = useState<number | null>(null)
  const [view, setView] = useState<MosaicPlanView | null>(null)

  useEffect(() => {
    if (!linked) return
    setTargetId(linked)
    document.getElementById('mosaic')?.scrollIntoView({ behavior: 'smooth' })
  }, [linked])

  useEffect(() => {
    invoke<{ equipment: Equipment[] }>('equipment:list')
      .then(r => setEquipment(r.equipment))
      .catch(() => setEquipment([]))
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([])
      return
    }
    let current = true
    invoke<{ targets: TargetSummary[] }>('targets:search', { query, limit: 8 })
      .then(r => current && setMatches(r.targets))
      .catch(() => current && setMatches([]))
    return () => {
      current = false
    }
  }, [query])

  // The field of view comes from the Equipment page's own calculation for the pair picked. The old
  // field goes as soon as the pick changes, and an answer for a pick no longer current is dropped.
  useEffect(() => {
    setField(null)
    if (!scope || !camera) return
    let current = true
    invoke<FOVResult | null>('equipment:calculate-fov', { telescope_id: scope, camera_id: camera, reducer_id: reducer || undefined })
      .then(fov => current && setField(fov ? { widthDeg: fov.widthDeg, heightDeg: fov.heightDeg } : null))
      .catch(() => current && setField(null))
    return () => {
      current = false
    }
  }, [scope, camera, reducer])

  const request = useCallback(
    () => ({
      target_id: targetId as string,
      ...(field ? { field_width_deg: field.widthDeg, field_height_deg: field.heightDeg } : {}),
      ...(rotation !== null ? { rotation_deg: rotation } : {}),
      ...(overlapPct !== null ? { overlap: overlapPct / 100 } : {})
    }),
    [targetId, field, rotation, overlapPct]
  )

  useEffect(() => {
    if (!targetId) {
      setView(null)
      return
    }
    let current = true
    invoke<MosaicPlanView>('mosaic:plan', request())
      .then(v => current && setView(v))
      .catch(() => current && setView(null))
    return () => {
      current = false
    }
  }, [targetId, request])

  const save = async () => {
    if (!view?.field || !targetId) return
    const saved = await invoke<MosaicPlanView>('mosaic:save', {
      target_id: targetId,
      field_width_deg: view.field.widthDeg,
      field_height_deg: view.field.heightDeg,
      rotation_deg: view.rotationDeg,
      overlap: view.overlap
    })
    setView(saved)
    addToast('Plan saved. Next actions will say which tiles still have no lights.', 'success')
  }

  const exportCsv = async () => {
    if (!targetId) return
    const result = await invoke<{ saved: boolean; path?: string }>('mosaic:export', request())
    if (result.saved) addToast(`Tiles saved to ${result.path}`, 'success')
  }

  const pick = (id: string) => {
    setTargetId(id)
    setQuery('')
    setMatches([])
    setRotation(null)
    setOverlapPct(null)
  }

  const scopes = equipment.filter(e => e.equipmentType === 'telescope')
  const cameras = equipment.filter(e => e.equipmentType === 'camera')
  const reducers = equipment.filter(e => e.equipmentType === 'reducer')

  return (
    <Card title="Plan a mosaic" id="mosaic">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-astro-muted">Target</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={view?.targetName ?? 'Search by name'} className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-astro-muted">Scope</span>
            <select value={scope} onChange={e => setScope(e.target.value)} className={input}>
              <option value="">From solved lights</option>
              {scopes.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-astro-muted">Camera</span>
            <select value={camera} onChange={e => setCamera(e.target.value)} className={input}>
              <option value="">From solved lights</option>
              {cameras.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          {reducers.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-astro-muted">Reducer</span>
              <select value={reducer} onChange={e => setReducer(e.target.value)} className={input}>
                <option value="">None</option>
                {reducers.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-astro-muted">Rotation (°)</span>
            <input
              type="number"
              step={5}
              min={-180}
              max={180}
              value={rotation ?? view?.rotationDeg ?? 0}
              onChange={e => setRotation(Number(e.target.value))}
              className={`${input} w-24`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-astro-muted">Overlap (%)</span>
            <input
              type="number"
              step={5}
              min={15}
              max={50}
              value={overlapPct ?? Math.round((view?.overlap || 0.2) * 100)}
              onChange={e => setOverlapPct(Number(e.target.value))}
              className={`${input} w-20`}
            />
          </label>
        </div>

        {matches.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {matches.map(t => (
              <button key={t.id} onClick={() => pick(t.id)} className={button}>
                {t.canonicalName}
              </button>
            ))}
          </div>
        )}

        {!targetId && <EmptyState>Search for a target to plan a mosaic for it. It uses the catalogue size and the field of the scope and camera you pick.</EmptyState>}
        {scopes.length === 0 && cameras.length === 0 && (
          <EmptyState action={<LinkButton onClick={() => navigate('/equipment')}>Add your scope and camera</LinkButton>}>
            Your scope and camera in Equipment give the field of view each panel covers.
          </EmptyState>
        )}

        {view && view.status !== 'ok' && <p className="text-amber-400">{view.message}</p>}

        {view && view.status === 'ok' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-astro-text">
                {view.targetId && (
                  <Link to={targetLink(view.targetId)} className="text-astro-accent hover:underline mr-2">
                    {view.targetName}
                  </Link>
                )}
                {view.summary}
              </p>
              <div className="flex gap-2">
                <button onClick={exportCsv} className={button}>
                  Export CSV
                </button>
                <button onClick={save} disabled={view.fitsOneField} className={button}>
                  {view.saved ? 'Save changes' : 'Save plan'}
                </button>
              </div>
            </div>
            <p className="text-xs text-astro-muted">
              Each panel is {view.field ? `${view.field.widthDeg.toFixed(2)}° × ${view.field.heightDeg.toFixed(2)}°` : 'unknown'}, from {view.fieldFrom}.
              {view.goalNote ? ` ${view.goalNote}` : ''}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-astro-muted border-b border-astro-border">
                    <th className="py-1 pr-3 font-medium">Tile</th>
                    <th className="py-1 pr-3 font-medium">Row and column</th>
                    <th className="py-1 pr-3 font-medium">RA</th>
                    <th className="py-1 pr-3 font-medium">Dec</th>
                    <th className="py-1 pr-3 font-medium">Captured</th>
                    <th className="py-1 font-medium">Still needs</th>
                  </tr>
                </thead>
                <tbody>
                  {view.tiles.map(t => (
                    <tr key={t.tile} className="border-b border-astro-border/50">
                      <td className="py-1 pr-3 text-astro-text">{t.tile}</td>
                      <td className="py-1 pr-3 text-astro-muted">
                        {t.row}, {t.column}
                      </td>
                      <td className="py-1 pr-3 text-astro-text font-mono">{t.ra}</td>
                      <td className="py-1 pr-3 text-astro-text font-mono">{t.dec}</td>
                      <td className="py-1 pr-3 text-astro-muted">{t.captured}</td>
                      <td className="py-1 text-astro-muted">{t.needed ?? 'No goal set'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.nights ? (
              <div>
                <p className="text-astro-text">{view.nights.summary}</p>
                {view.nights.ranges.length > 0 && <p className="text-xs text-astro-muted mt-1">{view.nights.ranges.join(', ')}</p>}
              </div>
            ) : (
              <p className="text-xs text-astro-muted">Set your site in Settings to see the nights every panel is up.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
