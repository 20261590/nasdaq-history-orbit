import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocationEngine } from '../src/features/geolocation'
import { parseHistory } from '../src/features/history'

afterEach(() => vi.unstubAllGlobals())

describe('multi-address location evidence', () => {
  it.each([false, true])('retains country diversity and metadata in deterministic IP order, reversed=%s', async (reverse) => {
    let releaseA: () => void = () => { throw new Error('Deferred not initialized') }
    const aaaaReceived = new Promise<void>((resolve) => { releaseA = resolve })
    const payloads = [
      { ip: '168.126.63.1', latitude: '37.5701', longitude: '127.0171', country: 'South Korea',
        country_code: 'KR', city: 'Jongno-gu', region: 'Seoul', accuracy: 5,
        asn: 4766, organization_name: 'Korea Telecom' },
      { ip: '8.8.8.8', latitude: '37.751', longitude: '-97.822', country: 'United States',
        country_code: 'US', accuracy: 1000, asn: 15169, organization_name: 'Google LLC' },
      { ip: '2001:4860:4860::8888', latitude: '37.751', longitude: '-97.822', country: 'United States',
        country_code: 'US', accuracy: 1000, asn: 15169, organization_name: 'Google LLC' },
    ]
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url)
      if (url.hostname === 'dns.google') {
        const ipv4 = ['168.126.63.1', '8.8.8.8']
        if (url.searchParams.get('type') === 'A') {
          await aaaaReceived
          return Response.json({ Status: 0, Answer: (reverse ? [...ipv4].reverse() : ipv4)
            .map(ip => ({ name: 'example.com.', type: 1, data: ip })) })
        }
        releaseA()
        return Response.json({ Status: 0, Answer: [
          { name: 'example.com.', type: 28, data: '2001:4860:4860::8888' },
        ] })
      }
      const ip = decodeURIComponent(url.pathname.slice('/v1/ip/geo/'.length, -'.json'.length))
      const payload = payloads.find(value => value.ip === ip)
      return payload ? Response.json(payload) : new Response(null, { status: 404 })
    }))
    const { visits } = parseHistory([{ url: 'https://example.com/history', timestamp: 1_700_000_000 }])

    const results = await new LocationEngine().resolve(visits, {
      signal: new AbortController().signal,
    })

    expect(results[0]?.locations).toEqual([
      { ip: '8.8.8.8', latitude: 37.751, longitude: -97.822, country: 'United States', countryCode: 'US',
        accuracyRadiusKm: 1000, asn: '15169', organization: 'Google LLC' },
      { ip: '168.126.63.1', latitude: 37.5701, longitude: 127.0171, country: 'South Korea', countryCode: 'KR',
        city: 'Jongno-gu', region: 'Seoul', accuracyRadiusKm: 5, asn: '4766', organization: 'Korea Telecom' },
      { ip: '2001:4860:4860::8888', latitude: 37.751, longitude: -97.822,
        country: 'United States', countryCode: 'US', accuracyRadiusKm: 1000, asn: '15169',
        organization: 'Google LLC' },
    ])
  })
})
