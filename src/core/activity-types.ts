import type { Visit } from '../model'

export type ActivityVisit = Readonly<Pick<Visit, 'order' | 'hostname' | 'domain' | 'timestamp'>>
export type ActivityOptions = Readonly<{ sessionGapMinutes: number }>

/** Observed event span only; no trailing timeout or inferred dwell time. */
export interface ActivitySession {
  readonly startOrder: number
  readonly endOrder: number
  readonly startMs: number
  readonly endMs: number
  readonly eventCount: number
  readonly observedSpanMs: number
  readonly domainSwitches: number
  readonly sameDomainNavigation: number
}

export interface ActivityHourBucket {
  readonly startMs: number
  readonly eventCount: number
  readonly uniqueDomains: number
  /** Known switches attributed to the arrival event, including cross-hour/session edges. */
  readonly domainSwitches: number
}

export interface ActivityDomainTransition {
  readonly from: string
  readonly to: string
  readonly count: number
}

export interface ActivityDenseHour {
  readonly startMs: number
  readonly count: number
}

export interface ActivityReport {
  readonly total: number
  readonly sessionGapMinutes: number
  readonly knownPairs: number
  readonly unknownGaps: number
  /** All known pairs, including those split by the session threshold. */
  readonly domainSwitches: number
  readonly sameDomainNavigation: number
  /** [0,1m), [1,5m), [5,30m), [30,60m), [60m,infinity). */
  readonly gapBuckets: readonly number[]
  readonly gapMedianMs: number | null
  readonly gapP90Ms: number | null
  /** UTC event frequencies: 24 hours, and 7 Sunday-first rows of 24 hours. */
  readonly hours: readonly number[]
  readonly weekdayHours: readonly (readonly number[])[]
  /** Only occupied UTC date-hours, ascending by startMs. */
  readonly hourBuckets: readonly ActivityHourBucket[]
  /** Top five occupied hours: count descending, then startMs ascending. */
  readonly denseHours: readonly ActivityDenseHour[]
  /** Directed different-domain edges: count descending, then from/to code-unit order. */
  readonly domainTransitions: readonly ActivityDomainTransition[]
  readonly lateNightEvents: number
  /** Fraction of events in UTC 00:00 through 05:59; zero for empty input. */
  readonly lateNightShare: number
  /** Split edges are excluded from these fragments' navigation/switch counts. */
  readonly sessions: readonly ActivitySession[]
}
