import type {
  ActivityDomainTransition, ActivityOptions, ActivityReport, ActivitySession, ActivityVisit,
} from '../types'

export type {
  ActivityDenseHour, ActivityDomainTransition, ActivityHourBucket, ActivityOptions,
  ActivityReport, ActivitySession, ActivityVisit,
} from '../types'

export class ActivityConfigurationError extends RangeError {
  readonly sessionGapMinutes: number

  constructor(sessionGapMinutes: number) {
    super('sessionGapMinutes must be an integer from 1 through 1440')
    this.name = 'ActivityConfigurationError'
    this.sessionGapMinutes = sessionGapMinutes
  }
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/**
 * Consume complete chronologically normalized filtered records, preserving parser order.
 * Never pass playback samples or renumber retained records. An unknown pair always splits
 * observed session fragments. Known edges across threshold splits count in the report,
 * arrival-hour buckets and transition table, but not within either session fragment.
 * Event frequencies and observed spans make no claim about attention or internet usage.
 */
export function computeActivity(
  visits: readonly ActivityVisit[],
  options: ActivityOptions = { sessionGapMinutes: 30 },
): ActivityReport {
  const { sessionGapMinutes } = options
  if (!Number.isInteger(sessionGapMinutes) || sessionGapMinutes < 1 || sessionGapMinutes > 1440) {
    throw new ActivityConfigurationError(sessionGapMinutes)
  }
  const thresholdMs = sessionGapMinutes * MINUTE_MS
  const hours = Array<number>(24).fill(0)
  const weekdayHours = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  const gapBuckets = Array<number>(5).fill(0)
  const gaps: number[] = []
  const sessions: ActivitySession[] = []
  // Private accumulators are mutable; only scalar projections leave the function.
  const occupied = new Map<number, {
    eventCount: number
    readonly domains: Set<string>
    domainSwitches: number
  }>()
  const transitions = new Map<string, Map<string, number>>()
  let previous: ActivityVisit | undefined
  let fragment: ActivitySession | undefined
  let unknownGaps = 0
  let domainSwitches = 0
  let sameDomainNavigation = 0
  let lateNightEvents = 0

  for (const visit of visits) {
    const date = new Date(visit.timestamp)
    const hour = date.getUTCHours()
    hours[hour] = (hours[hour] ?? 0) + 1
    const weekdayRow = weekdayHours[date.getUTCDay()]
    if (weekdayRow) weekdayRow[hour] = (weekdayRow[hour] ?? 0) + 1
    if (hour < 6) lateNightEvents++
    const startMs = Math.floor(visit.timestamp / HOUR_MS) * HOUR_MS
    const bucket = occupied.get(startMs) ?? {
      eventCount: 0, domains: new Set<string>(), domainSwitches: 0,
    }
    bucket.eventCount++
    bucket.domains.add(visit.domain)
    occupied.set(startMs, bucket)

    const known = previous !== undefined && visit.order === previous.order + 1
      && visit.timestamp >= previous.timestamp
    const gap = previous === undefined ? 0 : visit.timestamp - previous.timestamp
    const switched = previous !== undefined && visit.domain !== previous.domain
    if (known && previous !== undefined) {
      gaps.push(gap)
      const index = gap < MINUTE_MS ? 0 : gap < 5 * MINUTE_MS ? 1
        : gap < 30 * MINUTE_MS ? 2 : gap < HOUR_MS ? 3 : 4
      gapBuckets[index] = (gapBuckets[index] ?? 0) + 1
      if (switched) {
        domainSwitches++
        bucket.domainSwitches++
        const destinations = transitions.get(previous.domain) ?? new Map<string, number>()
        destinations.set(visit.domain, (destinations.get(visit.domain) ?? 0) + 1)
        transitions.set(previous.domain, destinations)
      } else {
        sameDomainNavigation++
      }
    } else if (previous !== undefined) {
      unknownGaps++
    }

    if (fragment !== undefined && known && gap < thresholdMs) {
      fragment = {
        ...fragment, endOrder: visit.order, endMs: visit.timestamp,
        eventCount: fragment.eventCount + 1,
        observedSpanMs: visit.timestamp - fragment.startMs,
        domainSwitches: fragment.domainSwitches + Number(switched),
        sameDomainNavigation: fragment.sameDomainNavigation + Number(!switched),
      }
    } else {
      if (fragment !== undefined) sessions.push(fragment)
      fragment = {
        startOrder: visit.order, endOrder: visit.order,
        startMs: visit.timestamp, endMs: visit.timestamp, eventCount: 1,
        observedSpanMs: 0, domainSwitches: 0, sameDomainNavigation: 0,
      }
    }
    previous = visit
  }
  if (fragment !== undefined) sessions.push(fragment)
  gaps.sort((a, b) => a - b)
  const hourBuckets = [...occupied].map(([startMs, bucket]) => ({
    startMs, eventCount: bucket.eventCount,
    uniqueDomains: bucket.domains.size, domainSwitches: bucket.domainSwitches,
  })).sort((a, b) => a.startMs - b.startMs)
  const domainTransitions: ActivityDomainTransition[] = []
  for (const [from, destinations] of transitions) {
    for (const [to, count] of destinations) domainTransitions.push({ from, to, count })
  }
  domainTransitions.sort((a, b) => b.count - a.count
    || (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)
    || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0))

  return {
    total: visits.length, sessionGapMinutes, knownPairs: gaps.length, unknownGaps,
    domainSwitches, sameDomainNavigation, gapBuckets,
    gapMedianMs: gaps[Math.max(0, Math.ceil(0.5 * gaps.length) - 1)] ?? null,
    gapP90Ms: gaps[Math.max(0, Math.ceil(0.9 * gaps.length) - 1)] ?? null,
    hours, weekdayHours, hourBuckets,
    denseHours: hourBuckets.map(bucket => ({ startMs: bucket.startMs, count: bucket.eventCount }))
      .sort((a, b) => b.count - a.count || a.startMs - b.startMs).slice(0, 5),
    domainTransitions, lateNightEvents,
    lateNightShare: visits.length ? lateNightEvents / visits.length : 0,
    sessions,
  }
}
