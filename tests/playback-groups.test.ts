import { describe, expect, it } from 'vitest'
import { makeArcs, playbackGroup } from '../src/features/globe'
import { parseHistory, sampleTimeline } from '../src/features/history'
import type { HostLocation } from '../src/shared/types'

describe('proven consecutive playback grouping', () => {
  it('summarizes a large same-site run before advancing without changing original visits', () => {
    const visits = parseHistory(Array.from({ length: 1000 }, (_, index) => ({
      url: 'https://naver.com/synthetic', timestamp: 1767571200000 + index * 1000,
    }))).visits
    const sample = sampleTimeline(visits, 800)
    const group = playbackGroup(visits, sample, 0)
    expect(group?.count).toBe(1000)
    expect(group?.sampleEnd).toBe(799)
    expect(group?.representative).toBe(visits[999])
    expect(group?.startTime).toBe(1767571200000)
    expect(visits[999]?.timestamp).toBe(1767572199000)
    expect(visits.length).toBe(1000)
  })
  it('does not group across a rejected chronological slot or a different hostname', () => {
    const visits = parseHistory([
      { url: 'https://naver.com/1', timestamp: 1767571200000 },
      { url: 'file:///private', timestamp: 1767571201000 },
      { url: 'https://naver.com/2', timestamp: 1767571202000 },
      { url: 'https://github.com', timestamp: 1767571203000 },
      { url: 'https://naver.com/3', timestamp: 1767571204000 },
    ]).visits
    expect(playbackGroup(visits, visits, 0)?.count).toBe(1)
    expect(playbackGroup(visits, visits, 1)?.count).toBe(1)
    expect(playbackGroup(visits, visits, 2)?.count).toBe(1)
  })
  it('does not create an arc between sampled destinations that omit an intervening site', () => {
    const visits = parseHistory(['naver.com', 'github.com', 'daum.net'].map((host, index) => ({
      url: `https://${host}`, timestamp: 1767571200000 + index * 1000,
    }))).visits
    const sample = sampleTimeline(visits, 2)
    const hosts: readonly HostLocation[] = ['naver.com', 'github.com', 'daum.net'].map((hostname, index) => ({
      hostname, source: 'mock', status: 'resolved', locations: [{
        latitude: 30 + index, longitude: 120 + index, country: 'Synthetic', countryCode: 'XX', accuracyRadiusKm: null,
      }],
    }))
    playbackGroup(visits, sample, 0)
    expect(makeArcs(sample, hosts)).toEqual([])
    expect(makeArcs(visits, hosts)).toHaveLength(2)
  })
})
