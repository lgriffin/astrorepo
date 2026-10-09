import React, { useState, useEffect, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState, LinkButton } from '../components/common/Card'
import { useNavigate } from 'react-router-dom'
import { settingsLink } from '@shared/navigation'
import { StatCard } from '../components/common/StatCard'
import { invoke } from '../hooks/useIPC'
import { SeasonsTable } from '../components/cockpit/SeasonsTable'
import { MosaicPlanner } from '../components/sky/MosaicPlanner'
import type { AltitudePoint, BestTargetTonight, ForwardPlanView, MoonInfo, TwilightTimes, MonthlyVisibility } from '@shared/types'

function AltitudeChart({ data }: { data: AltitudePoint[] }): React.ReactElement {
  if (data.length < 2) return <p className="text-astro-muted text-sm">No altitude data available</p>

  const w = 700
  const h = 200
  const padL = 40
  const padR = 10
  const padT = 10
  const padB = 30
  const chartW = w - padL - padR
  const chartH = h - padT - padB

  const maxAlt = 90
  const minAlt = Math.min(0, ...data.map(d => d.altitude))
  const range = maxAlt - minAlt

  const points = data.map((d, i) => {
    const x = padL + (i / (data.length - 1)) * chartW
    const y = padT + chartH - ((d.altitude - minAlt) / range) * chartH
    return { x, y, alt: d.altitude, time: d.time }
  })

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  const horizonY = padT + chartH - ((0 - minAlt) / range) * chartH
  const alt30Y = padT + chartH - ((30 - minAlt) / range) * chartH

  const gridAlts = [0, 15, 30, 45, 60, 75, 90].filter(a => a >= minAlt)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-52">
      {gridAlts.map(a => {
        const y = padT + chartH - ((a - minAlt) / range) * chartH
        return (
          <g key={a}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#374151" strokeWidth={0.5} />
            <text x={padL - 4} y={y + 3} textAnchor="end" className="text-[8px] fill-astro-muted">{a}°</text>
          </g>
        )
      })}

      <rect x={padL} y={horizonY} width={chartW} height={padT + chartH - horizonY} fill="#ef4444" opacity={0.05} />
      <line x1={padL} y1={horizonY} x2={w - padR} y2={horizonY} stroke="#ef4444" strokeWidth={1} strokeDasharray="4,4" opacity={0.5} />
      <line x1={padL} y1={alt30Y} x2={w - padR} y2={alt30Y} stroke="#22c55e" strokeWidth={0.5} strokeDasharray="4,4" opacity={0.3} />

      <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#6366f1" strokeWidth={2} />

      {/* Fill area above horizon */}
      <path
        d={`${pathD} L${points[points.length - 1].x},${horizonY} L${points[0].x},${horizonY} Z`}
        fill="#6366f1"
        opacity={0.1}
      />

      {/* Time labels - every 2 hours */}
      {points.filter((_, i) => i % 8 === 0).map((p, i) => (
        <text key={i} x={p.x} y={h - 5} textAnchor="middle" className="text-[8px] fill-astro-muted">
          {p.time.slice(11, 16)}
        </text>
      ))}
    </svg>
  )
}

function VisibilityCalendar({ data }: { data: MonthlyVisibility[] }): React.ReactElement {
  if (data.length === 0) return <p className="text-astro-muted text-sm">No visibility data</p>

  const maxAlt = Math.max(...data.map(d => d.maxAltitude), 1)

  return (
    <div className="grid grid-cols-12 gap-1">
      {data.map(d => {
        const intensity = Math.max(0, d.maxAltitude / maxAlt)
        const bg = d.isVisible
          ? `rgba(99, 102, 241, ${0.2 + intensity * 0.6})`
          : 'rgba(239, 68, 68, 0.1)'

        return (
          <div
            key={d.month}
            className="text-center rounded p-1"
            style={{ backgroundColor: bg }}
            title={`${d.month}: ${d.maxAltitude.toFixed(0)}° max altitude`}
          >
            <div className="text-[9px] text-astro-muted">{d.month.slice(5)}</div>
            <div className="text-[10px] text-astro-text font-medium">{d.maxAltitude.toFixed(0)}°</div>
          </div>
        )
      })}
    </div>
  )
}

function formatMoonPhase(phase: number): string {
  const pct = ((1 - Math.cos(phase * Math.PI / 180)) / 2 * 100).toFixed(0)
  return `${pct}%`
}

function moonIcon(phaseName: string): string {
  const icons: Record<string, string> = {
    'New Moon': '\u{1F311}',
    'Waxing Crescent': '\u{1F312}',
    'First Quarter': '\u{1F313}',
    'Waxing Gibbous': '\u{1F314}',
    'Full Moon': '\u{1F315}',
    'Waning Gibbous': '\u{1F316}',
    'Last Quarter': '\u{1F317}',
    'Waning Crescent': '\u{1F318}'
  }
  return icons[phaseName] ?? ''
}

