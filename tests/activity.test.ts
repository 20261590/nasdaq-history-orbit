import { describe, expect, it } from 'vitest'
import { ActivityConfigurationError, computeActivity } from '../src/features/analytics'
import type { ActivityVisit } from '../src/features/analytics'
import { parseHistory, sampleTimeline } from '../src/features/history'

const BASE = Date.UTC(2025, 0, 6)
const visit = (order: number, offsetMs: number, domain = 'a.com'): ActivityVisit =>
  Object.freeze({ order, timestamp: BASE + offsetMs, domain, hostname: domain })
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

describe('observed activity', () => {
  it('counts repeated pages and subdomains as navigation and other domains as switches', () => {
    const parsed = parseHistory([
      { url: 'https://news.example.com/a', timestamp: BASE },
      { url: 'https://mail.example.com/a', timestamp: BASE + 1000 },
      { url: 'https://mail.example.com/a', timestamp: BASE + 2000 },
      { url: 'https://other.com/a', timestamp: BASE + 2000 },
      { url: 'https://other.com/b', timestamp: BASE + 2000 },
    ])
    const report = computeActivity(Object.freeze(parsed.visits.map(row => Object.freeze(row))))
    expect(report).toMatchObject({
      total: 5, knownPairs: 4, unknownGaps: 0, domainSwitches: 1,
      sameDomainNavigation: 3, gapBuckets: [4, 0, 0, 0, 0], gapMedianMs: 0, gapP90Ms: 1000,
      sessions: [{ startOrder: 0, endOrder: 4, startMs: BASE, endMs: BASE + 2000,
        eventCount: 5, observedSpanMs: 2000, domainSwitches: 1, sameDomainNavigation: 3 }],
    })
  })

  it.each([
    [0, 0], [59_999, 0], [60_000, 1], [299_999, 1], [300_000, 2],
    [1_799_000, 2], [1_799_999, 2], [1_800_000, 3], [3_599_999, 3], [3_600_000, 4],
  ])('places known gap %i in bucket %i and splits at the default 30 minutes', (gap, bucket) => {
    const report = computeActivity([visit(0, 0), visit(1, gap, 'b.com')])
    expect(report.gapBuckets).toEqual(Array.from({ length: 5 }, (_, i) => Number(i === bucket)))
    expect(report).toMatchObject({
      sessionGapMinutes: 30, knownPairs: 1, unknownGaps: 0, domainSwitches: 1,
      gapMedianMs: gap, gapP90Ms: gap,
    })
    expect(report.sessions.map(row => [row.eventCount, row.observedSpanMs, row.domainSwitches]))
      .toEqual(gap < 1_800_000 ? [[2, gap, 1]] : [[1, 0, 0], [1, 0, 0]])
  })

  it.each([1, 15, 1440])('uses the configured %i minute threshold inclusively', minutes => {
    const threshold = minutes * 60_000
    const report = computeActivity([
      visit(0, 0), visit(1, threshold - 1), visit(2, threshold * 2 - 1),
    ], { sessionGapMinutes: minutes })
    expect(report.sessionGapMinutes).toBe(minutes)
    expect(report.sessions.map(row => [row.eventCount, row.observedSpanMs, row.sameDomainNavigation]))
      .toEqual([[2, threshold - 1, 1], [1, 0, 0]])
    expect(report.sameDomainNavigation).toBe(2)
  })

  it.each([0, -1, 1.5, 1441, NaN, Infinity, -Infinity])(
    'rejects invalid API threshold %s even for empty input', sessionGapMinutes => {
      expect(() => computeActivity([], { sessionGapMinutes })).toThrow(ActivityConfigurationError)
    },
  )

  it('computes nearest-rank quantiles from known gaps only', () => {
    const gaps = [60_000, 0, 600_000, 1_800_000, 300_000, 3_600_000, 120_000, 240_000, 480_000, 960_000]
    let offset = 0
    const visits = [visit(0, offset), ...gaps.map((gap, i) => visit(i + 1, offset += gap))]
    const report = computeActivity([...visits, visit(12, offset + 100_000_000)])
    expect(report).toMatchObject({
      knownPairs: 10, unknownGaps: 1, gapBuckets: [1, 3, 4, 1, 1],
      gapMedianMs: 300_000, gapP90Ms: 1_800_000,
    })
  })

  it.each([
    { order: 2, offset: 1 }, { order: 0, offset: 1 },
    { order: -1, offset: 1 }, { order: 1, offset: -1 },
  ])('treats unproven pair order=$order offset=$offset as an unknown gap', ({ order, offset }) => {
    const report = computeActivity([visit(0, 0), visit(order, offset, 'b.com')])
    expect(report).toMatchObject({
      knownPairs: 0, unknownGaps: 1, domainSwitches: 0, sameDomainNavigation: 0,
      gapBuckets: [0, 0, 0, 0, 0], gapMedianMs: null, gapP90Ms: null, domainTransitions: [],
    })
    expect(report.sessions.map(row => [row.eventCount, row.observedSpanMs])).toEqual([[1, 0], [1, 0]])
    expect(sum(report.hourBuckets.map(row => row.domainSwitches))).toBe(0)
  })

  it.each(['known rejected slot', 'unplaceable rejected timestamp'])(
    'preserves parser uncertainty for %s while removing duplicates', kind => {
      const parsed = parseHistory([
        { url: 'https://a.com/a', timestamp: BASE },
        { url: 'https://a.com/a', timestamp: BASE },
        { url: 'file:///local', timestamp: kind === 'known rejected slot' ? BASE + 1000 : 'invalid' },
        { url: 'https://b.com/a', timestamp: BASE + 2000 },
        { url: 'https://c.com/a', timestamp: BASE + 3000 },
      ])
      const report = computeActivity(parsed.visits)
      expect(parsed).toMatchObject({ rejected: 1, duplicates: 1 })
      expect(report).toMatchObject({
        total: 3, knownPairs: kind === 'known rejected slot' ? 1 : 0,
        unknownGaps: kind === 'known rejected slot' ? 1 : 2,
        domainSwitches: kind === 'known rejected slot' ? 1 : 0,
      })
      expect(report.sessions.map(row => row.eventCount))
        .toEqual(kind === 'known rejected slot' ? [1, 2] : [1, 1, 1])
    },
  )

  it.each(['excluded', 'sampled'])('never bridges %s records', mode => {
    const { visits } = parseHistory(Array.from({ length: 6 }, (_, i) => ({
      url: `https://${i % 2 ? 'b' : 'a'}.com/${i}`, timestamp: BASE + i * 1000,
    })))
    const retained = mode === 'excluded' ? visits.filter(row => row.order !== 1) : sampleTimeline(visits, 4)
    const report = computeActivity(retained)
    expect(report).toMatchObject({
      total: mode === 'excluded' ? 5 : 4, knownPairs: mode === 'excluded' ? 3 : 2,
      unknownGaps: 1, domainSwitches: mode === 'excluded' ? 3 : 2,
    })
    expect(report.sessions.map(row => row.eventCount)).toEqual(mode === 'excluded' ? [1, 4] : [2, 2])
  })

  it('attributes cross-hour switches to arrivals and counts UTC weekday and late-night boundaries', () => {
    const times = [Date.UTC(2025, 0, 4, 23, 59), Date.UTC(2025, 0, 5),
      Date.UTC(2025, 0, 5, 0, 30), Date.UTC(2025, 0, 5, 5, 59, 59), Date.UTC(2025, 0, 5, 6)]
    const report = computeActivity(times.map((timestamp, i) =>
      ({ ...visit(i, 0, i < 3 ? `${i}.com` : '2.com'), timestamp })))
    expect(report.hours).toEqual(Array.from({ length: 24 }, (_, h) =>
      h === 0 ? 2 : h === 5 || h === 6 || h === 23 ? 1 : 0))
    expect(report.weekdayHours).toEqual(Array.from({ length: 7 }, (_, day) =>
      Array.from({ length: 24 }, (_, h) => day === 0 ? (h === 0 ? 2 : h === 5 || h === 6 ? 1 : 0)
        : Number(day === 6 && h === 23))))
    expect(report.hourBuckets).toEqual([
      { startMs: Date.UTC(2025, 0, 4, 23), eventCount: 1, uniqueDomains: 1, domainSwitches: 0 },
      { startMs: Date.UTC(2025, 0, 5), eventCount: 2, uniqueDomains: 2, domainSwitches: 2 },
      { startMs: Date.UTC(2025, 0, 5, 5), eventCount: 1, uniqueDomains: 1, domainSwitches: 0 },
      { startMs: Date.UTC(2025, 0, 5, 6), eventCount: 1, uniqueDomains: 1, domainSwitches: 0 },
    ])
    expect(report).toMatchObject({ lateNightEvents: 3, lateNightShare: 3 / 5 })
  })

  it('returns sparse multi-year buckets and the top five with earliest-hour ties', () => {
    const counts = [2, 3, 2, 1, 2, 1, 2]
    const starts = counts.map((_, i) => Date.UTC(2000 + i * 3, 0, 1, 12))
    const visits = counts.flatMap((count, i) => Array.from({ length: count }, (_, j) =>
      ({ ...visit(i * 10 + j, 0), timestamp: (starts[i] ?? 0) + j * 1000 })))
    const report = computeActivity(visits)
    expect(report.hourBuckets.map(row => row.eventCount)).toEqual(counts)
    expect(report.denseHours).toEqual([1, 0, 2, 4, 6].map(i => ({ startMs: starts[i], count: counts[i] })))
    expect(report.total).toBe(13)
  })

  it('counts recurring directed edges across sessions and preserves count identities', () => {
    const domains = ['b.com', 'a.com', 'b.com', 'a.com', 'a.com', 'c.com', 'a.com', 'b.com', 'c.com']
    const minutes = [0, 1, 2, 3, 4, 34, 35, 36, 37]
    const report = computeActivity(domains.map((domain, i) =>
      visit(i === 8 ? 9 : i, (minutes[i] ?? 0) * 60_000, domain)))
    expect(report.domainTransitions).toEqual([
      { from: 'a.com', to: 'b.com', count: 2 }, { from: 'b.com', to: 'a.com', count: 2 },
      { from: 'a.com', to: 'c.com', count: 1 }, { from: 'c.com', to: 'a.com', count: 1 },
    ])
    expect(report).toMatchObject({ total: 9, knownPairs: 7, unknownGaps: 1, domainSwitches: 6, sameDomainNavigation: 1 })
    expect(report.sessions.map(row => [row.startOrder, row.endOrder, row.eventCount, row.domainSwitches]))
      .toEqual([[0, 4, 5, 3], [5, 7, 3, 2], [9, 9, 1, 0]])
    expect(report.knownPairs + report.unknownGaps).toBe(report.total - 1)
    expect(report.domainSwitches + report.sameDomainNavigation).toBe(report.knownPairs)
    expect(sum(report.gapBuckets)).toBe(report.knownPairs)
    expect(sum(report.hours)).toBe(9)
    expect(sum(report.weekdayHours.flat())).toBe(9)
    expect(sum(report.hourBuckets.map(row => row.eventCount))).toBe(9)
    expect(sum(report.hourBuckets.map(row => row.domainSwitches))).toBe(6)
    expect(sum(report.domainTransitions.map(row => row.count))).toBe(6)
    expect(sum(report.sessions.map(row => row.eventCount))).toBe(9)
    expect(sum(report.sessions.map(row => row.domainSwitches + row.sameDomainNavigation))).toBe(6)
  })

  it.each([0, 1])('returns finite frequencies and null pair statistics for %i events', count => {
    const report = computeActivity(count ? [visit(0, 0)] : [])
    expect(report).toMatchObject({
      total: count, knownPairs: 0, unknownGaps: 0, domainSwitches: 0, sameDomainNavigation: 0,
      gapBuckets: [0, 0, 0, 0, 0], gapMedianMs: null, gapP90Ms: null,
      domainTransitions: [], lateNightEvents: count, lateNightShare: count,
    })
    expect(report.sessions).toEqual(count ? [{
      startOrder: 0, endOrder: 0, startMs: BASE, endMs: BASE, eventCount: 1,
      observedSpanMs: 0, domainSwitches: 0, sameDomainNavigation: 0,
    }] : [])
    expect(report.hourBuckets).toEqual(count ? [{ startMs: BASE, eventCount: 1, uniqueDomains: 1, domainSwitches: 0 }] : [])
    expect(report.hours).toEqual(Array.from({ length: 24 }, (_, h) => h === 0 ? count : 0))
    expect(report.weekdayHours).toEqual(Array.from({ length: 7 }, (_, day) =>
      Array.from({ length: 24 }, (_, h) => day === 1 && h === 0 ? count : 0)))
  })

  it('analyzes every one of 100000 events without capping aggregate or session detail', () => {
    const visits = Array.from({ length: 100_000 }, (_, i) => visit(i, i * 1000, `site${i % 10}.com`))
    const start = performance.now()
    const report = computeActivity(visits)
    console.info(JSON.stringify({ activityEvents: visits.length, elapsedMs: performance.now() - start }))
    expect(report).toMatchObject({
      total: 100_000, knownPairs: 99_999, unknownGaps: 0, domainSwitches: 99_999,
      sameDomainNavigation: 0, gapBuckets: [99_999, 0, 0, 0, 0], gapMedianMs: 1000, gapP90Ms: 1000,
      sessions: [{ startOrder: 0, endOrder: 99_999, eventCount: 100_000, observedSpanMs: 99_999_000 }],
    })
    expect(report.hourBuckets).toHaveLength(28)
    expect(report.hourBuckets.at(-1)).toMatchObject({ eventCount: 2800, uniqueDomains: 10, domainSwitches: 2800 })
    expect(report.domainTransitions.map(row => row.count)).toEqual([...Array<number>(9).fill(10_000), 9999])
    expect(sum(report.hours)).toBe(100_000)
    expect(sum(report.weekdayHours.flat())).toBe(100_000)
    expect(sum(report.hourBuckets.map(row => row.domainSwitches))).toBe(99_999)
  })
})
