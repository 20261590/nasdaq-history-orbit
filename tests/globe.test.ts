import { describe, expect, it } from 'vitest'
import { makeArcs, makeMarkers } from '../src/features/globe'
import type { HostLocation, Visit } from '../src/shared/types'

const visit = (hostname: string, order: number): Visit => ({
  id: `${order}`, hostname, domain: hostname, timestamp: order * 1000, order,
})
const hosts: readonly HostLocation[] = [
  { hostname: 'a.com', status: 'resolved', source: 'mock', locations: [{ latitude: 37, longitude: 127, country: 'South Korea', countryCode: 'KR', accuracyRadiusKm: null }] },
  { hostname: 'b.com', status: 'resolved', source: 'mock', locations: [{ latitude: 40, longitude: -74, country: 'United States', countryCode: 'US', accuracyRadiusKm: null }] },
  { hostname: 'unknown.com', status: 'failed', source: 'mock', locations: [] },
]
describe('faithful globe connections', () => {
  it('connects adjacent known events in chronological direction', () => {
    expect(makeArcs([visit('a.com', 0), visit('b.com', 1)], hosts)).toEqual([{ startLat: 37, startLng: 127, endLat: 40, endLng: -74 }])
  })
  it('never bridges an unresolved event or a sampled order gap', () => {
    expect(makeArcs([visit('a.com', 0), visit('unknown.com', 1), visit('b.com', 2)], hosts)).toEqual([])
    expect(makeArcs([visit('a.com', 0), visit('b.com', 2)], hosts)).toEqual([])
  })
  it('preserves separate locations and an unknown gap for hosts on the same site', () => {
    const day = Date.UTC(2024, 0, 1)
    const visits: readonly Visit[] = [
      { id: 'kr', hostname: 'kr.a.example', domain: 'a.example', timestamp: day, order: 0 },
      { id: 'unknown', hostname: 'unknown.a.example', domain: 'a.example', timestamp: day + 1000, order: 1 },
      { id: 'us', hostname: 'us.a.example', domain: 'a.example', timestamp: day + 2000, order: 2 },
    ]
    const locations: readonly HostLocation[] = [
      { hostname: 'kr.a.example', status: 'resolved', source: 'live', locations: [
        { latitude: 37.57, longitude: 126.98, country: 'South Korea', countryCode: 'KR', accuracyRadiusKm: 10 },
      ] },
      { hostname: 'unknown.a.example', status: 'unresolved', source: 'live', locations: [] },
      { hostname: 'us.a.example', status: 'resolved', source: 'live', locations: [
        { latitude: 40.72, longitude: -74.01, country: 'United States', countryCode: 'US', accuracyRadiusKm: 5 },
      ] },
    ]

    expect(makeArcs(visits, locations)).toEqual([])
    expect(makeMarkers(locations, [{
      domain: 'a.example', count: 3, share: 1, hostnames: visits.map(visit => visit.hostname),
    }], '').map(marker => [marker.lat, marker.lng])).toEqual([[37.57, 126.98], [40.72, -74.01]])
  })
  it('aggregates colocated sites while keeping selection and total visits', () => {
    const colocated = [...hosts, { ...hosts[0], hostname: 'c.com', status: 'resolved' as const, source: 'mock' as const, locations: hosts[0]?.locations ?? [] }]
    const markers = makeMarkers(colocated, [
      { domain: 'a.com', hostnames: ['a.com'], count: 3, share: .6 },
      { domain: 'c.com', hostnames: ['c.com'], count: 2, share: .4 },
    ], 'c.com')
    expect(markers).toEqual([{ lat: 37, lng: 127, domains: ['a.com', 'c.com'], count: 5, radius: 0.3 + Math.log2(6) * 0.1, color: '#f5cb82' }])
  })
})
