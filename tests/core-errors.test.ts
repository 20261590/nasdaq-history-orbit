import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocationEngine } from '../src/features/geolocation'
import { parseHistory } from '../src/features/history'

const validDns = () => Response.json({
  Status: 0, Answer: [{ name: 'google.com.', type: 1, data: '8.8.8.8' }],
})
const validGeo = () => Response.json({
  ip: '8.8.8.8', latitude: '37', longitude: '-122', country: 'United States', country_code: 'US',
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('safe per-host lookup diagnostics', () => {
  it.each([
    { name: 'NXDOMAIN', dns: () => Response.json({ Status: 3 }), geo: validGeo, expected: 'DNS status 3' },
    { name: 'DNS schema', dns: () => Response.json({ Status: '0' }), geo: validGeo, expected: 'Malformed DNS response' },
    { name: 'DNS HTTP', dns: () => new Response(null, { status: 429 }), geo: validGeo, expected: 'DNS A: HTTP 429' },
    { name: 'DNS network', dns: () => { throw new TypeError('private-history-url') }, geo: validGeo,
      expected: 'TypeError: network/CORS failure' },
    { name: 'DNS JSON', dns: () => new Response('not json'), geo: validGeo, expected: 'Malformed JSON response' },
    { name: 'Geo HTTP', dns: validDns, geo: () => new Response(null, { status: 503 }), expected: 'GeoJS: HTTP 503' },
    { name: 'Geo unavailable', dns: validDns,
      geo: () => Response.json({ latitude: 'nil', longitude: 'nil', ip: '8.8.8.8' }),
      expected: 'Malformed or unavailable GeoJS location' },
  ])('classifies $name without leaking history or fabricating locations', async ({ dns, geo, expected }) => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) =>
      new URL(request.url).hostname === 'dns.google' ? dns() : geo()))
    const { visits } = parseHistory([{ url: 'https://google.com/private-history-url', timestamp: 1_700_000_000 }])
    const results = await new LocationEngine().resolve(visits, { signal: new AbortController().signal })
    expect(results).toMatchObject([{ status: 'failed', locations: [], source: 'live' }])
    expect(results[0]?.error).toContain(expected)
    expect(results[0]?.error).not.toContain('private-history-url')
    expect(results[0]?.error).not.toContain('https://')
  })

  it('classifies the configured ky timeout with no retry or fabricated location', async () => {
    vi.useFakeTimers()
    let started: () => void = () => { throw new Error('Deferred not initialized') }
    const reached = new Promise<void>((resolve) => { started = resolve })
    const transport = vi.fn(async (request: Request) => {
      started()
      return new Promise<Response>((_, reject) => request.signal.addEventListener('abort',
        () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    })
    vi.stubGlobal('fetch', transport)
    const { visits } = parseHistory([{ url: 'https://8.8.8.8/', timestamp: 1_700_000_000 }])
    const run = new LocationEngine().resolve(visits, { signal: new AbortController().signal })
    await reached
    await vi.advanceTimersByTimeAsync(8001)
    expect(await run).toMatchObject([{ status: 'failed', locations: [], error: 'GeoJS: TimeoutError' }])
    expect(transport).toHaveBeenCalledTimes(1)
  })
})
