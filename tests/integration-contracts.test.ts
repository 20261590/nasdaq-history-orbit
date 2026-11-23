import { describe, expect, it } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { parseHistory } from '../src/core/history'
import { buildShareInput } from '../src/core/share-input'
import { computeStatistics } from '../src/core/stats'
import { useExclusions } from '../src/useExclusions'
import { integrationHistory, integrationHosts } from './fixtures/integration'
import type { Visit } from '../src/model'

describe('local analysis and share policy', () => {
  it('keeps analysis and share-only exclusions independent and reversible', () => {
    const scope = effectScope()
    const source = shallowRef<readonly Visit[]>(parseHistory(integrationHistory()).visits)
    const state = scope.run(() => useExclusions(source))
    if (!state) throw new Error('Expected active composition scope')
    state.change({ order: 7, scope: 'analysis', excluded: true })
    state.change({ order: 27, scope: 'share', excluded: true })
    expect(state.analysisVisits.value.length).toBe(27)
    expect(state.shareAllowed(state.analysisVisits.value).length).toBe(26)
    state.change({ order: 27, scope: 'analysis', excluded: true })
    state.change({ order: 27, scope: 'analysis', excluded: false })
    expect(state.shareExcluded.value.has(27)).toBe(true)
    expect(state.report.value.totals.inspected).toBe(28)
    source.value = parseHistory(integrationHistory().slice(0, 2)).visits
    expect(state.analysisExcluded.value.size).toBe(0)
    expect(state.shareExcluded.value.size).toBe(0)
    scope.stop()
  })

  it('rebuilds local and export aggregates after exclusions without closing order gaps', () => {
    const raw = parseHistory(integrationHistory()).visits
    const permitted = raw.filter(visit => visit.order !== 7 && visit.order !== 27)
    const anchor = Math.floor(Date.UTC(2026, 10, 11) / 86400000)
    const eligibleHosts = integrationHosts.filter(host => permitted.some(visit => visit.hostname === host.hostname))
    const statistics = computeStatistics(permitted, eligibleHosts)
    const input = buildShareInput(permitted, eligibleHosts, {
      source: 'mock', comparisonVisits: permitted,
      periods: { a: { startDay: anchor - 6, endDayExclusive: anchor + 1 }, b: { startDay: anchor - 13, endDayExclusive: anchor - 6 } },
      sessionGapMinutes: 30, analysisExcludedCount: 1, shareExcludedCount: 1,
    })
    expect(statistics.sites.map(site => [site.domain, site.count])).toEqual([['naver.com', 17], ['github.com', 9]])
    expect(eligibleHosts.map(host => host.hostname)).toEqual(['naver.com', 'github.com'])
    expect(input.total).toBe(26)
    expect(input.topSites).toEqual([
      { rank: 1, count: 17, share: 17 / 26 }, { rank: 2, count: 9, share: 9 / 26 },
    ])
    expect(input.hours[9]).toBe(7)
    expect(input.hours[10]).toBe(19)
    expect(permitted.map(visit => visit.order)).not.toContain(7)
    expect(permitted[7]?.order).toBe(8)
    expect(input.comparison?.a.total).toBe(19)
    expect(input.comparison?.b.total).toBe(7)
    expect(input.comparison?.a.countries).toEqual([{ code: 'KR', count: 12 }, { code: 'US', count: 7 }])
    expect(input.activity).toMatchObject({
      total: 26, knownPairs: 24, unknownGaps: 1, domainSwitches: 16, sessions: 14,
    })
    expect(input.privacy).toEqual({
      analysisExcludedCount: 1, shareExcludedCount: 1, rawRecordsIncluded: false, siteNamesIncluded: false,
    })
  })

  it('keeps the exported view and independent comparison corpus distinct', () => {
    const raw = parseHistory(integrationHistory()).visits
    const anchor = Math.floor(Date.UTC(2026, 10, 11) / 86400000)
    const view = raw.filter(visit => visit.timestamp >= Date.UTC(2026, 10, 5))
    const input = buildShareInput(view, integrationHosts, {
      source: 'mock', comparisonVisits: raw, sessionGapMinutes: 30,
      periods: { a: { startDay: anchor - 6, endDayExclusive: anchor + 1 }, b: { startDay: anchor - 13, endDayExclusive: anchor - 6 } },
      analysisExcludedCount: 0, shareExcludedCount: 0,
    })
    expect(input.total).toBe(21)
    expect(input.activity.total).toBe(21)
    expect(input.comparison).toMatchObject({ sourceTotal: 28, a: { total: 21 }, b: { total: 7 } })
  })
})
