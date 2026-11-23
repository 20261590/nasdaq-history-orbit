import type { HostLocation } from '../model'
import type {
  AnalyticsVisit, BucketChange, ComparisonPeriods, ComparisonReport, ComparisonSelection,
  CountryChange, DayRange, NumericChange, PeriodReport, PeriodResolution, SiteChange,
} from './comparison-types'

export type {
  AnalyticsVisit, BucketChange, ComparisonChanges, ComparisonPeriods, ComparisonReport,
  ComparisonSelection, CountryChange, CountryRow, CoverageWarning, DayRange, NumericChange,
  PeriodCoverage, PeriodReport, PeriodResolution, SiteChange, SiteRow,
} from './comparison-types'

const DAY_MS = 86_400_000
const MAX_DAY = 100_000_000 // Last day representable by a JavaScript Date.
const dayOf = (timestamp: number): number => Math.floor(timestamp / DAY_MS)
const share = (count: number, total: number): number => total ? count / total : 0
const codeOrder = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

function validRange(range: DayRange): boolean {
  return Number.isSafeInteger(range.startDay) && Number.isSafeInteger(range.endDayExclusive)
    && range.startDay >= 0 && range.startDay <= MAX_DAY
    && range.endDayExclusive <= MAX_DAY + 1 && range.endDayExclusive > range.startDay
}

/** Presets use the latest UTC day in the full input, regardless of input order. */
export function resolveComparisonPeriods(
  visits: readonly AnalyticsVisit[], selection: ComparisonSelection,
): PeriodResolution {
  switch (selection.kind) {
    case 'custom':
      return validRange(selection.a) && validRange(selection.b)
        ? { ok: true, periods: { a: selection.a, b: selection.b } }
        : { ok: false, reason: 'invalid-range' }
    case 'days':
    case 'month': {
      if (!visits.length) return { ok: false, reason: 'empty' }
      let anchor = -Infinity
      for (const visit of visits) anchor = Math.max(anchor, dayOf(visit.timestamp))
      if (selection.kind === 'days') {
        const a = { startDay: anchor - selection.days + 1, endDayExclusive: anchor + 1 }
        const b = { startDay: a.startDay - selection.days, endDayExclusive: a.startDay }
        return { ok: true, periods: { a, b } }
      }
      const date = new Date(anchor * DAY_MS)
      const year = date.getUTCFullYear()
      const month = date.getUTCMonth()
      const startDay = Date.UTC(year, month, 1) / DAY_MS
      const monthDays = month === 1
        ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
        : ([3, 5, 8, 10].includes(month) ? 30 : 31)
      return { ok: true, periods: {
        a: { startDay, endDayExclusive: Math.min(startDay + monthDays, MAX_DAY + 1) },
        b: { startDay: Date.UTC(year, month - 1, 1) / DAY_MS, endDayExclusive: startDay },
      } }
    }
    default: return selection satisfies never
  }
}

type CountryCount = { count: number; label: string }
type PeriodCounts = {
  total: number
  locatedEvents: number
  readonly hours: number[]
  readonly weekdays: number[]
  readonly sites: Map<string, number>
  readonly countries: Map<string, CountryCount>
  readonly observedDays: Set<number>
}

function periodCounts(): PeriodCounts {
  return {
    total: 0, locatedEvents: 0, hours: Array<number>(24).fill(0),
    weekdays: Array<number>(7).fill(0), sites: new Map(),
    countries: new Map(), observedDays: new Set(),
  }
}

function finishPeriod(
  counts: PeriodCounts, range: DayRange, inputMinDay: number | null, inputMaxDay: number | null,
): PeriodReport {
  const sites = [...counts.sites].sort((a, b) => b[1] - a[1] || codeOrder(a[0], b[0]))
    .map(([domain, count], index) => ({
      domain, rank: index + 1, count, share: share(count, counts.total),
    }))
  const countries = [...counts.countries].sort((a, b) => b[1].count - a[1].count || codeOrder(a[0], b[0]))
    .map(([code, country]) => ({
      code, label: country.label, count: country.count,
      shareAllEvents: share(country.count, counts.total),
      shareLocatedEvents: share(country.count, counts.locatedEvents),
    }))
  const warnings: PeriodReport['coverage']['warnings'][number][] = ['history-completeness-unknown']
  if (!counts.total) warnings.push('no-observed-events')
  if (inputMinDay !== null && range.startDay < inputMinDay) warnings.push('before-input')
  if (inputMaxDay !== null && range.endDayExclusive > inputMaxDay + 1) warnings.push('after-input')
  if (counts.observedDays.size < range.endDayExclusive - range.startDay) warnings.push('unobserved-days')
  return {
    range, total: counts.total, dailyAverage: counts.total / (range.endDayExclusive - range.startDay),
    uniqueSites: counts.sites.size, hours24: counts.hours, weekdays7: counts.weekdays, sites,
    locatedEvents: counts.locatedEvents, unlocatedEvents: counts.total - counts.locatedEvents,
    countries, coverage: {
      inputMinDay, inputMaxDay, observedDays: counts.observedDays.size, warnings,
    },
  }
}

