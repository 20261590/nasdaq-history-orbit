import { describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  formatUtcPeriod,
  parseShareFragment,
} from '../src/features/share/codec'
import { generateQrPng } from '../src/features/share/artifacts'
import type { ShareInput } from '../src/features/share/types'

const sampleInput: ShareInput = {
  source: 'live',
  period: { startDay: 20400, endDayExclusive: 20407 },
  total: 120,
  uniqueSites: 18,
  locatedSites: 15,
  locationRate: 0.833,
  topSites: [
    { rank: 1, count: 40, share: 0.333 },
    { rank: 2, count: 25, share: 0.208 },
  ],
  hours: Array.from({ length: 24 }, (_, h) => (h === 22 ? 30 : 4)),
  weekdays: [10, 20, 15, 25, 20, 15, 15],
  countries: [
    { label: 'South Korea', count: 10 },
    { label: 'United States', count: 5 },
  ],
  comparison: null,
  activity: {
    total: 120,
    sessionGapMinutes: 30,
    knownPairs: 100,
    unknownGaps: 5,
    domainSwitches: 42,
    sameDomainNavigation: 58,
    gapBuckets: [30, 20, 10, 5],
    hours: Array.from({ length: 24 }, (_, h) => (h === 22 ? 30 : 4)),
    sessions: 14,
    lateNightEvents: 18,
  },
  privacy: {
    analysisExcludedCount: 3,
    shareExcludedCount: 2,
    rawRecordsIncluded: false,
    siteNamesIncluded: false,
  },
}

describe('share codec and artifacts', () => {
  it('encodes and decodes ShareInput via URL fragment', () => {
    const url = buildShareUrl(sampleInput, 'https://example.com/orbit/')
    const hash = new URL(url).hash
    const decoded = parseShareFragment(hash)

    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.data).toEqual(sampleInput)
    }
  })

  it('rejects unsupported versions and corrupted payloads', () => {
    expect(parseShareFragment('#v=99&d=abc').ok).toBe(false)
    expect(parseShareFragment('#v=1&d=!!!invalid!!!').ok).toBe(false)
    expect(parseShareFragment('#v=1').ok).toBe(false)
  })

  it('formats UTC period excluding endDayExclusive', () => {
    expect(formatUtcPeriod({ startDay: 20400, endDayExclusive: 20401 })).toBe(
      '2025-11-08 (UTC)',
    )
    expect(formatUtcPeriod(null)).toBe('기간 정보 없음')
  })

  it('generates QR PNG blob', async () => {
    const url = buildShareUrl(sampleInput, 'https://example.com/orbit/')
    const blob = await generateQrPng(url)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(100)
  })
})
