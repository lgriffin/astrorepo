import { getSqlite } from '../db/connection'
import type { Recommendation } from '@shared/types'

export function getRecommendations(): Recommendation[] {
  const recommendations: Recommendation[] = []
  const sqlite = getSqlite()
  let idCounter = 0
  const nextId = () => `rec-${++idCounter}`

  const lightConfigs = sqlite.prepare(`
    SELECT DISTINCT gain, ccd_temp, xbinning, filter,
           COUNT(*) as lightCount
    FROM fits_files
    WHERE (image_type LIKE '%light%' OR image_type IS NULL)
      AND exposure_sec IS NOT NULL
    GROUP BY gain, ccd_temp, xbinning, filter
    HAVING lightCount >= 5
  `).all() as Array<{ gain: number | null; ccd_temp: number | null; xbinning: number | null; filter: string | null; lightCount: number }>

  for (const config of lightConfigs) {
    if (config.gain !== null && config.ccd_temp !== null) {
      const darkCount = (sqlite.prepare(`
        SELECT COUNT(*) as cnt FROM fits_files
        WHERE image_type LIKE '%dark%' AND gain = ? AND ccd_temp BETWEEN ? - 2 AND ? + 2
      `).get(config.gain, config.ccd_temp, config.ccd_temp) as { cnt: number }).cnt

      if (darkCount === 0) {
        recommendations.push({
          id: nextId(),
          category: 'calibration',
          priority: 'high',
          title: 'Missing dark frames',
          description: `You have ${config.lightCount} lights at gain ${config.gain}, ${config.ccd_temp?.toFixed(0)}°C but no matching darks. Capture dark frames at the same settings for proper calibration.`,
          targetId: null,
          targetName: null,
          actionLabel: null
        })
      }
    }

    if (config.filter) {
      const flatCount = (sqlite.prepare(`
        SELECT COUNT(*) as cnt FROM fits_files
        WHERE image_type LIKE '%flat%' AND filter = ?
      `).get(config.filter) as { cnt: number }).cnt

      if (flatCount === 0) {
        recommendations.push({
          id: nextId(),
          category: 'calibration',
          priority: 'high',
          title: `Missing flat frames for ${config.filter}`,
          description: `No flat frames found for the ${config.filter} filter. Flat frames correct vignetting and dust artifacts.`,
          targetId: null,
          targetName: null,
          actionLabel: null
        })
      }
    }
  }

  const goalTargets = sqlite.prepare(`
    SELECT ig.target_id, t.canonical_name, ig.filter, ig.goal_seconds,
           COALESCE(SUM(f.exposure_sec), 0) as achieved
    FROM integration_goals ig
    JOIN targets t ON t.id = ig.target_id
    LEFT JOIN fits_files f ON f.target_id = ig.target_id AND f.filter = ig.filter
      AND (f.image_type LIKE '%light%' OR f.image_type IS NULL)
    GROUP BY ig.id
  `).all() as Array<{ target_id: string; canonical_name: string; filter: string; goal_seconds: number; achieved: number }>

  for (const g of goalTargets) {
    const pct = (g.achieved / g.goal_seconds) * 100
    const remaining = Math.max(0, g.goal_seconds - g.achieved)
    if (pct >= 70 && pct < 100) {
      const hrs = (remaining / 3600).toFixed(1)
      recommendations.push({
        id: nextId(),
        category: 'integration',
        priority: 'medium',
        title: `${g.canonical_name} is ${pct.toFixed(0)}% complete in ${g.filter}`,
        description: `Only ${hrs} more hours of ${g.filter} needed to reach your integration goal. Consider prioritizing this target in your next session.`,
        targetId: g.target_id,
        targetName: g.canonical_name,
        actionLabel: 'View Target'
      })
    } else if (pct < 30 && g.achieved > 0) {
      const hrs = (remaining / 3600).toFixed(1)
      recommendations.push({
        id: nextId(),
        category: 'integration',
        priority: 'low',
        title: `${g.canonical_name} needs ${hrs}h more ${g.filter}`,
        description: `Integration goal for ${g.filter} is only ${pct.toFixed(0)}% complete. ${hrs} hours remaining.`,
        targetId: g.target_id,
        targetName: g.canonical_name,
        actionLabel: 'View Target'
      })
    }
  }

  const qualityTrend = sqlite.prepare(`
    SELECT substr(date_obs, 1, 7) as month, AVG(fwhm_estimate) as avgFwhm
    FROM fits_files
    WHERE fwhm_estimate IS NOT NULL AND date_obs IS NOT NULL
    GROUP BY substr(date_obs, 1, 7)
    ORDER BY month DESC
    LIMIT 3
  `).all() as Array<{ month: string; avgFwhm: number }>

  if (qualityTrend.length >= 2) {
    const recent = qualityTrend[0].avgFwhm
    const previous = qualityTrend[1].avgFwhm
    if (recent > previous * 1.3) {
      recommendations.push({
        id: nextId(),
        category: 'quality',
        priority: 'medium',
        title: 'FWHM has increased recently',
        description: `Average FWHM went from ${previous.toFixed(1)} to ${recent.toFixed(1)} pixels. Check focus, collimation, or seeing conditions.`,
        targetId: null,
        targetName: null,
        actionLabel: null
      })
    } else if (recent < previous * 0.8) {
      recommendations.push({
        id: nextId(),
        category: 'quality',
        priority: 'low',
        title: 'Image quality is improving',
        description: `Average FWHM improved from ${previous.toFixed(1)} to ${recent.toFixed(1)} pixels. Your recent adjustments are working well.`,
        targetId: null,
        targetName: null,
        actionLabel: null
      })
    }
  }

  const staleTargets = sqlite.prepare(`
    SELECT t.id, t.canonical_name, t.workflow_stage,
           COUNT(f.id) as fileCount,
           MAX(f.date_obs) as lastImaged
    FROM targets t
    JOIN fits_files f ON f.target_id = t.id
    WHERE t.workflow_stage IN ('raw_captured', 'calibrated')
    GROUP BY t.id
    HAVING fileCount >= 20
    ORDER BY lastImaged ASC
    LIMIT 5
  `).all() as Array<{ id: string; canonical_name: string; workflow_stage: string; fileCount: number; lastImaged: string }>

  for (const st of staleTargets) {
    recommendations.push({
      id: nextId(),
      category: 'workflow',
      priority: 'low',
      title: `${st.canonical_name} has ${st.fileCount} frames but is still "${st.workflow_stage.replace(/_/g, ' ')}"`,
      description: `Consider advancing this target to the next workflow stage. Last imaged: ${st.lastImaged?.substring(0, 10) ?? 'unknown'}.`,
      targetId: st.id,
      targetName: st.canonical_name,
      actionLabel: 'Advance Stage'
    })
  }

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return recommendations
}
