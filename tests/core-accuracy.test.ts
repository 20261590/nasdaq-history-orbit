import { describe, expect, it } from 'vitest'
import { parseHistory } from '../src/features/history'
import { parseDns } from '../src/features/geolocation'
import { makeArcs } from '../src/features/globe'
import type { HostLocation } from '../src/shared/types'

describe('import accuracy regressions', () => {
  it.each([false, true])('does not bridge an uninspected tail event, overCap=%s', overCap => {
    const rows = Array.from({ length: 100_000 }, (_, index) => ({
      url: `https://${index % 2 ? 'b' : 'a'}.example.com/${index}`,
      timestamp: 1_700_000_000_000 + index * 1000,
    }))
    if (overCap) rows.push({ url: 'https://omitted.example.com', timestamp: 1_700_000_000_500 })
    const locations: readonly HostLocation[] = [
      { hostname: 'a.example.com', source: 'mock', status: 'resolved', locations: [
        { latitude: 37, longitude: 127, country: 'South Korea', countryCode: 'KR', accuracyRadiusKm: null },
      ] },
      { hostname: 'b.example.com', source: 'mock', status: 'resolved', locations: [
        { latitude: 40, longitude: -74, country: 'United States', countryCode: 'US', accuracyRadiusKm: null },
      ] },
    ]
    const result = parseHistory(rows)
    expect(makeArcs(result.visits.slice(0, 2), locations)).toHaveLength(overCap ? 0 : 1)
    expect(result.visits).toHaveLength(100_000)
    expect(result.rejected).toBe(overCap ? 1 : 0)
  })
  it.each([
    { time_usec: '9007199254741999' },
    { time_usec: '9007199254741999.5' },
  ])('truncates decimal microseconds before converting to milliseconds: %#', (fields) => {
    const result = parseHistory([{ url: 'https://google.com/', ...fields }])
    expect(result.visits.map(visit => visit.timestamp)).toEqual([9_007_199_254_741])
  })

  it.each([
    { time_usec: 9_007_199_254_742_000 },
    { time_usec: '2025-01-01T00:00:00Z' },
    { timestamp: '1'.repeat(400) },
    { timestamp: '2025-01-01T24:00:00Z' },
    { timestamp: '2025-01-01T00:00:00+24:00' },
    { timestamp: '2025-01-01T00:00:00' },
  ])('rejects unsafe numbers and unsupported timestamp forms: %#', (fields) => {
    const result = parseHistory([{ url: 'https://google.com/', ...fields }])
    expect(result).toMatchObject({ visits: [], rejected: 1 })
  })

  it.each([
    { fields: { time_usec: '0' }, expected: 0 },
    { fields: { time_usec: '1700000000123456' }, expected: 1_700_000_000_123 },
    { fields: { timestamp: 0 }, expected: 0 },
    { fields: { timestamp: 1_700_000_000.125 }, expected: 1_700_000_000_125 },
    { fields: { lastVisitTime: 1_700_000_000_123 }, expected: 1_700_000_000_123 },
    { fields: { timestamp: '2025-01-01T00:30:00+09:00' }, expected: Date.UTC(2024, 11, 31, 15, 30) },
    { fields: { timestamp: '2025-01-01T00:30:00-04:30' }, expected: Date.UTC(2025, 0, 1, 5) },
  ])('preserves the documented epoch and UTC-offset contracts: %#', ({ fields, expected }) => {
    const result = parseHistory([{ url: 'https://google.com/', ...fields }])
    expect(result.visits.map(visit => visit.timestamp)).toEqual([expected])
  })

  it.each([false, true])('retains a known skipped timestamp in sorted chronology, reversed=%s', (reverse) => {
    const rows = [
      { url: 'https://google.com/a', timestamp: 1_700_000_000 },
      { url: 'file:///local', timestamp: 1_700_000_001 },
      { url: 'https://apple.com/b', timestamp: 1_700_000_002 },
      { url: 'https://naver.com/c', timestamp: 1_700_000_003 },
    ]
    const result = parseHistory(reverse ? [...rows].reverse() : rows)
    expect(result.visits.map(visit => visit.order)).toEqual([0, 2, 3])
    expect(result.rejected).toBe(1)
  })

  it('does not claim adjacency when a rejected row has no placeable timestamp', () => {
    const result = parseHistory([
      { url: 'https://google.com/a', timestamp: 1_700_000_000 },
      { url: 'https://naver.com/b', timestamp: 'malformed' },
      { url: 'https://apple.com/c', timestamp: 1_700_000_002 },
    ])
    expect(result.visits.map(visit => visit.order)).toEqual([0, 2])
    expect(result.rejected).toBe(1)
  })
})

describe('DNS representative determinism', () => {
  it.each([false, true])('sorts canonical addresses independently of RR order, reversed=%s', (reverse) => {
    const answers = [
      { name: 'google.com.', type: 28, data: '2606:4700:4700::1111' },
      { name: 'google.com.', type: 1, data: '8.8.8.8' },
      { name: 'google.com.', type: 1, data: '1.1.1.1' },
      { name: 'google.com.', type: 28, data: '2001:4860:4860::8888' },
    ]
    expect(parseDns({ Status: 0, Answer: reverse ? [...answers].reverse() : answers })).toEqual([
      '1.1.1.1', '8.8.8.8', '2001:4860:4860::8888', '2606:4700:4700::1111',
    ])
  })
})
