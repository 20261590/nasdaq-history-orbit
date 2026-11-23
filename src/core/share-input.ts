import type { HostLocation, Visit } from '../model'
import type { ShareInput, SharePeriodSummary } from '../features/share/types'
import { computeStatistics } from './stats'
import { computeComparison } from './comparison'
import type { ComparisonPeriods, PeriodReport } from './comparison'
import { computeActivity } from './activity'

export interface ShareInputOptions {
  readonly source: 'live' | 'mock'
  readonly comparisonVisits: readonly Visit[]
  readonly periods: ComparisonPeriods | null
  readonly sessionGapMinutes: number
  readonly analysisExcludedCount: number
  readonly shareExcludedCount: number
}

function periodSummary(report: PeriodReport): SharePeriodSummary {
  return {
    period: { startDay: report.range.startDay, endDayExclusive: report.range.endDayExclusive },
    total: report.total,
    uniqueSites: report.uniqueSites,
    locatedEvents: report.locatedEvents,
    unlocatedEvents: report.unlocatedEvents,
    hours: [...report.hours24],
    weekdays: [...report.weekdays7],
    countries: report.countries.map(country => ({ code: country.code, count: country.count })),
  }
}

/**
 * The caller applies Security's analysis and share exclusions to BOTH corpora.
 * Copy aggregate fields explicitly: Visit, HostLocation and their private fields
 * must never cross into the Share feature. No codec, renderer or wire schema here.
 */
export function buildShareInput(
  visits: readonly Visit[],
  hosts: readonly HostLocation[],
  options: ShareInputOptions,
): ShareInput {
  const statistics = computeStatistics(visits, hosts)
  const activity = computeActivity(visits, { sessionGapMinutes: options.sessionGapMinutes })
  const comparison = options.periods
    ? computeComparison(options.comparisonVisits, hosts, options.periods) : null
  return {
    source: options.source,
    period: visits.length ? {
      startDay: Math.floor(statistics.start / 86_400_000),
      endDayExclusive: Math.floor(statistics.end / 86_400_000) + 1,
    } : null,
    total: statistics.total,
    uniqueSites: statistics.uniqueSites,
    locatedSites: statistics.locatedSites,
    locationRate: statistics.locationRate,
    topSites: statistics.sites.slice(0, 10).map((site, index) => ({
      rank: index + 1, count: site.count, share: site.share,
    })),
    hours: [...statistics.hours],
    weekdays: [...statistics.weekdays],
    countries: statistics.countries.map(country => ({ label: country.label, count: country.count })),
    comparison: comparison ? {
      sourceTotal: options.comparisonVisits.length,
      a: periodSummary(comparison.a),
      b: periodSummary(comparison.b),
    } : null,
    activity: {
      total: activity.total,
      sessionGapMinutes: activity.sessionGapMinutes,
      knownPairs: activity.knownPairs,
      unknownGaps: activity.unknownGaps,
      domainSwitches: activity.domainSwitches,
      sameDomainNavigation: activity.sameDomainNavigation,
      gapBuckets: [...activity.gapBuckets],
      hours: [...activity.hours],
      sessions: activity.sessions.length,
      lateNightEvents: activity.lateNightEvents,
    },
    privacy: {
      analysisExcludedCount: options.analysisExcludedCount,
      shareExcludedCount: options.shareExcludedCount,
      rawRecordsIncluded: false,
      siteNamesIncluded: false,
    },
  }
}
