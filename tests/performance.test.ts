import { describe, expect, it } from 'vitest'
import { parseHistory, sampleTimeline } from '../src/features/history'
import { computeStatistics } from '../src/features/analytics'
import type { HostLocation } from '../src/shared/types'

const hosts: readonly HostLocation[] = Array.from({ length: 10 }, (_, index) => ({
  hostname: `site${index}.com`, status: index < 6 ? 'resolved' : 'unresolved', source: 'mock',
  locations: index < 6 ? [{
    latitude: 37, longitude: 127, country: index < 3 ? 'South Korea' : 'United States',
    countryCode: index < 3 ? 'KR' : 'US', region: 'Seoul', accuracyRadiusKm: null,
  }] : [],
}))

describe('full history aggregate scale', () => {
  it.each([100, 1000, 10_000, 50_000])(
    'preserves exact totals and bounded timeline samples for %i visits', (size) => {
      const input = Array.from({ length: size }, (_, index) => ({
        url: `https://site${index % 10}.com/page/${index}`,
        timestamp: Date.UTC(2025, 0, 6) + index * 1000,
      }))
      const start = performance.now()
      const parsed = parseHistory(input)
      const stats = computeStatistics(parsed.visits, hosts)
      const sample = sampleTimeline(parsed.visits, 512)
      const elapsedMs = performance.now() - start
      console.info(JSON.stringify({ visits: size, elapsedMs: Math.round(elapsedMs), sampled: sample.length }))
      expect(parsed).toMatchObject({ rejected: 0, duplicates: 0 })
      expect(stats).toMatchObject({
        total: size, uniqueSites: 10, locatedSites: 6, locationRate: 0.6,
        start: Date.UTC(2025, 0, 6), end: Date.UTC(2025, 0, 6) + (size - 1) * 1000,
        weekdays: [0, size, 0, 0, 0, 0, 0],
        countries: [{ label: 'South Korea', count: 3 }, { label: 'United States', count: 3 }],
        koreanRegions: [{ label: 'Seoul', count: 3 }],
      })
      expect(stats.sites.map((site) => site.count)).toEqual(Array(10).fill(size / 10))
      expect(stats.sites.reduce((sum, site) => sum + site.count, 0)).toBe(size)
      expect(stats.hours).toEqual(Array.from({ length: 24 }, (_, hour) =>
        Math.max(0, Math.min(3600, size - hour * 3600))))
      expect(sample).toHaveLength(Math.min(size, 512))
      expect(sample[0]?.order).toBe(0)
      expect(sample.at(-1)?.order).toBe(size - 1)
      expect(new Set(sample.map((visit) => visit.id)).size).toBe(Math.min(size, 512))
      expect(sample.slice(1).every((visit, index) => visit.order > (sample[index]?.order ?? -1))).toBe(true)
    }, 15_000,
  )
})
