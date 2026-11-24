import type { Visit } from '../../../shared/types'

export type AnalyticsVisit = Readonly<Pick<Visit, 'order' | 'hostname' | 'domain' | 'timestamp'>>
export type DayRange = Readonly<{ startDay: number; endDayExclusive: number }>
export type ComparisonSelection =
  | Readonly<{ kind: 'days'; days: 7 | 30 }>
  | Readonly<{ kind: 'month' }>
  | Readonly<{ kind: 'custom'; a: DayRange; b: DayRange }>
export type ComparisonPeriods = Readonly<{ a: DayRange; b: DayRange }>
export type PeriodResolution =
  | Readonly<{ ok: true; periods: ComparisonPeriods }>
  | Readonly<{ ok: false; reason: 'empty' | 'invalid-range' }>

export type CoverageWarning =
  | 'history-completeness-unknown'
  | 'no-observed-events'
  | 'before-input'
  | 'after-input'
  | 'unobserved-days'
export type PeriodCoverage = Readonly<{
  inputMinDay: number | null
  inputMaxDay: number | null
  observedDays: number
  warnings: readonly CoverageWarning[]
}>
export type SiteRow = Readonly<{ domain: string; rank: number; count: number; share: number }>
export type CountryRow = Readonly<{
  code: string
  label: string
  count: number
  shareAllEvents: number
  shareLocatedEvents: number
}>
export type PeriodReport = Readonly<{
  range: DayRange
  total: number
  dailyAverage: number
  uniqueSites: number
  hours24: readonly number[]
  weekdays7: readonly number[]
  sites: readonly SiteRow[]
  locatedEvents: number
  unlocatedEvents: number
  countries: readonly CountryRow[]
  coverage: PeriodCoverage
}>
export type NumericChange = Readonly<{ absolute: number; relative: number | null }>
export type BucketChange = Readonly<{ countDelta: number; shareDelta: number }>
export type CountryChange = Readonly<{
  code: string
  label: string
  countDelta: number
  shareAllEventsDelta: number
  shareLocatedEventsDelta: number
}>
export type SiteChange = Readonly<{
  domain: string
  rankA: number | null
  rankB: number | null
  rankDelta: number | null
  countA: number
  countB: number
  countDelta: number
  shareA: number
  shareB: number
  shareDelta: number
}>
export type ComparisonChanges = Readonly<{
  total: NumericChange
  dailyAverage: NumericChange
  uniqueSites: NumericChange
  hours24: readonly BucketChange[]
  weekdays7: readonly BucketChange[]
  countries: readonly CountryChange[]
}>
export type ComparisonReport = Readonly<{
  periods: ComparisonPeriods
  a: PeriodReport
  b: PeriodReport
  changes: ComparisonChanges
  siteChanges: readonly SiteChange[]
}>
