import { describe, expect, it } from 'vitest'
import { createDemoHistory, createMockHosts } from '../src/core/demo'
import { parseHistory } from '../src/core/history'
import { computeStatistics } from '../src/core/stats'
import type { GeoLocation, HostLocation } from '../src/model'

const seoul: GeoLocation = {
  latitude: 37.5665, longitude: 126.978, country: 'South Korea', countryCode: 'KR',
  region: 'Seoul', accuracyRadiusKm: null,
}
const busan: GeoLocation = { ...seoul, latitude: 35.18, longitude: 129.07, region: 'Busan' }
const usa: GeoLocation = {
  latitude: 37, longitude: -122, country: 'United States', countryCode: 'US', accuracyRadiusKm: null,
}

describe('statistics domain attribution', () => {
  it('retains unresolved visits, aggregates subdomains and counts UTC time buckets', () => {
    const { visits } = parseHistory([
      { url: 'https://news.google.com/a', timestamp: '2025-01-05T23:30:00-05:00' },
      { url: 'https://mail.google.com/a', timestamp: '2025-01-06T04:30:00Z' },
      { url: 'https://naver.com/a', timestamp: '2025-01-07T01:00:00Z' },
      { url: 'https://unlocated.dev/a', timestamp: '2025-01-08T22:00:00Z' },
    ])
    const hosts: readonly HostLocation[] = [
      { hostname: 'news.google.com', locations: [seoul, seoul, usa], status: 'resolved', source: 'live' },
      { hostname: 'mail.google.com', locations: [busan], status: 'resolved', source: 'live' },
      { hostname: 'naver.com', locations: [seoul], status: 'resolved', source: 'live' },
      { hostname: 'unlocated.dev', locations: [], status: 'failed', source: 'live' },
      { hostname: 'ignored.com', locations: [usa], status: 'resolved', source: 'live' },
    ]
    const stats = computeStatistics(visits, hosts)
    expect(stats).toMatchObject({
      total: 4, uniqueSites: 3, locatedSites: 2, locationRate: 2 / 3,
      start: Date.UTC(2025, 0, 6, 4, 30), end: Date.UTC(2025, 0, 8, 22),
      weekdays: [0, 2, 1, 1, 0, 0, 0],
      countries: [{ label: 'South Korea', count: 2 }, { label: 'United States', count: 1 }],
      koreanRegions: [{ label: 'Seoul', count: 2 }, { label: 'Busan', count: 1 }],
      sites: [
        { domain: 'google.com', count: 2, share: 0.5, hostnames: ['mail.google.com', 'news.google.com'] },
        { domain: 'naver.com', count: 1, share: 0.25, hostnames: ['naver.com'] },
        { domain: 'unlocated.dev', count: 1, share: 0.25, hostnames: ['unlocated.dev'] },
      ],
    })
    expect(stats.hours).toEqual(Array.from({ length: 24 }, (_, hour) =>
      hour === 4 ? 2 : hour === 1 || hour === 22 ? 1 : 0))
  })

  it('returns finite empty statistics and retains all unlocated site denominators', () => {
    expect(computeStatistics([], [])).toEqual({
      total: 0, uniqueSites: 0, locatedSites: 0, locationRate: 0, start: 0, end: 0,
      sites: [], weekdays: Array(7).fill(0), hours: Array(24).fill(0),
      countries: [], koreanRegions: [],
    })
    const { visits } = parseHistory([{ url: 'https://unlocated.dev', timestamp: 1_700_000_000 }])
    expect(computeStatistics(visits, [])).toMatchObject({
      total: 1, uniqueSites: 1, locatedSites: 0, locationRate: 0,
      countries: [], koreanRegions: [],
    })
  })

  it('uses deterministic explicit MOCK fixtures across continents and preserves unknown hosts', () => {
    const result = parseHistory(createDemoHistory())
    const hosts = createMockHosts(result.visits)
    const stats = computeStatistics(result.visits, hosts)
    expect(result).toMatchObject({ rejected: 0, duplicates: 0 })
    expect(stats).toMatchObject({ total: 420, uniqueSites: 14, locatedSites: 12, locationRate: 12 / 14 })
    expect(hosts.filter((host) => host.status === 'unresolved').map((host) => host.hostname))
      .toEqual(['unknown-orbit.org', 'unmapped-history.dev'])
    expect(new Set(hosts.map((host) => host.source))).toEqual(new Set(['mock']))
    expect(stats.countries.map((country) => country.label).sort()).toEqual([
      'Germany', 'India', 'Japan', 'Netherlands', 'Singapore', 'South Korea', 'United Kingdom', 'United States',
    ])
    expect(result.visits[0]).toMatchObject({
      id: 'mock-0', url: 'https://www.naver.com/reading/0', timestamp: Date.UTC(2025, 2, 3),
    })
    expect(result.visits.at(-1)).toMatchObject({
      id: 'mock-419', url: 'https://unknown-orbit.org/reading/5',
      timestamp: Date.UTC(2025, 2, 20, 11),
    })
    expect(createMockHosts(parseHistory([{ url: 'https://newsite.com', timestamp: 1_700_000_000 }]).visits))
      .toEqual([{ hostname: 'newsite.com', locations: [], status: 'unresolved', source: 'mock' }])
  })
})
