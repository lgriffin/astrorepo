import React, { useState, useEffect, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import { formatExposure } from '../utils/format'
import type { CalendarDay, CalendarMonth, YearSummaryMonth } from '@shared/types'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function MiniMonthGrid({ year, monthNum, dayMap, maxExposure, onClick, isSelected }: {
  year: number
  monthNum: number
  dayMap: Map<string, CalendarDay>
  maxExposure: number
  onClick: () => void
  isSelected: boolean
}): React.ReactElement {
  const daysInMonth = getDaysInMonth(year, monthNum)
  const firstDay = getFirstDayOfWeek(year, monthNum)
  const cells: Array<{ day: number; key: string }> = []

  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: 0, key: `pad-${i}` })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, key: dateStr })
  }

  return (
    <div
      onClick={onClick}
      className={`bg-astro-surface border rounded-lg p-2 cursor-pointer transition-colors ${
        isSelected ? 'border-astro-accent' : 'border-astro-border hover:border-astro-border/80'
      }`}
    >
      <div className="text-[10px] text-astro-muted font-medium mb-1">{MONTH_NAMES[monthNum - 1]}</div>
      <div className="grid grid-cols-7 gap-[2px]">
        {cells.map(c => {
          if (c.day === 0) {
            return <div key={c.key} className="w-[10px] h-[10px]" />
          }
          const data = dayMap.get(c.key)
          const intensity = data && maxExposure > 0
            ? Math.min(1, data.totalExposureSec / maxExposure)
            : 0

          return (
            <div
              key={c.key}
              className="w-[10px] h-[10px] rounded-[1px]"
              style={{
                backgroundColor: intensity > 0
                  ? `rgba(99, 102, 241, ${0.15 + intensity * 0.75})`
                  : 'rgba(55, 65, 81, 0.3)'
              }}
              title={data ? `${c.key}: ${formatExposure(data.totalExposureSec)}, ${data.fileCount} frames` : c.key}
            />
          )
        })}
      </div>
    </div>
  )
}

