import type { Distribution, GeoLocation, HostLocation, Statistics, Visit } from '../../../shared/types'

function distribution(groups: ReadonlyMap<string, ReadonlySet<string>>): readonly Distribution[] {
  return [...groups].map(([label, domains]) => ({ label, count: domains.size }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Counts are unique domains per bucket; a multi-location domain can occur in several buckets. */
export function computeStatistics(visits: readonly Visit[], hosts: readonly HostLocation[]): Statistics {
  const sites = new Map<string, { count: number; readonly hostnames: Set<string> }>()
  const locations = new Map<string, readonly GeoLocation[]>()
  for (const host of hosts) {
    switch (host.status) {
      case 'resolved':
        locations.set(host.hostname, [...locations.get(host.hostname) ?? [], ...host.locations])
        break
      case 'failed':
      case 'unresolved':
        break
      default: host.status satisfies never
    }
  }
  const weekdays = Array<number>(7).fill(0)
  const hours = Array<number>(24).fill(0)
  let start = Infinity
  let end = -Infinity
  for (const visit of visits) {
    const site = sites.get(visit.domain) ?? { count: 0, hostnames: new Set<string>() }
    site.count++
    site.hostnames.add(visit.hostname)
    sites.set(visit.domain, site)
    const date = new Date(visit.timestamp)
    const weekday = date.getUTCDay()
    const hour = date.getUTCHours()
    weekdays[weekday] = (weekdays[weekday] ?? 0) + 1
    hours[hour] = (hours[hour] ?? 0) + 1
    start = Math.min(start, visit.timestamp)
    end = Math.max(end, visit.timestamp)
  }
  const located = new Set<string>()
  const countries = new Map<string, Set<string>>()
  const regions = new Map<string, Set<string>>()
  for (const [domain, site] of sites) {
    for (const hostname of site.hostnames) {
      for (const location of locations.get(hostname) ?? []) {
        located.add(domain)
        const country = countries.get(location.country) ?? new Set<string>()
        country.add(domain)
        countries.set(location.country, country)
        if (location.countryCode === 'KR' && location.region?.trim()) {
          const region = regions.get(location.region) ?? new Set<string>()
          region.add(domain)
          regions.set(location.region, region)
        }
      }
    }
  }
  return {
    total: visits.length, uniqueSites: sites.size, locatedSites: located.size,
    locationRate: sites.size ? located.size / sites.size : 0,
    start: visits.length ? start : 0, end: visits.length ? end : 0,
    sites: [...sites].map(([domain, site]) => ({
      domain, count: site.count, share: site.count / visits.length,
      hostnames: [...site.hostnames].sort(),
    })).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain)),
    weekdays, hours, countries: distribution(countries), koreanRegions: distribution(regions),
  }
}
