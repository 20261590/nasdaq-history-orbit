import { describe, expect, it } from 'vitest'
import { computeComparison, resolveComparisonPeriods } from '../src/features/analytics'
import type { AnalyticsVisit, ComparisonPeriods } from '../src/features/analytics'
import { parseHistory } from '../src/features/history'
import type { GeoLocation, HostLocation } from '../src/shared/types'

const DAY = 86_400_000
const day = (year: number, month: number, date: number): number => Date.UTC(year, month - 1, date) / DAY
const visit = (date: number, hour: number, domain: string, hostname = domain): AnalyticsVisit => ({
  timestamp: date * DAY + hour * 3_600_000, domain, hostname, order: 0,
})
const geo = (code: string, country: string): GeoLocation => ({
  latitude: 0, longitude: 0, countryCode: code, country, accuracyRadiusKm: null,
})
const host = (hostname: string, ...locations: GeoLocation[]): HostLocation => ({
  hostname, locations, status: 'resolved', source: 'mock',
})

describe('comparison period resolution', () => {
  it.each([7, 30] as const)('anchors %i days to the maximum UTC input day and leaves adjacent half-open windows', days => {
    const anchor = day(2024, 3, 1)
    const visits = [visit(anchor, 0, 'late.dev'), visit(day(2023, 9, 2), 23, 'early.dev')]
    expect(resolveComparisonPeriods(visits, { kind: 'days', days })).toEqual({
      ok: true, periods: {
        a: { startDay: anchor - days + 1, endDayExclusive: anchor + 1 },
        b: { startDay: anchor - days * 2 + 1, endDayExclusive: anchor - days + 1 },
      },
    })
  })

  it.each([
    { anchor: day(2024, 3, 1), a: [day(2024, 3, 1), day(2024, 4, 1)], b: [day(2024, 2, 1), day(2024, 3, 1)] },
    { anchor: day(2025, 1, 3), a: [day(2025, 1, 1), day(2025, 2, 1)], b: [day(2024, 12, 1), day(2025, 1, 1)] },
    { anchor: day(2024, 2, 29), a: [day(2024, 2, 1), day(2024, 3, 1)], b: [day(2024, 1, 1), day(2024, 2, 1)] },
  ])('uses full actual UTC calendar months across leap and year boundaries: %#', ({ anchor, a, b }) => {
    expect(resolveComparisonPeriods([visit(anchor, 23, 'a.dev')], { kind: 'month' })).toEqual({
      ok: true, periods: {
        a: { startDay: a[0], endDayExclusive: a[1] },
        b: { startDay: b[0], endDayExclusive: b[1] },
      },
    })
  })

  it('accepts independent overlapping and multi-year custom ranges even with no input', () => {
    const periods = {
      a: { startDay: day(2000, 1, 1), endDayExclusive: day(2024, 1, 1) },
      b: { startDay: day(2023, 1, 1), endDayExclusive: day(2025, 1, 1) },
    }
    expect(resolveComparisonPeriods([], { kind: 'custom', ...periods })).toEqual({ ok: true, periods })
    expect(resolveComparisonPeriods([], { kind: 'month' })).toEqual({ ok: false, reason: 'empty' })
  })

  it('keeps the final representable calendar month within renderable UTC dates', () => {
    const visits = parseHistory([{ url: 'https://example.com', timestamp: 8.64e15 }]).visits
    expect(visits.length).toBe(1)
    const resolved = resolveComparisonPeriods(visits, { kind: 'month' })
    if (!resolved.ok) throw new Error('Expected the final valid input month')
    expect(resolved.periods.a.endDayExclusive).toBe(100_000_001)
    expect(new Date((resolved.periods.a.endDayExclusive - 1) * DAY).toISOString())
      .toBe('+275760-09-13T00:00:00.000Z')
    expect(computeComparison(visits, [], resolved.periods).a.dailyAverage).toBe(1 / 13)
  })

  it('computes a very long custom period from events without allocating a row per day', () => {
    const periods = { a: { startDay: 0, endDayExclusive: 100_000_001 }, b: { startDay: 0, endDayExclusive: 1 } }
    expect(resolveComparisonPeriods([], { kind: 'custom', ...periods })).toEqual({ ok: true, periods })
    const report = computeComparison([visit(0, 0, 'a.dev')], [], periods)
    expect(report.a).toMatchObject({ total: 1, dailyAverage: 1 / 100_000_001, uniqueSites: 1 })
    expect(report.b).toMatchObject({ total: 1, dailyAverage: 1, uniqueSites: 1 })
    expect(report.changes.total).toEqual({ absolute: 0, relative: 0 })
  })

  it.each([
    { startDay: 1, endDayExclusive: 1 }, { startDay: 2, endDayExclusive: 1 },
    { startDay: -1, endDayExclusive: 1 }, { startDay: 0.5, endDayExclusive: 2 },
    { startDay: 0, endDayExclusive: Infinity }, { startDay: 0, endDayExclusive: 100_000_002 },
  ])('rejects only invalid custom date/integer/order bounds: %#', bad => {
    expect(resolveComparisonPeriods([], { kind: 'custom', a: bad, b: { startDay: 0, endDayExclusive: 1 } }))
      .toEqual({ ok: false, reason: 'invalid-range' })
  })
})

