import { describe, expect, it } from 'vitest'
import { parseHistory } from '../src/features/history'
import { buildShareInput } from '../src/app/adapters/share-input'
import { integrationCanaries, integrationHistory, integrationHosts } from './fixtures/integration'

const anchor = Math.floor(Date.UTC(2026, 10, 11) / 86_400_000)
const periods = {
  a: { startDay: anchor - 6, endDayExclusive: anchor + 1 },
  b: { startDay: anchor - 13, endDayExclusive: anchor - 6 },
}

describe('anonymous Share input', () => {
  it('exports aggregate counts without records, site names, credentials, IPs or titles', () => {
    const visits = parseHistory(integrationHistory()).visits
    const input = buildShareInput(visits, integrationHosts, {
      source: 'mock', comparisonVisits: visits, periods, sessionGapMinutes: 30,
      analysisExcludedCount: 0, shareExcludedCount: 0,
    })

    expect(input.source).toBe('mock')
    expect(input.period).toEqual({ startDay: anchor - 13, endDayExclusive: anchor + 1 })
    expect(input).toMatchObject({ total: 28, uniqueSites: 3, locatedSites: 2, locationRate: 2 / 3 })
    expect(input.topSites).toEqual([
      { rank: 1, count: 18, share: 18 / 28 },
      { rank: 2, count: 9, share: 9 / 28 },
      { rank: 3, count: 1, share: 1 / 28 },
    ])
    expect(input.countries).toEqual([{ label: 'South Korea', count: 1 }, { label: 'United States', count: 1 }])
    expect(input.comparison?.a).toMatchObject({
      period: periods.a, total: 21, uniqueSites: 3, locatedEvents: 20, unlocatedEvents: 1,
      countries: [{ code: 'KR', count: 13 }, { code: 'US', count: 7 }],
    })
    expect(input.comparison?.b).toMatchObject({ period: periods.b, total: 7, locatedEvents: 7, unlocatedEvents: 0 })
    expect(input.activity).toMatchObject({ total: 28, sessions: 14, domainSwitches: 18 })
    expect(input.privacy).toEqual({
      analysisExcludedCount: 0, shareExcludedCount: 0, rawRecordsIncluded: false, siteNamesIncluded: false,
    })
    const publicText = JSON.stringify(input)
    for (const secret of [...integrationCanaries, '223.130.200.104', '185.199.108.153',
      'naver.com', 'github.com', 'example.com', '/synthetic/', '합성 방문']) {
      expect(publicText).not.toContain(secret)
    }
    expect(input).not.toHaveProperty('visits')
    expect(input).not.toHaveProperty('hosts')
  })

  it('keeps empty input empty without inventing a period or comparison', () => {
    const input = buildShareInput([], integrationHosts, {
      source: 'live', comparisonVisits: [], periods: null, sessionGapMinutes: 5,
      analysisExcludedCount: 3, shareExcludedCount: 2,
    })

    expect(input).toMatchObject({
      source: 'live', period: null, total: 0, uniqueSites: 0, locatedSites: 0, locationRate: 0,
      topSites: [], countries: [], comparison: null,
      activity: {
        total: 0, sessionGapMinutes: 5, knownPairs: 0, unknownGaps: 0, domainSwitches: 0,
        sameDomainNavigation: 0, sessions: 0, lateNightEvents: 0, gapBuckets: [0, 0, 0, 0, 0],
      },
      privacy: { analysisExcludedCount: 3, shareExcludedCount: 2, rawRecordsIncluded: false, siteNamesIncluded: false },
    })
    expect(input.hours).toEqual(Array(24).fill(0))
    expect(input.weekdays).toEqual(Array(7).fill(0))
    expect(input.activity.hours).toEqual(Array(24).fill(0))
  })
})
