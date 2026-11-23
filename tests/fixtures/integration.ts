import type { HostLocation } from '../../src/model'

/** Public domains and deliberately synthetic values, never personal credentials. */
export const integrationCanaries = [
  'DEMO_TOKEN_123', 'person784@example.com', '+82-10-1234-5678',
  'DEMO_PASS_abc123', 'SESSION_DEMO_12345', 'DEMO_PRIVATE_TITLE_785',
] as const

export function integrationHistory() {
  const records: { url: string; timestamp: string; title: string }[] = []
  const earlier = ['naver.com', 'naver.com', 'github.com', 'naver.com', 'naver.com', 'github.com', 'naver.com']
  for (const [day, domain] of earlier.entries()) {
    records.push({
      url: `https://${domain}/synthetic/b${day}`,
      timestamp: new Date(Date.UTC(2026, 9, 29, 9) + day * 86400000).toISOString(),
      title: '합성 방문',
    })
  }
  for (let day = 0; day < 7; day++) {
    for (let event = 0; event < 3; event++) {
      const domain = day === 6 && event === 2 ? 'example.com' : event === 1 ? 'github.com' : 'naver.com'
      let url = `https://${domain}/synthetic/a${day}-${event}`
      if (day === 0 && event === 0) url = `https://${domain}/?access_token=DEMO_TOKEN_123`
      if (day === 1 && event === 1) url = `https://${domain}/?email=person784%40example.com`
      if (day === 2 && event === 2) url = `https://${domain}/contact/%2B82-10-1234-5678`
      if (day === 3 && event === 0) url = `https://${domain}/?password=DEMO_PASS_abc123`
      if (day === 4 && event === 1) url = `https://${domain}/?session_id=SESSION_DEMO_12345`
      if (day === 5 && event === 0) url = `https://${domain}/?id=42&code=200&key=layout`
      records.push({
        url,
        timestamp: new Date(Date.UTC(2026, 10, 5, 10, event * 5) + day * 86400000).toISOString(),
        title: day === 0 && event === 0 ? 'DEMO_PRIVATE_TITLE_785' : '합성 방문',
      })
    }
  }
  return records
}

export const integrationExpected = {
  total: 28, a: 21, b: 7, aSites: 3, bSites: 2,
  aNaver: 13, aGithub: 7, bNaver: 5, bGithub: 2,
  sessionsAt30: 14, sessionsAt5: 28, switches: 18,
  knownPairs: 27, flagged: 5,
} as const

export const integrationHosts: readonly HostLocation[] = [
  { hostname: 'naver.com', source: 'mock', status: 'resolved', locations: [
    { ip: '223.130.200.104', latitude: 37.57, longitude: 126.98, country: 'South Korea', countryCode: 'KR', region: 'Seoul', accuracyRadiusKm: 5 },
  ] },
  { hostname: 'github.com', source: 'mock', status: 'resolved', locations: [
    { ip: '185.199.108.153', latitude: 40.71, longitude: -74.01, country: 'United States', countryCode: 'US', accuracyRadiusKm: 100 },
  ] },
  { hostname: 'example.com', source: 'mock', status: 'unresolved', locations: [] },
]
