import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHashSearchResponse, searchHashes } from '../../src/features/security/safe-browsing/client'
import { SafeBrowsingError } from '../../src/features/security/safe-browsing/types'

const fullHash = btoa('A'.repeat(32))
const prefix = btoa('A'.repeat(4))
const secondPrefix = btoa('B'.repeat(4))
const signal = new AbortController().signal

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('hash search transport', () => {
  it('sends only base64 prefixes to the v5 JSON endpoint with origin-only referrer', async () => {
    const transport = vi.fn(async (request: Request) => {
      const url = new URL(request.url)
      expect(url.origin + url.pathname).toBe('https://safebrowsing.googleapis.com/v5/hashes:search')
      expect(url.searchParams.get('alt')).toBe('json')
      expect(url.searchParams.getAll('hashPrefixes')).toEqual([prefix, secondPrefix])
      expect(request.headers.get('X-Goog-Api-Key')).toBe('private-key')
      expect(request.method).toBe('GET')
      expect(request.credentials).toBe('omit')
      expect(request.referrerPolicy).toBe('strict-origin-when-cross-origin')
      expect(request.redirect).toBe('error')
      expect(request.url).not.toContain('private-key')
      return Response.json({ cacheDuration: '3.123456789s', fullHashes: [] })
    })
    vi.stubGlobal('fetch', transport)

    const reply = await searchHashes([prefix, secondPrefix, prefix], 'private-key', signal)

    expect(reply).toEqual({ matches: [], cacheDurationMs: 3123.456789 })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('discards unknown or non-enforceable details while retaining supported threats', () => {
    const reply = parseHashSearchResponse({
      cacheDuration: '60s',
      futureField: 'ignored',
      fullHashes: [{ fullHash, futureField: 42, fullHashDetails: [
        { threatType: 'MALWARE', attributes: [] },
        { threatType: 'SOCIAL_ENGINEERING', attributes: ['NEW_ATTRIBUTE'] },
        { threatType: 'FUTURE_THREAT', attributes: [] },
        { threatType: 'UNWANTED_SOFTWARE', attributes: ['CANARY'] },
        { threatType: 'POTENTIALLY_HARMFUL_APPLICATION', attributes: ['FRAME_ONLY'] },
        { threatType: 'MALWARE', attributes: ['THREAT_ATTRIBUTE_UNSPECIFIED'] },
      ] }],
    })
    expect(reply).toEqual({
      cacheDurationMs: 60_000,
      matches: [{ fullHash, threats: ['MALWARE'] }],
    })
  })

  it('accepts omitted protobuf repeated fields as empty evidence', () => {
    expect(parseHashSearchResponse({
      cacheDuration: '0s', fullHashes: [{ fullHash }],
    })).toEqual({ cacheDurationMs: 0, matches: [] })
  })

  it.each([
    { cacheDuration: undefined, fullHashes: [] },
    { cacheDuration: '1.1234567890s', fullHashes: [] },
    { cacheDuration: '-1s', fullHashes: [] },
    { cacheDuration: '1s', fullHashes: [{ fullHash: prefix, fullHashDetails: [] }] },
    { cacheDuration: '1s', fullHashes: [{ fullHash, fullHashDetails: 'invalid' }] },
    { cacheDuration: '1s', fullHashes: {} },
  ])('rejects malformed response data without trusting an empty result', payload => {
    expect(() => parseHashSearchResponse(payload)).toThrow(new SafeBrowsingError('INVALID_RESPONSE'))
  })

  it.each([
    [400, 'AUTH'], [401, 'AUTH'], [403, 'AUTH'], [429, 'RATE_LIMITED'], [503, 'NETWORK'],
  ] as const)('classifies HTTP %i without leaking the server body', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('https://private.example/path?secret=1 private-key', { status })))
    const error = await searchHashes([prefix], 'private-key', signal)
      .then(() => undefined, cause => cause)
    expect(error).toBeInstanceOf(SafeBrowsingError)
    expect(error).toMatchObject({ code, httpStatus: status })
    expect(JSON.stringify(error)).not.toContain('private-key')
    expect(String(error)).not.toContain('private.example')
  })

  it('converts malformed JSON and network failures into bounded error codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json')))
    await expect(searchHashes([prefix], 'private-key', signal)).rejects
      .toMatchObject({ code: 'INVALID_RESPONSE' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('private-key https://private.example') }))
    const error = await searchHashes([prefix], 'private-key', signal)
      .then(() => undefined, cause => cause)
    expect(error).toMatchObject({ code: 'NETWORK' })
    expect(String(error)).not.toContain('private-key')
  })

  it('does not dispatch when key or prefix is invalid', async () => {
    const transport = vi.fn()
    vi.stubGlobal('fetch', transport)
    await expect(searchHashes([prefix], ' ', signal)).rejects.toMatchObject({ code: 'KEY_REQUIRED' })
    await expect(searchHashes(['invalid'], 'private-key', signal))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(transport).not.toHaveBeenCalled()
  })

  it('does not retry the configured 10 second timeout', async () => {
    vi.useFakeTimers()
    let started: () => void = () => { throw new Error('uninitialized') }
    const requestStarted = new Promise<void>(resolve => { started = resolve })
    const transport = vi.fn(async (request: Request) => {
      started()
      return new Promise<Response>((_, reject) => request.signal.addEventListener(
        'abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    })
    vi.stubGlobal('fetch', transport)
    const run = searchHashes([prefix], 'private-key', signal)
    const result = run.then(() => undefined, cause => cause)
    await requestStarted
    await vi.advanceTimersByTimeAsync(10_001)
    expect(await result).toMatchObject({ code: 'NETWORK' })
    expect(transport).toHaveBeenCalledTimes(1)
  })
})
