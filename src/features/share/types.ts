/** UTC calendar-day range; endDayExclusive does not include that day. */
export interface SharePeriod {
  readonly startDay: number
  readonly endDayExclusive: number
}

/** No domain or hostname is disclosed by the default contract. */
export interface ShareSite {
  readonly rank: number
  readonly count: number
  readonly share: number
}

export interface SharePeriodSummary {
  readonly period: SharePeriod
  readonly total: number
  readonly uniqueSites: number
  readonly locatedEvents: number
  readonly unlocatedEvents: number
  readonly hours: readonly number[]
  readonly weekdays: readonly number[]
  /** Representative-country event counts, unlike the main country site counts. */
  readonly countries: readonly Readonly<{ code: string; count: number }>[]
}

/** Normalized, exclusion-aware results only. This is not a wire format. */
export interface ShareInput {
  readonly source: 'live' | 'mock'
  readonly period: SharePeriod | null
  readonly total: number
  readonly uniqueSites: number
  readonly locatedSites: number
  readonly locationRate: number
  readonly topSites: readonly ShareSite[]
  readonly hours: readonly number[]
  readonly weekdays: readonly number[]
  /** Unique sites per estimated country; a multi-location site can occur in several. */
  readonly countries: readonly Readonly<{ label: string; count: number }>[]
  readonly comparison: Readonly<{
    sourceTotal: number
    a: SharePeriodSummary
    b: SharePeriodSummary
  }> | null
  readonly activity: Readonly<{
    total: number
    sessionGapMinutes: number
    knownPairs: number
    unknownGaps: number
    domainSwitches: number
    sameDomainNavigation: number
    gapBuckets: readonly number[]
    hours: readonly number[]
    sessions: number
    lateNightEvents: number
  }>
  readonly privacy: Readonly<{
    analysisExcludedCount: number
    shareExcludedCount: number
    rawRecordsIncluded: false
    siteNamesIncluded: false
  }>
}

/** Future implementation output; no generator is supplied in this working copy. */
export interface ShareArtifacts {
  readonly url: string
  readonly qrPng: Blob
  readonly resultPng: Blob
}