export function SkyPlanner(): React.ReactElement {
  const navigate = useNavigate()
  const [lat, setLat] = useState<number | null>(null)
  const [lon, setLon] = useState<number | null>(null)
  const [elevation, setElevation] = useState<number>(0)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [locationLoaded, setLocationLoaded] = useState(false)

  const [bestTargets, setBestTargets] = useState<BestTargetTonight[]>([])
  const [moonInfo, setMoonInfo] = useState<MoonInfo | null>(null)
  const [twilight, setTwilight] = useState<TwilightTimes | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [altitudeCurve, setAltitudeCurve] = useState<AltitudePoint[]>([])
  const [visibility, setVisibility] = useState<MonthlyVisibility[]>([])
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState<ForwardPlanView | null>(null)

  const loadLocation = useCallback(async () => {
    const [latResult, lonResult, elevResult] = await Promise.all([
      invoke<{ value: string | null }>('settings:get', { key: 'observer_latitude' }),
      invoke<{ value: string | null }>('settings:get', { key: 'observer_longitude' }),
      invoke<{ value: string | null }>('settings:get', { key: 'observer_elevation' })
    ])
    if (latResult.value) setLat(parseFloat(latResult.value))
    if (lonResult.value) setLon(parseFloat(lonResult.value))
    if (elevResult.value) setElevation(parseFloat(elevResult.value))
    setLocationLoaded(true)
  }, [])

  useEffect(() => {
    loadLocation()
  }, [loadLocation])

  const loadSkyData = useCallback(async () => {
    if (lat === null || lon === null) return
    setLoading(true)

    const [targets, moon, tw] = await Promise.all([
      invoke<{ targets: BestTargetTonight[] }>('sky:best-tonight', { lat, lon, elevation }).then(r => r.targets),
      invoke<MoonInfo>('sky:moon-info', { date }),
      invoke<TwilightTimes>('sky:twilight', { date, lat, lon, elevation })
    ])

    setBestTargets(targets)
    setMoonInfo(moon)
    setTwilight(tw)
    setLoading(false)
  }, [lat, lon, elevation, date])

  useEffect(() => {
    if (locationLoaded && lat !== null && lon !== null) {
      loadSkyData()
    }
  }, [locationLoaded, loadSkyData, lat, lon])

  // The season plan reads the saved site, so it reloads on load and after each save, not on every edit.
  const loadPlan = useCallback(() => {
    invoke<ForwardPlanView>('planning:forward').then(setPlan).catch(() => setPlan(null))
  }, [])

  useEffect(() => {
    if (locationLoaded) loadPlan()
  }, [locationLoaded, loadPlan])

  const loadTargetDetail = useCallback(async (targetId: string) => {
    if (lat === null || lon === null) return
    setSelectedTarget(targetId)

    const [curve, vis] = await Promise.all([
      invoke<{ points: AltitudePoint[] }>('sky:altitude-curve', { target_id: targetId, date, lat, lon, elevation }).then(r => r.points),
      invoke<{ months: MonthlyVisibility[] }>('sky:target-visibility', { target_id: targetId, lat, lon, elevation }).then(r => r.months)
    ])

    setAltitudeCurve(curve)
    setVisibility(vis)
  }, [lat, lon, elevation, date])


  if (!locationLoaded) {
    return (
      <PageContainer>
        <p className="text-astro-muted text-sm">Loading observer location...</p>
      </PageContainer>
    )
  }

  if (lat === null || lon === null) {
    return (
      <PageContainer>
        <Card title="Your site">
          <EmptyState action={<LinkButton onClick={() => navigate(settingsLink('location'))}>Set your site in Settings</LinkButton>}>
            The Sky planner works out tonight, the moon and each target's season from where your scopes stand. Set your latitude and
            longitude once in Settings and every page uses it.
          </EmptyState>
        </Card>
        <div className="mt-6">
          <MosaicPlanner />
        </div>
      </PageContainer>
    )
  }

  const selectedName = bestTargets.find(t => t.targetId === selectedTarget)?.targetName

  return (
    <PageContainer
      subtitle={`Your site: ${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E, set in Settings`}
      actions={
        <div className="flex items-center gap-2">
          <LinkButton onClick={() => navigate(settingsLink('location'))}>Change your site</LinkButton>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent"
          />
        </div>
      }
    >
      <div className="space-y-6">
        {/* Moon & Twilight */}
        {(moonInfo || twilight) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {moonInfo && (
              <>
                <StatCard
                  label="Moon phase"
                  value={`${moonIcon(moonInfo.phaseName)} ${moonInfo.phaseName}`}
                  compact
                />
                <StatCard
                  label="Illumination"
                  value={formatMoonPhase(moonInfo.phase)}
                  compact
                />
              </>
            )}
            {twilight && (
              <>
                {twilight.astronomicalDusk && (
                  <StatCard label="Astro dusk" value={twilight.astronomicalDusk.slice(11, 16)} compact />
                )}
                {twilight.astronomicalDawn && (
                  <StatCard label="Astro dawn" value={twilight.astronomicalDawn.slice(11, 16)} compact />
                )}
              </>
            )}
          </div>
        )}

        {twilight && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">Twilight Times</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-astro-muted text-xs">Sunset</span>
                <p className="text-astro-text">{twilight.sunset?.slice(11, 16) ?? '—'}</p>
              </div>
              <div>
                <span className="text-astro-muted text-xs">Civil Dusk</span>
                <p className="text-astro-text">{twilight.civilDusk?.slice(11, 16) ?? '—'}</p>
              </div>
              <div>
                <span className="text-astro-muted text-xs">Nautical Dusk</span>
                <p className="text-astro-text">{twilight.nauticalDusk?.slice(11, 16) ?? '—'}</p>
              </div>
              <div>
                <span className="text-astro-muted text-xs">Astronomical Dusk</span>
                <p className="text-astro-text">{twilight.astronomicalDusk?.slice(11, 16) ?? '—'}</p>
              </div>
              <div>
                <span className="text-astro-muted text-xs">Astronomical Dawn</span>
                <p className="text-astro-text">{twilight.astronomicalDawn?.slice(11, 16) ?? '—'}</p>
              </div>
              <div>
                <span className="text-astro-muted text-xs">Nautical Dawn</span>
                <p className="text-astro-text">{twilight.nauticalDawn?.slice(11, 16) ?? '—'}</p>
              </div>
              <div>
                <span className="text-astro-muted text-xs">Civil Dawn</span>
                <p className="text-astro-text">{twilight.civilDawn?.slice(11, 16) ?? '—'}</p>
              </div>
              <div>
                <span className="text-astro-muted text-xs">Sunrise</span>
                <p className="text-astro-text">{twilight.sunrise?.slice(11, 16) ?? '—'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Best Targets */}
          <div className="lg:col-span-2 bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">
              Best Targets Tonight
            </h2>
            {loading ? (
              <p className="text-astro-muted text-sm">Computing visibility...</p>
            ) : bestTargets.length === 0 ? (
              <p className="text-astro-muted text-sm">No targets with coordinates found. Add RA/Dec to your targets to see visibility data.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-astro-border text-left">
                      <th className="pb-2 pr-3 text-astro-muted font-medium">Target</th>
                      <th className="pb-2 pr-3 text-astro-muted font-medium">Type</th>
                      <th className="pb-2 pr-3 text-astro-muted font-medium text-right">Max Alt</th>
                      <th className="pb-2 pr-3 text-astro-muted font-medium text-right">Transit</th>
                      <th className="pb-2 text-astro-muted font-medium text-right">Hours &gt;30°</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestTargets.map((t, i) => (
                      <tr
                        key={t.targetId}
                        onClick={() => loadTargetDetail(t.targetId)}
                        className={`border-b border-astro-border/50 cursor-pointer hover:bg-astro-bg/50 transition-colors ${selectedTarget === t.targetId ? 'bg-astro-accent/10' : ''}`}
                      >
                        <td className="py-2 pr-3 text-astro-text">
                          <span className="text-astro-accent mr-2 text-xs">#{i + 1}</span>
                          {t.targetName}
                        </td>
                        <td className="py-2 pr-3 text-astro-muted text-xs capitalize">{t.objectType.replace(/_/g, ' ')}</td>
                        <td className="py-2 pr-3 text-right">
                          <span className={t.maxAltitude >= 30 ? 'text-green-400' : t.maxAltitude >= 15 ? 'text-yellow-400' : 'text-red-400'}>
                            {t.maxAltitude.toFixed(1)}°
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-astro-text text-right">
                          {t.transitTime?.slice(11, 16) ?? '—'}
                        </td>
                        <td className="py-2 text-astro-text text-right">{t.hoursAbove30.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Target Detail Panel */}
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">
              {selectedName ? `${selectedName}` : 'Select a Target'}
            </h2>
            {selectedTarget && altitudeCurve.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs text-astro-muted mb-2">Altitude Curve</h3>
                  <AltitudeChart data={altitudeCurve} />
                </div>
                {visibility.length > 0 && (
                  <div>
                    <h3 className="text-xs text-astro-muted mb-2">12-Month Visibility</h3>
                    <VisibilityCalendar data={visibility} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-astro-muted text-sm">Click a target from the list to see its altitude curve and seasonal visibility.</p>
            )}
          </div>
        </div>
      </div>

      {plan?.status === 'ok' && (
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Seasons for targets with work left</h2>
            <SeasonsTable plan={plan} />
          </div>
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">New-moon windows</h2>
            {plan.windows.length === 0 && <p className="text-sm text-astro-muted">No new moon in the next 90 days.</p>}
            <ul className="space-y-3">
              {plan.windows.map(w => (
                <li key={w.newMoon}>
                  <p className="text-sm text-astro-text">{w.label}</p>
                  <p className="text-xs text-astro-muted">
                    {w.targets.length > 0 ? w.targets.map(t => `${t.targetName} (${t.detail})`).join(', ') : 'No target with work left is well placed.'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-6">
        <MosaicPlanner />
      </div>
    </PageContainer>
  )
}
