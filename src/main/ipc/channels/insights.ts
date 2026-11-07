import { getDashboardStats, getCatalogueProgressStats } from '../../services/dashboard'
import { getSqlite } from '../../db/connection'
import { composeCore } from '../../composition'
import { toCockpitOverview } from '../../adapters/discovery-presenter'
import { getInsightsSummary, getMonthlyActivity, getBestNights, getEquipmentEffectiveness, getQualityTrends, getFilterUsageBreakdown, getTargetProgress } from '../../services/insights'
import { validated, type Handle } from './validated'

/** Home and Insights. */
export function registerInsightsChannels(handle: Handle): void {
  handle('dashboard:stats', async () => {
    return getDashboardStats()
  })

  handle('dashboard:catalogue-progress', async () => {
    return { catalogues: getCatalogueProgressStats() }
  })

  handle('insights:summary', async () => {
    return getInsightsSummary()
  })

  handle('insights:monthly-activity', validated('insights:monthly-activity', (args) => {
    return getMonthlyActivity(args.months)
  }))

  handle('insights:best-nights', validated('insights:best-nights', (args) => {
    return getBestNights(args.limit)
  }))

  handle('insights:equipment-effectiveness', async () => {
    return getEquipmentEffectiveness()
  })

  handle('insights:quality-trends', validated('insights:quality-trends', (args) => {
    return getQualityTrends(args.months)
  }))

  handle('insights:filter-usage', async () => {
    return getFilterUsageBreakdown()
  })

  handle('insights:target-progress', validated('insights:target-progress', (args) => {
    return getTargetProgress(args.limit)
  }))

  handle('cockpit:overview', async () => {
    const core = composeCore(getSqlite())
    const [discovery, hidden] = await Promise.all([core.discoverTargets(), core.reportHiddenData()])
    return toCockpitOverview(discovery, hidden)
  })

  handle('cockpit:dismiss', validated('cockpit:dismiss', (args) => {
    return composeCore(getSqlite()).dismissSuggestion(args.suggestion_id)
  }))
}
