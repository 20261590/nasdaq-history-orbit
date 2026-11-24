import type { GeoLocation, HostLocation, Visit } from '../../../shared/types'

// MOCK coordinates are explicit storytelling fixtures, never claims about these services.
const MOCK = [
  { hostname: 'www.naver.com', latitude: 37.5665, longitude: 126.978,
    country: 'South Korea', countryCode: 'KR', region: 'Seoul', city: 'Seoul' },
  { hostname: 'www.daum.net', latitude: 35.1796, longitude: 129.0756,
    country: 'South Korea', countryCode: 'KR', region: 'Busan', city: 'Busan' },
  { hostname: 'www.kaist.ac.kr', latitude: 36.3504, longitude: 127.3845,
    country: 'South Korea', countryCode: 'KR', region: 'Daejeon', city: 'Daejeon' },
  { hostname: 'www.samsung.com', latitude: 37.2636, longitude: 127.0286,
    country: 'South Korea', countryCode: 'KR', region: 'Gyeonggi-do', city: 'Suwon' },
  { hostname: 'github.com', latitude: 37.7749, longitude: -122.4194,
    country: 'United States', countryCode: 'US', region: 'California', city: 'San Francisco' },
  { hostname: 'developer.mozilla.org', latitude: 38.9072, longitude: -77.0369,
    country: 'United States', countryCode: 'US', region: 'District of Columbia', city: 'Washington' },
  { hostname: 'www.bbc.co.uk', latitude: 51.5074, longitude: -0.1278,
    country: 'United Kingdom', countryCode: 'GB', region: 'England', city: 'London' },
  { hostname: 'www.wikipedia.org', latitude: 52.3676, longitude: 4.9041,
    country: 'Netherlands', countryCode: 'NL', region: 'North Holland', city: 'Amsterdam' },
  { hostname: 'www.spiegel.de', latitude: 52.52, longitude: 13.405,
    country: 'Germany', countryCode: 'DE', region: 'Berlin', city: 'Berlin' },
  { hostname: 'www.yahoo.co.jp', latitude: 35.6762, longitude: 139.6503,
    country: 'Japan', countryCode: 'JP', region: 'Tokyo', city: 'Tokyo' },
  { hostname: 'www.gov.sg', latitude: 1.3521, longitude: 103.8198,
    country: 'Singapore', countryCode: 'SG', region: 'Singapore', city: 'Singapore' },
  { hostname: 'www.iisc.ac.in', latitude: 12.9716, longitude: 77.5946,
    country: 'India', countryCode: 'IN', region: 'Karnataka', city: 'Bengaluru' },
] as const

/** Only the listed MOCK hosts receive fixtures; every other host remains explicitly unresolved. */
export function createMockHosts(visits: readonly Visit[]): readonly HostLocation[] {
  const fixtures = new Map<string, GeoLocation>(MOCK.map(({ hostname, ...location }) => [
    hostname, { ...location, accuracyRadiusKm: null, organization: 'MOCK fixture' },
  ]))
  return [...new Set(visits.map((visit) => visit.hostname))].sort().map((hostname) => {
    const location = fixtures.get(hostname)
    return {
      hostname, locations: location ? [location] : [],
      status: location ? 'resolved' : 'unresolved', source: 'mock',
    }
  })
}