function numericChange(a: number, b: number): NumericChange {
  return { absolute: a - b, relative: b === 0 ? null : (a - b) / b }
}

function bucketChanges(
  a: readonly number[], b: readonly number[], totalA: number, totalB: number,
): readonly BucketChange[] {
  return a.map((count, index) => ({
    countDelta: count - (b[index] ?? 0),
    shareDelta: share(count, totalA) - share(b[index] ?? 0, totalB),
  }))
}

/** Counts each eligible visit in each selected half-open period, including overlaps. */
export function computeComparison(
  visits: readonly AnalyticsVisit[], hosts: readonly HostLocation[], periods: ComparisonPeriods,
): ComparisonReport {
  const hostCountries = new Map<string, { readonly code: string; readonly label: string }>()
  for (const host of hosts) {
    const first = host.locations[0]
    if (host.status === 'resolved' && first
      && /^[A-Z]{2}$/u.test(first.countryCode) && first.countryCode !== 'XX') {
      hostCountries.set(host.hostname, { code: first.countryCode, label: first.country.trim() || first.countryCode })
    }
  }
  const aCounts = periodCounts()
  const bCounts = periodCounts()
  let min = Infinity
  let max = -Infinity
  for (const visit of visits) {
    const day = dayOf(visit.timestamp)
    min = Math.min(min, day)
    max = Math.max(max, day)
    const date = new Date(visit.timestamp)
    const country = hostCountries.get(visit.hostname)
    for (const [range, counts] of [[periods.a, aCounts], [periods.b, bCounts]] satisfies readonly (readonly [DayRange, PeriodCounts])[]) {
      if (day < range.startDay || day >= range.endDayExclusive) continue
      counts.total++
      counts.observedDays.add(day)
      const hour = date.getUTCHours()
      const weekday = date.getUTCDay()
      counts.hours[hour] = (counts.hours[hour] ?? 0) + 1
      counts.weekdays[weekday] = (counts.weekdays[weekday] ?? 0) + 1
      counts.sites.set(visit.domain, (counts.sites.get(visit.domain) ?? 0) + 1)
      if (country) {
        counts.locatedEvents++
        const previous = counts.countries.get(country.code)
        counts.countries.set(country.code, {
          count: (previous?.count ?? 0) + 1,
          label: previous && codeOrder(previous.label, country.label) < 0 ? previous.label : country.label,
        })
      }
    }
  }
  const inputMinDay = visits.length ? min : null
  const inputMaxDay = visits.length ? max : null
  const a = finishPeriod(aCounts, periods.a, inputMinDay, inputMaxDay)
  const b = finishPeriod(bCounts, periods.b, inputMinDay, inputMaxDay)
  const aSites = new Map(a.sites.map(site => [site.domain, site]))
  const bSites = new Map(b.sites.map(site => [site.domain, site]))
  const siteChanges: SiteChange[] = [...new Set([...aSites.keys(), ...bSites.keys()])]
    .map(domain => {
      const siteA = aSites.get(domain)
      const siteB = bSites.get(domain)
      return {
        domain, rankA: siteA?.rank ?? null, rankB: siteB?.rank ?? null,
        rankDelta: siteA && siteB ? siteB.rank - siteA.rank : null,
        countA: siteA?.count ?? 0, countB: siteB?.count ?? 0,
        countDelta: (siteA?.count ?? 0) - (siteB?.count ?? 0),
        shareA: siteA?.share ?? 0, shareB: siteB?.share ?? 0,
        shareDelta: (siteA?.share ?? 0) - (siteB?.share ?? 0),
      }
    }).sort((left, right) =>
      (left.rankA ?? Infinity) - (right.rankA ?? Infinity)
      || (left.rankB ?? Infinity) - (right.rankB ?? Infinity)
      || codeOrder(left.domain, right.domain))
  const aCountries = new Map(a.countries.map(country => [country.code, country]))
  const bCountries = new Map(b.countries.map(country => [country.code, country]))
  const countries: CountryChange[] = [...new Set([...aCountries.keys(), ...bCountries.keys()])]
    .sort(codeOrder).map(code => {
      const countryA = aCountries.get(code)
      const countryB = bCountries.get(code)
      return {
        code, label: countryA && countryB
          ? (codeOrder(countryA.label, countryB.label) <= 0 ? countryA.label : countryB.label)
          : countryA?.label ?? countryB?.label ?? code,
        countDelta: (countryA?.count ?? 0) - (countryB?.count ?? 0),
        shareAllEventsDelta: (countryA?.shareAllEvents ?? 0) - (countryB?.shareAllEvents ?? 0),
        shareLocatedEventsDelta: (countryA?.shareLocatedEvents ?? 0) - (countryB?.shareLocatedEvents ?? 0),
      }
    })
  return {
    periods, a, b,
    changes: {
      total: numericChange(a.total, b.total),
      dailyAverage: numericChange(a.dailyAverage, b.dailyAverage),
      uniqueSites: numericChange(a.uniqueSites, b.uniqueSites),
      hours24: bucketChanges(a.hours24, b.hours24, a.total, b.total),
      weekdays7: bucketChanges(a.weekdays7, b.weekdays7, a.total, b.total),
      countries,
    },
    siteChanges,
  }
}