describe('complete comparison reports', () => {
  it('counts unequal calendar-day averages and null relative values with a zero baseline', () => {
    const march = day(2024, 3, 1)
    const february = day(2024, 2, 1)
    const periods: ComparisonPeriods = {
      a: { startDay: march, endDayExclusive: day(2024, 4, 1) },
      b: { startDay: february, endDayExclusive: march },
    }
    const report = computeComparison([
      visit(march, 0, 'a.dev'), visit(march + 30, 23, 'a.dev'),
      visit(march - 1, 23, 'excluded.dev'), visit(day(2024, 4, 1), 0, 'excluded.dev'),
    ], [], periods)
    expect(report.a).toMatchObject({ total: 2, dailyAverage: 2 / 31, uniqueSites: 1, unlocatedEvents: 2 })
    expect(report.b).toMatchObject({ total: 1, dailyAverage: 1 / 29, uniqueSites: 1 })
    expect(report.changes).toMatchObject({
      total: { absolute: 1, relative: 1 },
      dailyAverage: { absolute: 2 / 31 - 1 / 29, relative: (2 / 31 - 1 / 29) / (1 / 29) },
      uniqueSites: { absolute: 0, relative: 0 },
    })
    const empty = computeComparison([], [], periods)
    expect(empty.a).toMatchObject({
      total: 0, dailyAverage: 0, uniqueSites: 0, locatedEvents: 0, unlocatedEvents: 0,
      coverage: { inputMinDay: null, inputMaxDay: null, observedDays: 0 },
    })
    expect(empty.changes).toMatchObject({
      total: { absolute: 0, relative: null },
      dailyAverage: { absolute: 0, relative: null },
      uniqueSites: { absolute: 0, relative: null },
    })
    expect(empty.a.hours24).toEqual(Array(24).fill(0))
    expect(empty.a.weekdays7).toEqual(Array(7).fill(0))
    expect(empty.a.countries).toEqual([])
  })

  it('keeps days empty beyond observed dates and discloses partial coverage without claiming completeness', () => {
    const start = day(2024, 2, 1)
    const periods = {
      a: { startDay: start, endDayExclusive: start + 4 },
      b: { startDay: start - 4, endDayExclusive: start },
    }
    const report = computeComparison([visit(start + 1, 10, 'a.dev'), visit(start + 1, 11, 'a.dev')], [], periods)
    expect(report.a.coverage).toEqual({
      inputMinDay: start + 1, inputMaxDay: start + 1, observedDays: 1,
      warnings: ['history-completeness-unknown', 'before-input', 'after-input', 'unobserved-days'],
    })
    expect(report.b.coverage.warnings).toEqual([
      'history-completeness-unknown', 'no-observed-events', 'before-input', 'unobserved-days',
    ])
    expect(report.a.dailyAverage).toBe(0.5)
    expect(report.changes.dailyAverage).toEqual({ absolute: 0.5, relative: null })
  })

  it('groups subdomains, ranks tied domains by code unit, and keeps new and lost rank deltas null', () => {
    const start = day(2025, 5, 1)
    const periods = { a: { startDay: start + 1, endDayExclusive: start + 2 }, b: { startDay: start, endDayExclusive: start + 1 } }
    const report = computeComparison([
      visit(start + 1, 0, 'z.dev'), visit(start + 1, 1, 'a.dev', 'news.a.dev'),
      visit(start + 1, 2, 'a.dev', 'mail.a.dev'), visit(start + 1, 3, 'new.dev'),
      visit(start, 0, 'z.dev'), visit(start, 1, 'z.dev'), visit(start, 2, 'lost.dev'),
      visit(start, 3, 'a.dev'),
    ], [], periods)
    expect(report.a.sites).toEqual([
      { domain: 'a.dev', rank: 1, count: 2, share: 0.5 },
      { domain: 'new.dev', rank: 2, count: 1, share: 0.25 },
      { domain: 'z.dev', rank: 3, count: 1, share: 0.25 },
    ])
    expect(report.siteChanges).toEqual([
      { domain: 'a.dev', rankA: 1, rankB: 2, rankDelta: 1, countA: 2, countB: 1,
        countDelta: 1, shareA: 0.5, shareB: 0.25, shareDelta: 0.25 },
      { domain: 'new.dev', rankA: 2, rankB: null, rankDelta: null, countA: 1, countB: 0,
        countDelta: 1, shareA: 0.25, shareB: 0, shareDelta: 0.25 },
      { domain: 'z.dev', rankA: 3, rankB: 1, rankDelta: -2, countA: 1, countB: 2,
        countDelta: -1, shareA: 0.25, shareB: 0.5, shareDelta: -0.25 },
      { domain: 'lost.dev', rankA: null, rankB: 3, rankDelta: null, countA: 0, countB: 1,
        countDelta: -1, shareA: 0, shareB: 0.25, shareDelta: -0.25 },
    ])
  })

  it('attributes one event to the first resolved country and keeps all-event and located denominators distinct', () => {
    const start = day(2025, 1, 5) // Sunday UTC
    const periods = { a: { startDay: start, endDayExclusive: start + 1 }, b: { startDay: start - 1, endDayExclusive: start } }
    const report = computeComparison([
      visit(start, 23, 'a.dev', 'news.a.dev'), visit(start, 23, 'a.dev', 'news.a.dev'),
      visit(start, 0, 'b.dev'), visit(start, 0, 'c.dev'), visit(start - 1, 23, 'a.dev', 'news.a.dev'),
    ], [
      host('news.a.dev', geo('KR', 'South Korea'), geo('US', 'United States')),
      host('b.dev', geo('US', 'United States')), host('c.dev', geo('XX', 'Unknown')),
    ], periods)
    expect(report.a).toMatchObject({ total: 4, locatedEvents: 3, unlocatedEvents: 1, uniqueSites: 3 })
    expect(report.a.countries).toEqual([
      { code: 'KR', label: 'South Korea', count: 2, shareAllEvents: 0.5, shareLocatedEvents: 2 / 3 },
      { code: 'US', label: 'United States', count: 1, shareAllEvents: 0.25, shareLocatedEvents: 1 / 3 },
    ])
    expect(report.changes.countries).toEqual([
      { code: 'KR', label: 'South Korea', countDelta: 1,
        shareAllEventsDelta: 0.5 - 1, shareLocatedEventsDelta: 2 / 3 - 1 },
      { code: 'US', label: 'United States', countDelta: 1,
        shareAllEventsDelta: 0.25, shareLocatedEventsDelta: 1 / 3 },
    ])
    expect(report.a.hours24[23]).toBe(2)
    expect(report.a.weekdays7[0]).toBe(4)
    expect(report.changes.hours24[23]).toEqual({ countDelta: 1, shareDelta: 0.5 - 1 })
    expect(report.changes.weekdays7[0]).toEqual({ countDelta: 4, shareDelta: 1 })
  })

  it('selects the smallest nonempty label per code and rejects unknown first locations or failed hosts', () => {
    const start = day(2025, 1, 1)
    const periods = { a: { startDay: start, endDayExclusive: start + 1 }, b: { startDay: start + 1, endDayExclusive: start + 2 } }
    const report = computeComparison([
      visit(start, 0, 'a.dev'), visit(start, 1, 'b.dev'), visit(start, 2, 'c.dev'),
      visit(start, 3, 'd.dev'), visit(start, 4, 'e.dev'),
      visit(start + 1, 0, 'later.dev'),
    ], [
      host('a.dev', geo('US', 'Zed')), host('b.dev', geo('US', 'Alpha')),
      host('c.dev', geo('??', 'Unknown')), host('d.dev', geo('XX', 'Unknown'), geo('KR', 'Korea')),
      { ...host('e.dev', geo('KR', 'Korea')), status: 'failed' },
      host('later.dev', geo('US', 'Aardvark')),
    ], periods)
    expect(report.a.countries).toEqual([
      { code: 'US', label: 'Alpha', count: 2, shareAllEvents: 2 / 5, shareLocatedEvents: 1 },
    ])
    expect(report.a.unlocatedEvents).toBe(3)
    expect(report.changes.countries).toEqual([{
      code: 'US', label: 'Aardvark', countDelta: 1,
      shareAllEventsDelta: 2 / 5 - 1, shareLocatedEventsDelta: 0,
    }])
  })

  it('counts UTC midnight inclusively at start and exclusively at end after the existing parser projects offsets', () => {
    const start = day(2025, 1, 1)
    const periods = { a: { startDay: start, endDayExclusive: start + 1 }, b: { startDay: start - 1, endDayExclusive: start } }
    const parsed = parseHistory([
      { url: 'https://a.dev/one', timestamp: '2025-01-01T09:00:00+09:00' },
      { url: 'https://a.dev/two', timestamp: '2025-01-02T00:00:00Z' },
      { url: 'https://b.dev/one', timestamp: '2025-01-01T00:30:00+01:00' },
      { url: 'https://bad.dev/one', timestamp: '2025-01-01T00:00:00' },
    ])
    const report = computeComparison(parsed.visits, [], periods)
    expect(parsed.rejected).toBe(1)
    expect(report.a.total).toBe(1)
    expect(report.b.total).toBe(1)
    expect(report.a.hours24[0]).toBe(1)
    expect(report.a.coverage).toMatchObject({ inputMinDay: start - 1, inputMaxDay: start + 1, observedDays: 1 })
  })
})
