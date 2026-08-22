import { getSqlite } from '../db/connection'
import type { CalendarDay, CalendarMonth, YearSummaryMonth } from '@shared/types'

export function getCalendarData(year: number, month?: number): CalendarMonth[] {
  const sqlite = getSqlite()

  const monthFilter = month
    ? `AND substr(date_obs, 1, 7) = '${year}-${String(month).padStart(2, '0')}'`
    : `AND substr(date_obs, 1, 4) = '${year}'`

  const rows = sqlite.prepare(`
    SELECT substr(date_obs, 1, 10) as date,
           SUM(exposure_sec) as totalExposureSec,
           COUNT(*) as fileCount,
           GROUP_CONCAT(DISTINCT COALESCE(object_name, folder_name)) as targets,
           GROUP_CONCAT(DISTINCT filter) as filters
    FROM fits_files
    WHERE date_obs IS NOT NULL ${monthFilter}
    GROUP BY substr(date_obs, 1, 10)
    ORDER BY date
  `).all() as Array<{
    date: string; totalExposureSec: number; fileCount: number
    targets: string | null; filters: string | null
  }>

  const sessionRows = sqlite.prepare(`
    SELECT date, id FROM observation_sessions
    WHERE substr(date, 1, 4) = ?
    ORDER BY date
  `).all(String(year)) as Array<{ date: string; id: string }>

  const sessionsByDate = new Map<string, string[]>()
  for (const sr of sessionRows) {
    const d = sr.date.substring(0, 10)
    const list = sessionsByDate.get(d)
    if (list) list.push(sr.id)
    else sessionsByDate.set(d, [sr.id])
  }

  const daysByMonth = new Map<string, CalendarDay[]>()
  for (const row of rows) {
    const m = row.date.substring(0, 7)
    const day: CalendarDay = {
      date: row.date,
      totalExposureSec: row.totalExposureSec,
      fileCount: row.fileCount,
      targets: row.targets?.split(',').filter(Boolean) ?? [],
      filters: row.filters?.split(',').filter(Boolean) ?? [],
      sessionIds: sessionsByDate.get(row.date) ?? []
    }
    const list = daysByMonth.get(m)
    if (list) list.push(day)
    else daysByMonth.set(m, [day])
  }

  const months: CalendarMonth[] = []
  for (const [m, days] of daysByMonth) {
    months.push({
      month: m,
      days,
      totalExposureSec: days.reduce((s, d) => s + d.totalExposureSec, 0),
      activeDays: days.length
    })
  }

  return months
}

export function getYearSummary(year: number): YearSummaryMonth[] {
  const sqlite = getSqlite()
  return sqlite.prepare(`
    SELECT substr(date_obs, 1, 7) as month,
           COUNT(DISTINCT substr(date_obs, 1, 10)) as activeDays,
           SUM(exposure_sec) as totalExposureSec
    FROM fits_files
    WHERE substr(date_obs, 1, 4) = ? AND date_obs IS NOT NULL
    GROUP BY substr(date_obs, 1, 7)
    ORDER BY month
  `).all(String(year)) as YearSummaryMonth[]
}
