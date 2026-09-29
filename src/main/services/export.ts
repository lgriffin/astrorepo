import { getSqlite } from '../db/connection'

function toCsvRow(values: (string | number | null | boolean)[]): string {
  return values.map(v => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }).join(',')
}

export function exportTargetsCsv(): string {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(`
    SELECT canonical_name, object_type, ra_hours, dec_degrees, magnitude,
           angular_size_arcmin, constellation, workflow_stage, description
    FROM targets ORDER BY canonical_name
  `).all() as Array<Record<string, unknown>>

  const header = 'Name,Type,RA (hours),Dec (degrees),Magnitude,Size (arcmin),Constellation,Stage,Description'
  const lines = rows.map(r => toCsvRow([
    r.canonical_name as string, r.object_type as string,
    r.ra_hours as number | null, r.dec_degrees as number | null,
    r.magnitude as number | null, r.angular_size_arcmin as number | null,
    r.constellation as string | null, r.workflow_stage as string,
    r.description as string | null
  ]))
  return [header, ...lines].join('\n')
}

export function exportSessionsCsv(): string {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(`
    SELECT s.date, s.location_freetext, s.sky_quality, s.weather, s.seeing,
           s.transparency, s.moon_phase, s.total_frames, s.accepted_frames,
           s.total_exposure_sec, s.notes,
           GROUP_CONCAT(t.canonical_name, '; ') as target_names
    FROM observation_sessions s
    LEFT JOIN session_targets st ON st.session_id = s.id
    LEFT JOIN targets t ON t.id = st.target_id
    GROUP BY s.id
    ORDER BY s.date DESC
  `).all() as Array<Record<string, unknown>>

  const header = 'Date,Location,Sky Quality,Weather,Seeing,Transparency,Moon Phase,Total Frames,Accepted Frames,Total Exposure (s),Notes,Targets'
  const lines = rows.map(r => toCsvRow([
    r.date as string, r.location_freetext as string | null,
    r.sky_quality as number | null, r.weather as string | null,
    r.seeing as string | null, r.transparency as string | null,
    r.moon_phase as number | null, r.total_frames as number | null,
    r.accepted_frames as number | null, r.total_exposure_sec as number | null,
    r.notes as string | null, r.target_names as string | null
  ]))
  return [header, ...lines].join('\n')
}

export function exportFitsAggregatesCsv(): string {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(`
    SELECT COALESCE(t.canonical_name, f.object_name, f.folder_name) as target,
           f.filter, COUNT(*) as file_count,
           SUM(f.exposure_sec) as total_exposure,
           SUM(f.file_size_bytes) as total_size,
           MIN(f.date_obs) as first_obs, MAX(f.date_obs) as last_obs
    FROM fits_files f
    LEFT JOIN targets t ON t.id = f.target_id
    GROUP BY COALESCE(t.canonical_name, f.object_name, f.folder_name), f.filter
    ORDER BY target, f.filter
  `).all() as Array<Record<string, unknown>>

  const header = 'Target,Filter,File Count,Total Exposure (s),Total Size (bytes),First Obs,Last Obs'
  const lines = rows.map(r => toCsvRow([
    r.target as string | null, r.filter as string | null,
    r.file_count as number, r.total_exposure as number | null,
    r.total_size as number, r.first_obs as string | null, r.last_obs as string | null
  ]))
  return [header, ...lines].join('\n')
}