function FullMonthCalendar({ year, monthNum, dayMap, maxExposure, onSelectDay, selectedDay }: {
  year: number
  monthNum: number
  dayMap: Map<string, CalendarDay>
  maxExposure: number
  onSelectDay: (day: CalendarDay | null) => void
  selectedDay: string | null
}): React.ReactElement {
  const daysInMonth = getDaysInMonth(year, monthNum)
  const firstDay = getFirstDayOfWeek(year, monthNum)

  const rows: Array<Array<{ day: number; dateStr: string }>> = []
  let currentRow: Array<{ day: number; dateStr: string }> = []

  for (let i = 0; i < firstDay; i++) {
    currentRow.push({ day: 0, dateStr: '' })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    currentRow.push({ day: d, dateStr })
    if (currentRow.length === 7) {
      rows.push(currentRow)
      currentRow = []
    }
  }
  if (currentRow.length > 0) {
    while (currentRow.length < 7) currentRow.push({ day: 0, dateStr: '' })
    rows.push(currentRow)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-astro-text mb-2">
        {MONTH_NAMES[monthNum - 1]} {year}
      </h3>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map((l, i) => (
          <div key={i} className="text-center text-[10px] text-astro-muted font-medium">{l}</div>
        ))}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-7 gap-1 mb-1">
          {row.map((cell, ci) => {
            if (cell.day === 0) return <div key={ci} className="h-10" />

            const data = dayMap.get(cell.dateStr)
            const intensity = data && maxExposure > 0
              ? Math.min(1, data.totalExposureSec / maxExposure)
              : 0
            const isSelected = selectedDay === cell.dateStr

            return (
              <div
                key={ci}
                onClick={() => onSelectDay(data ?? null)}
                className={`h-10 rounded flex flex-col items-center justify-center cursor-pointer transition-colors ${
                  isSelected ? 'ring-1 ring-astro-accent' : ''
                }`}
                style={{
                  backgroundColor: intensity > 0
                    ? `rgba(99, 102, 241, ${0.1 + intensity * 0.5})`
                    : 'rgba(55, 65, 81, 0.15)'
                }}
              >
                <span className="text-[11px] text-astro-text">{cell.day}</span>
                {data && (
                  <span className="text-[8px] text-astro-muted">{data.fileCount}f</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function SessionTimeline(): React.ReactElement {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null)
  const [yearSummary, setYearSummary] = useState<YearSummaryMonth[]>([])
  const [calendarData, setCalendarData] = useState<CalendarMonth[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [summary, calendar] = await Promise.all([
      invoke<{ months: YearSummaryMonth[] }>('timeline:year-summary', { year }).then(r => r.months),
      invoke<{ months: CalendarMonth[] }>('timeline:calendar', { year }).then(r => r.months)
    ])
    setYearSummary(summary)
    setCalendarData(calendar)
    setLoading(false)
  }, [year])

  useEffect(() => {
    loadData()
  }, [loadData])

  const dayMap = new Map<string, CalendarDay>()
  for (const m of calendarData) {
    for (const d of m.days) {
      dayMap.set(d.date, d)
    }
  }

  const allExposures = Array.from(dayMap.values()).map(d => d.totalExposureSec)
  const maxExposure = allExposures.length > 0 ? Math.max(...allExposures) : 1

  const totalExposure = yearSummary.reduce((s, m) => s + m.totalExposureSec, 0)
  const totalDays = yearSummary.reduce((s, m) => s + m.activeDays, 0)

  return (
    <PageContainer
      title="Session Timeline"
      subtitle={`${totalDays} active nights in ${year} — ${formatExposure(totalExposure)} total`}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setYear(y => y - 1); setSelectedMonth(null); setSelectedDay(null) }}
            className="px-3 py-1.5 bg-astro-surface border border-astro-border rounded text-sm text-astro-muted hover:text-astro-text"
          >
            &lt;
          </button>
          <span className="text-sm font-semibold text-astro-text w-12 text-center">{year}</span>
          <button
            onClick={() => { setYear(y => y + 1); setSelectedMonth(null); setSelectedDay(null) }}
            className="px-3 py-1.5 bg-astro-surface border border-astro-border rounded text-sm text-astro-muted hover:text-astro-text"
          >
            &gt;
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="text-astro-muted text-sm">Loading timeline...</p>
      ) : (
        <div className="space-y-6">
          {/* Year at a glance */}
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">Year at a Glance</h2>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <MiniMonthGrid
                  key={m}
                  year={year}
                  monthNum={m}
                  dayMap={dayMap}
                  maxExposure={maxExposure}
                  onClick={() => { setSelectedMonth(m); setSelectedDay(null) }}
                  isSelected={selectedMonth === m}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3 text-[10px] text-astro-muted">
              <span>Less</span>
              {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                <div
                  key={i}
                  className="w-[10px] h-[10px] rounded-[1px]"
                  style={{ backgroundColor: v === 0 ? 'rgba(55, 65, 81, 0.3)' : `rgba(99, 102, 241, ${0.15 + v * 0.75})` }}
                />
              ))}
              <span>More</span>
            </div>
          </div>

          {/* Monthly detail */}
          {selectedMonth && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-astro-surface border border-astro-border rounded-lg p-4">
                <FullMonthCalendar
                  year={year}
                  monthNum={selectedMonth}
                  dayMap={dayMap}
                  maxExposure={maxExposure}
                  onSelectDay={setSelectedDay}
                  selectedDay={selectedDay?.date ?? null}
                />
              </div>

              <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
                <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">
                  {selectedDay ? selectedDay.date : 'Select a Night'}
                </h2>
                {selectedDay ? (
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-astro-muted">Total Exposure:</span>
                      <span className="text-astro-text ml-2">{formatExposure(selectedDay.totalExposureSec)}</span>
                    </div>
                    <div>
                      <span className="text-astro-muted">Frames:</span>
                      <span className="text-astro-text ml-2">{selectedDay.fileCount}</span>
                    </div>
                    {selectedDay.targets.length > 0 && (
                      <div>
                        <span className="text-astro-muted block mb-1">Targets:</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedDay.targets.map(t => (
                            <span key={t} className="px-2 py-0.5 bg-astro-bg rounded text-xs text-astro-text">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedDay.filters.length > 0 && (
                      <div>
                        <span className="text-astro-muted block mb-1">Filters:</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedDay.filters.map(f => (
                            <span key={f} className="px-2 py-0.5 bg-astro-accent/10 rounded text-xs text-astro-accent">{f}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-astro-muted text-sm">Click a day in the calendar to see session details.</p>
                )}
              </div>
            </div>
          )}

          {/* Monthly summary table */}
          {yearSummary.length > 0 && (
            <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">Monthly Summary</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-astro-border text-left">
                    <th className="pb-2 pr-3 text-astro-muted font-medium">Month</th>
                    <th className="pb-2 pr-3 text-astro-muted font-medium text-right">Active Nights</th>
                    <th className="pb-2 text-astro-muted font-medium text-right">Total Exposure</th>
                    <th className="pb-2 text-astro-muted font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {yearSummary.map(m => {
                    const maxDays = Math.max(...yearSummary.map(s => s.activeDays), 1)
                    const pct = (m.activeDays / maxDays) * 100
                    return (
                      <tr key={m.month} className="border-b border-astro-border/50">
                        <td className="py-2 pr-3 text-astro-text">{m.month}</td>
                        <td className="py-2 pr-3 text-astro-text text-right">{m.activeDays}</td>
                        <td className="py-2 text-astro-text text-right">{formatExposure(m.totalExposureSec)}</td>
                        <td className="py-2 pl-3 w-32">
                          <div className="w-full bg-astro-bg rounded-full h-1.5">
                            <div className="bg-astro-accent rounded-full h-1.5" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {yearSummary.length === 0 && !loading && (
            <div className="bg-astro-surface border border-astro-border rounded-lg p-8 text-center">
              <p className="text-astro-muted">No imaging activity found for {year}. Try a different year or scan some FITS files first.</p>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  )
}
