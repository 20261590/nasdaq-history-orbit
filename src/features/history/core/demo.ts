const MOCK_HOSTNAMES = [
  'www.naver.com', 'www.daum.net', 'www.kaist.ac.kr', 'www.samsung.com',
  'github.com', 'developer.mozilla.org', 'www.bbc.co.uk', 'www.wikipedia.org',
  'www.spiegel.de', 'www.yahoo.co.jp', 'www.gov.sg', 'www.iisc.ac.in',
  'unmapped-history.dev', 'unknown-orbit.org',
] as const

export function createDemoHistory(): unknown {
  return {
    history: Array.from({ length: 420 }, (_, index) => ({
      id: `mock-${index}`,
      url: `https://${MOCK_HOSTNAMES[index % MOCK_HOSTNAMES.length]}/reading/${index % 23}`,
      title: `MOCK reading ${index + 1}`,
      timestamp: Date.UTC(2025, 2, 3) + index * 3_600_000,
    })),
  }
}
