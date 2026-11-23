export const stops = {
  seoul: { hostname: 'naver.com', latitude: 37.5665, longitude: 126.978, country: 'South Korea', countryCode: 'KR', region: 'Seoul' },
  busan: { hostname: 'daum.net', latitude: 35.1796, longitude: 129.0756, country: 'South Korea', countryCode: 'KR', region: 'Busan' },
  tokyo: { hostname: 'yahoo.co.jp', latitude: 35.6762, longitude: 139.6503, country: 'Japan', countryCode: 'JP', region: 'Tokyo' },
  america: { hostname: 'github.com', latitude: 40.7128, longitude: -74.006, country: 'United States', countryCode: 'US', region: 'New York' },
} as const
export type Stop = keyof typeof stops

export function motionHistory(route: readonly Stop[]) {
  return route.map((name, index) => ({
    url: `https://${stops[name].hostname}/synthetic`,
    timestamp: new Date(Date.UTC(2026, 0, 5) + index * 60000).toISOString(),
  }))
}

export function expectedPoint(name: Stop) {
  return stops[name]
}
