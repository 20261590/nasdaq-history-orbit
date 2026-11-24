import { describe, expect, it } from 'vitest'
import { filterVisits, parseHistory, sampleTimeline } from '../src/features/history'

describe('history import', () => {
  it.each([
    { format: 'array', input: [{ url: 'https://news.bbc.co.uk/a', timestamp: 1_700_000_000 }] },
    { format: 'history', input: { history: [{ url: 'https://news.bbc.co.uk/a', lastVisitTime: 1_700_000_000_000 }] } },
    { format: 'takeout', input: { 'Browser History': [{ url: 'https://news.bbc.co.uk/a', time_usec: '1700000000000000' }] } },
  ])('parses $format timestamps and distinguishes hostname from domain', ({ input, format }) => {
    const result = parseHistory(input)
    expect(result).toMatchObject({ format, rejected: 0, duplicates: 0 })
    expect(result.visits).toEqual([{
      id: 'visit-0', hostname: 'news.bbc.co.uk', domain: 'bbc.co.uk',
      timestamp: 1_700_000_000_000, order: 0, url: 'https://news.bbc.co.uk/a',
    }])
  })

  it('sorts chronologically while preserving local identity and raw IDN URL', () => {
    const result = parseHistory([
      { id: 'later', title: 'Reading', url: 'HTTPS://B\u00dcCHER.DE./guide', visitTime: '2025-01-02T00:00:00+09:00' },
      { id: 42, url: 'https://a.github.io/a', timestamp: '2025-01-01T12:00:00Z' },
      { id: 'duplicate', url: 'https://a.github.io/a', timestamp: 1_735_732_800 },
    ])
    expect(result.duplicates).toBe(1)
    expect(result.visits).toEqual([
      { id: '42', hostname: 'a.github.io', domain: 'a.github.io',
        timestamp: 1_735_732_800_000, order: 0, url: 'https://a.github.io/a' },
      { id: 'later', title: 'Reading', hostname: 'xn--bcher-kva.de', domain: 'xn--bcher-kva.de',
        timestamp: Date.UTC(2025, 0, 1, 15), order: 1, url: 'HTTPS://B\u00dcCHER.DE./guide' },
    ])
  })

  it.each([
    'file:///tmp/a', 'chrome://history', 'https://localhost/', 'https://printer.local/',
    'http://10.1.2.3/', 'http://127.1/', 'https://[::1]/', 'https://[fc00::1]/',
    'https://[::ffff:192.168.1.1]/', 'http://192.0.2.1/', 'https://router.internal/',
    'https://[2001:db8::1]/', 'https://intranet/', 'https://home.arpa/', 'not a url',
  ])('rejects non-public or invalid URL %s', (url) => {
    expect(parseHistory([{ url, timestamp: 1_700_000_000 }])).toMatchObject({
      visits: [], rejected: 1, duplicates: 0,
    })
  })

  it.each(['', 'tomorrow', '2025-02-30T00:00:00Z', -1, Infinity, 9e15, null])(
    'rejects invalid timestamp %s', (timestamp) => {
      expect(parseHistory([{ url: 'https://google.com/', timestamp }]).rejected).toBe(1)
    },
  )

  it('retains public IP URLs and rejects malformed records without losing valid visits', () => {
    const result = parseHistory([null, {}, { url: 'https://8.8.8.8/', timestamp: 1_700_000_000 }])
    expect(result.rejected).toBe(2)
    expect(result.visits.map((visit) => visit.hostname)).toEqual(['8.8.8.8'])
  })

  it('bounds processing at 100000 rows without inspecting the tail', () => {
    const rows = Array<unknown>(100_002).fill({ url: 'https://google.com/', timestamp: 1_700_000_000 })
    Object.defineProperty(rows, 100_000, { get: () => { throw new RangeError('tail was inspected') } })
    expect(parseHistory({ history: rows })).toMatchObject({ rejected: 2, duplicates: 99_999 })
  })

  it('filters inclusive dates and samples endpoints without renumbering sorted indices', () => {
    const { visits } = parseHistory(Array.from({ length: 10 }, (_, index) => ({
      url: `https://google.com/${index}`, timestamp: 1_700_000_000 + 9 - index,
    })))
    const filtered = filterVisits(visits, 1_700_000_002_000, 1_700_000_007_000)
    expect(filtered.map((visit) => visit.order)).toEqual([2, 3, 4, 5, 6, 7])
    expect(sampleTimeline(filtered, 3).map((visit) => visit.order)).toEqual([2, 3, 7])
    expect(sampleTimeline(visits, 6).map((visit) => visit.order)).toEqual([0, 1, 4, 5, 8, 9])
    expect(sampleTimeline(visits, 0)).toEqual([])
    expect(sampleTimeline(visits, 1).map((visit) => visit.order)).toEqual([0])
    expect(filterVisits(visits, 2, 1)).toEqual([])
  })
})
