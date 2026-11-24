import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocationEngine } from '../src/features/geolocation'
import type { LookupProgress, Visit } from '../src/shared/types'

function visitsFor(...hostnames: string[]): readonly Visit[] {
  return hostnames.map((hostname, order) => ({
    id: String(order), hostname, domain: hostname, timestamp: 1_700_000_000_000, order,
    url: `https://${hostname}/private-history`,
  }))
}

function deferred() {
  let resolve: () => void = () => { throw new Error('Deferred not initialized') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function dns(name: string, ip = '8.8.8.8'): Response {
  return Response.json({ Status: 0, Answer: [{ name, type: ip.includes(':') ? 28 : 1, data: ip }] })
}

function geo(ip: string): Response {
  return Response.json({
    ip, latitude: '37.5', longitude: '127', country: 'South Korea', country_code: 'KR',
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('LocationEngine real HTTP adapter', () => {
  it('prioritizes frequent hosts, uses private A/AAAA queries and caches shared IP work', async () => {
    const requests: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url)
      requests.push(url)
      if (url.hostname === 'dns.google' && url.pathname === '/resolve'
        && url.searchParams.get('edns_client_subnet') === '0.0.0.0/0') {
        return dns(url.searchParams.get('name') ?? '')
      }
      if (url.hostname === 'get.geojs.io') return geo('8.8.8.8')
      return new Response(null, { status: 400 })
    }))
    const engine = new LocationEngine(1)
    const progress: LookupProgress[] = []
    const visits = visitsFor('apple.com', 'zillow.com', 'zillow.com')
    const results = await engine.resolve(visits, {
      signal: new AbortController().signal, onProgress: (value) => progress.push(value),
    })
    expect(results.map((host) => [host.hostname, host.status, host.locations.length]))
      .toEqual([['zillow.com', 'resolved', 1], ['apple.com', 'resolved', 1]])
    expect(requests[0]?.searchParams.get('name')).toBe('zillow.com')
    expect(requests.filter((url) => url.hostname === 'dns.google').map((url) => url.searchParams.get('type')))
      .toEqual(['A', 'AAAA', 'A', 'AAAA'])
    expect(requests.filter((url) => url.hostname === 'get.geojs.io')).toHaveLength(1)
    expect(progress).toEqual([
      { total: 2, completed: 0, resolved: 0, failed: 0 },
      { total: 2, completed: 1, resolved: 1, failed: 0 },
      { total: 2, completed: 2, resolved: 2, failed: 0 },
    ])
    await engine.resolve(visits, { signal: new AbortController().signal })
    expect(requests).toHaveLength(5)
  })

  it('bounds active HTTP requests and deduplicates IP work across concurrent hosts', async () => {
    const reached = deferred()
    const gate = deferred()
    let active = 0
    let peak = 0
    let geoRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      active++
      peak = Math.max(peak, active)
      if (active === 3) reached.resolve()
      await gate.promise
      const url = new URL(request.url)
      active--
      if (url.hostname === 'dns.google') return dns(url.searchParams.get('name') ?? '')
      geoRequests++
      return geo('8.8.8.8')
    }))
    const engine = new LocationEngine(3)
    const run = engine.resolve(visitsFor(...Array.from({ length: 8 }, (_, i) => `site${i}.com`)), {
      signal: new AbortController().signal,
    })
    await reached.promise
    expect(active).toBe(3)
    gate.resolve()
    const results = await run
    expect(results.filter((host) => host.status === 'resolved')).toHaveLength(8)
    expect(peak).toBe(3)
    expect(geoRequests).toBe(1)
  })

  it.each(['localhost', 'router.local', 'bad.invalid', 'google.com:443', 'google.com/a', '127.0.0.1', '::1'])(
    'rejects unsafe hostname %s at the public method boundary', async (hostname) => {
      const transport = vi.fn()
      vi.stubGlobal('fetch', transport)
      const results = await new LocationEngine().resolve(visitsFor(hostname), {
        signal: new AbortController().signal,
      })
      expect(results).toMatchObject([{ hostname, status: 'failed', locations: [], source: 'live' }])
      expect(transport).not.toHaveBeenCalled()
    },
  )

  it('isolates failures, caches failed outcomes and retries only failed host/IP entries', async () => {
    let healthy = false
    let requests = 0
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      requests++
      const url = new URL(request.url)
      if (url.hostname === 'dns.google') {
        const name = url.searchParams.get('name') ?? ''
        return dns(name, name === 'apple.com' ? '8.8.8.8' : '1.1.1.1')
      }
      if (url.pathname.includes('8.8.8.8') && !healthy) return new Response(null, { status: 503 })
      return geo(url.pathname.includes('8.8.8.8') ? '8.8.8.8' : '1.1.1.1')
    }))
    const engine = new LocationEngine()
    const visits = visitsFor('apple.com', 'zillow.com')
    const options = { signal: new AbortController().signal }
    expect((await engine.resolve(visits, options)).map((host) => host.status)).toEqual(['failed', 'resolved'])
    expect(requests).toBe(6)
    healthy = true
    expect((await engine.resolve(visits, options)).map((host) => host.status)).toEqual(['failed', 'resolved'])
    expect(requests).toBe(6)
    expect((await engine.resolve(visits, { ...options, retryFailed: true })).map((host) => host.status))
      .toEqual(['resolved', 'resolved'])
    expect(requests).toBe(9)
  })

  it('returns completed hosts on cancellation and does not cache aborted lookups as failures', async () => {
    let blocking = true
    let aborted = 0
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url)
      if (url.hostname === 'dns.google') {
        const name = url.searchParams.get('name') ?? ''
        if (name === 'zillow.com' && blocking) {
          await new Promise<void>((_, reject) => request.signal.addEventListener('abort', () => {
            aborted++
            reject(new DOMException('Aborted', 'AbortError'))
          }, { once: true }))
        }
        return dns(name)
      }
      return geo('8.8.8.8')
    }))
    const engine = new LocationEngine(3)
    const controller = new AbortController()
    const results = await engine.resolve(visitsFor('apple.com', 'apple.com', 'zillow.com'), {
      signal: controller.signal, onHost: () => controller.abort(),
    })
    expect(results.map((host) => host.hostname)).toEqual(['apple.com'])
    expect(aborted).toBe(2)
    blocking = false
    expect(await engine.resolve(visitsFor('zillow.com'), { signal: new AbortController().signal }))
      .toMatchObject([{ hostname: 'zillow.com', status: 'resolved' }])
  })

  it('keeps shared lookups alive when just one concurrent caller cancels', async () => {
    const reached = deferred()
    const gate = deferred()
    let requests = 0
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      requests++
      reached.resolve()
      await gate.promise
      const url = new URL(request.url)
      return url.hostname === 'dns.google' ? dns('apple.com') : geo('8.8.8.8')
    }))
    const engine = new LocationEngine()
    const controller = new AbortController()
    const first = engine.resolve(visitsFor('apple.com'), { signal: controller.signal })
    const second = engine.resolve(visitsFor('apple.com'), { signal: new AbortController().signal })
    await reached.promise
    controller.abort()
    expect(await first).toEqual([])
    gate.resolve()
    expect(await second).toMatchObject([{ hostname: 'apple.com', status: 'resolved' }])
    expect(requests).toBe(3)
  })

  it.each([false, true])('retains all valid address locations and rejects IP mismatch=%s', async (mismatch) => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url)
      if (url.hostname === 'dns.google') return dns('apple.com',
        url.searchParams.get('type') === 'A' ? '8.8.8.8' : '2606:4700:4700::1111')
      return geo(mismatch || url.pathname.includes('8.8.8.8') ? '8.8.8.8' : '2606:4700:4700::1111')
    }))
    const results = await new LocationEngine().resolve(visitsFor('apple.com'), {
      signal: new AbortController().signal,
    })
    expect(results[0]?.status).toBe('resolved')
    expect(results[0]?.locations.map((location) => location.ip))
      .toEqual(mismatch ? ['8.8.8.8'] : ['8.8.8.8', '2606:4700:4700::1111'])
  })
})
